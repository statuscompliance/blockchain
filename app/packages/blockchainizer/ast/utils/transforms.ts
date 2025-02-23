import { basename, dirname, extname, join } from 'node:path';
import { CodeBlockWriter, ModuleKind, Node, SourceFile, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { type IBaseChaincodeAST, getProject, writeModifiedHTML, writeASTToFile } from './base.ts';
import { extractDefinitionFromHTML, extractLogic } from './extractors.ts';
import { _temporary_filename } from './shared.ts';
import { rmSync } from 'node:fs';

/**
 * Replaces a node with a new one, safely checking if the node has a parent
 * and avoiding errors when replacing nodes with different kinds.
 */
function replaceNodeSafely(node: Node, replacement: string) {
  const parent = node.getParent();

  if (parent) {
    parent.replaceWithText(replacement);
  }
}

/**
 * 1. Replaces NODE-RED calls with their JavaScript equivalent (recursively).
 * Examples:
 * -  `this.send(msg)` -> `return msg`
 * -  `this.error("Error message")` -> `throw new Error("Error message")`
 * 2. Maps the statement's text, so it can be written to the function.
 * @param statement - The statement to transform
 */
function transformFunctionStatements(statement: Node): void {
  if (statement.isKind(SyntaxKind.ExpressionStatement)) {
    const expression = statement.getExpression().asKind(SyntaxKind.CallExpression);

    if (expression) {
      const callee = expression.getExpression();
      const arguments_ = expression.getArguments()[0]?.getText();

      switch (callee.getText()) {
        case 'this.done':
        case 'this.send': {
          replaceNodeSafely(expression, `return ${arguments_};`);
          return;
        }
        case 'this.error': {
          replaceNodeSafely(expression, `console.error(${arguments_});`);
          return;
        }
        case 'this.warn': {
          replaceNodeSafely(expression, `console.warn(${arguments_});`);
          return;
        }
        case 'this.log': {
          replaceNodeSafely(expression, `console.log(${arguments_});`);
          return;
        }
        case 'this.debug': {
          replaceNodeSafely(expression, `console.debug(${arguments_});`);
          return;
        }
        case 'this.trace': {
          replaceNodeSafely(expression, `console.trace(${arguments_});`);
          return;
        }
      }
    }
  }
}

/**
 * Transforms the logic of the node that has been copied over to the chaincode
 * into chaincode-compatible logic, stripping all node-red specific syntax
 */
export function transformLogic(source: Node): void {
  for (const node of source.getDescendantStatements()) {
    if (!node.wasForgotten()) {
      transformLogic(node);
      transformFunctionStatements(node);
    }
  }
}

/**
 * Puts the extracted logic with the *extractLogic* function into the chaincode
 */
export function addNodeLogicToChaincode(
  targetAst: IBaseChaincodeAST,
  extractedLogic: ReturnType<typeof extractLogic>
): void {
  const statementsToAppend: (Node | string)[] = [];

  for (const handler in extractedLogic.handlers) {
    for (const node of extractedLogic.handlers[handler]) {
      const inner_function_statements = node
        .asKind(SyntaxKind.FunctionExpression)
        ?.getBody()
        .asKindOrThrow(SyntaxKind.Block)
        .getStatements();

      if (!inner_function_statements) {
        throw new Error('Unexpected syntax found in a input handler');
      }

      switch (handler) {
        case 'input': {
          statementsToAppend.push(...inner_function_statements);
          break;
        }
        case 'close': {
          const writer = new CodeBlockWriter();

          writer.writeLine('this._cleanups.add(');
          writer.write('(removed = true, done = () => {}) =>');
          writer.block(() => {
            for (const stmt of inner_function_statements) {
              writer.writeLine(stmt.getFullText().trim());
            }
          });
          writer.write(');');
          statementsToAppend.push(writer.toString());
          break;
        }
        default: {
          throw new Error(`Unexpected handler found: ${handler}`);
        }
      }
    }
  }

  targetAst.body.addStatements([
    ...extractedLogic.body.map(n => n.getFullText().trim()),
    ...statementsToAppend.map(n => typeof n === 'string' ? n : n.getFullText().trim())
  ]);
}

/**
 * Transforms CJS requires to ES6 imports and return those nodes
 */
export function convertRequiresToImports(cjsAST: SourceFile, chaincode: IBaseChaincodeAST): void {
  const requires = cjsAST
    .getDescendants()
    .filter(node =>
      node.isKind(SyntaxKind.CallExpression)
      && node.getExpression().getText() === 'require'
    );

  for (const requireCall of requires) {
    const declaration = requireCall.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (!declaration) continue;

    const modulePath = requireCall
      .asKindOrThrow(SyntaxKind.CallExpression)
      .getArguments()[0]
      .getText().replaceAll(/['"]/g, '');
    const variableName = declaration.getName();

    chaincode.source.addImportDeclaration({
      moduleSpecifier: modulePath,
      defaultImport: variableName
    });

    declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.remove();
  }
}

/**
 * Finds all references to the given node in the source file
 * This covers cases like:
 * ```
 * const var2 = var;
 * const var3 = var2;
 * ```
 * where var2 and var3 are references to var. var in this case would be the
 * second parameter that you pass to this function.
 */
function findReferences(source: Node, target: Node): Node[] {
  const symbol = target.getSymbol();

  const references = source
    .getDescendants()
    .filter((node) => {
      if (!node.isKind(SyntaxKind.Identifier)) {
        return false;
      }

      /**
       * There are some cases where the getSymbol method throws an error
       * due to (what I believe) is a bug in TypeScript.
       * TODO: This is a workaround to avoid the error for now, but investigate
       * further and report upstream in case it's needed.
       */
      try {
        const referenceSymbol = node.getSymbol();

        return referenceSymbol && (referenceSymbol === symbol
          || referenceSymbol.getAliasedSymbol() === symbol);
      } catch {
        return false;
      }
    });

  return source
    .getDescendants()
    .filter((node) => {
      if (!node.isKind(SyntaxKind.VariableDeclaration)) return false;

      const initializer = node.getInitializer();
      if (!initializer) return false;

      return references.some(reference =>
        initializer.getText() === reference.getText()
      );
    });
}

/**
 * Removes the Node-RED specific statements from the source file (declarations like
 * RED.nodes.createNode, RED.nodes.registerType, etc.)
 *
 * Reassignments to this (like `var node = this`) will be also removed.
 */
export function removeREDStatements(source: Node): void {
  for (const node of source
    .getDescendants()
    .filter(node =>
      node.isKind(SyntaxKind.CallExpression)
      && node.getText().startsWith('RED.nodes.')
    )) {
    const statement = node.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
    if (statement) {
      statement.remove();
    }
  }

  const nodeThis = source
    .getDescendants()
    .find(node =>
      (
        node.isKind(SyntaxKind.VariableDeclaration)
        || node.isKind(SyntaxKind.VariableDeclarationList)
      ) && node.getText().endsWith('this')
    )?.asKindOrThrow(SyntaxKind.VariableDeclarationList);

  if (nodeThis) {
    for (const declaration of nodeThis.getDeclarations()) {
      const variableName = declaration.getName();
      const otherReferences = findReferences(source, nodeThis);
      declaration.remove();

      const nodeReferences = source
        .getDescendants()
        .filter(node =>
          node.isKind(SyntaxKind.Identifier)
          && node.getText().startsWith(variableName)
        );

      for (const reference of [...nodeReferences, ...otherReferences]) {
        reference.replaceWithText('this');
      }

      for (const node of otherReferences) {
        const statement = node.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);

        if (statement) {
          statement.remove();
        }
      }
    }
  }
}

/**
 * Updates the name of the node in the `RED.nodes.registerType` call.
 * @returns - The AST of the `RED.nodes.registerType` call
 */
function updateNodeNameInRegistration(source: Node, identifier: string) {
  const registerCall = source
    .getDescendants()
    .findLast(node =>
      node.isKind(SyntaxKind.CallExpression)
      && node.getText().startsWith('RED.nodes.registerType')
    )
    ?.asKindOrThrow(SyntaxKind.CallExpression);

  if (!registerCall) {
    throw new Error('RED.nodes.registerType not found');
  }

  /**
   * Modifies the argument to append the identifier to the node name
   */
  const firstArgument = registerCall.getArguments()[0];
  const originalValue = firstArgument.getText().replaceAll(/['"]/g, '');
  firstArgument.replaceWithText(`'${originalValue}-${identifier}'`);

  return registerCall;
}

/**
 * Modifies the name and category of the new nodes, so they're easily identifiable
 * in the Node-RED's UI.
 *
 * @param script - The raw string of the node registration script
 * @returns
 */
function transformNodeRegistrationScript(script: string, identifier: string) {
  const project = getProject({ module: ModuleKind.CommonJS });
  const source = project.createSourceFile(_temporary_filename, script);
  const registerCall = updateNodeNameInRegistration(source, identifier);

  /**
   * Modifies the category of the node to be the value of identifier
   */
  const secondArgument = registerCall.getArguments()[1].asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
  const categoryProperty = secondArgument.getProperty('category')
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer();

  if (categoryProperty) {
    categoryProperty.replaceWithText(`'${identifier}'`);
  } else {
    secondArgument.addPropertyAssignment({
      name: 'category',
      initializer: `'${identifier}'`
    });
  }

  return source.getFullText();
}

/**
 * Adds a suffix to a file name while preserving its directory path and extension.
 *
 * @param filePath - The full path of the file including name and extension
 * @param suffix - The suffix to append to the file name before the extension
 * @returns The new file path with the suffix added to the file name
 * @example
 * // returns "/path/to/file-suffix.ts"
 * addSuffixToFileName("/path/to/file.ts", "-suffix")
 */
export function addSuffixToFileName(filePath: string, suffix: string) {
  const directory = dirname(filePath);
  const extension = extname(filePath);
  const baseName = basename(filePath, extension);
  const newFileName = `${baseName}-${suffix}${extension}`;

  return join(directory, newFileName);
}

/**
 * Updates the name of the node, adds initialization logic and editing options.
 * The name is updated:
 * - In the node itself
 * - In the HTML definition of the node.
 * - In the package.json object
 *
 * @param cjs_exports - The AST of the module.exports from the node (obtained from
 * extractors/extractModuleExports)
 */
export function transformNodeDefinition(
  sourcePath: string,
  sourceAst: SourceFile,
  cjs_exports: Node,
  node: string,
  node_defs: Record<string, string>,
  identifier = 'blockchain'
) {
  /**
   * Updates the name in the node itself
   */
  updateNodeNameInRegistration(cjs_exports, identifier);
  writeASTToFile(sourceAst, addSuffixToFileName(sourcePath, identifier));
  rmSync(sourcePath, { force: true });

  /**
   * Updates the HTML definition of the node
   */
  const nodeHTMLDefinitionPath = sourcePath.replace('.js', '.html');
  const htmlDefinition = extractDefinitionFromHTML(nodeHTMLDefinitionPath);

  if (!htmlDefinition.htmlContent || !htmlDefinition.script) {
    throw new Error('No HTML definition found');
  }

  const newScriptDefinition = transformNodeRegistrationScript(htmlDefinition.script, identifier);
  writeModifiedHTML({
    originalContents: htmlDefinition.htmlContent,
    originalScript: htmlDefinition.script,
    newScript: newScriptDefinition,
    htmlPath: addSuffixToFileName(nodeHTMLDefinitionPath, identifier)
  });
  rmSync(nodeHTMLDefinitionPath, { force: true });

  /**
   * Updates the references in the package.json object
   */
  node_defs[`${node}-${identifier}`] = addSuffixToFileName(node_defs[node], identifier);
  delete node_defs[node];
}

function writeFetchCatchBlock(writer: CodeBlockWriter) {
  writer.write('catch (e)');
  writer.block(() => {
    writer.writeLine('this.error(e);');
    writer.writeLine('throw e;');
  });
};

export function connectNodeWithBlockchain(
  source: Node,
  packageName: string,
  node: string
) {
  const inners = source.asKindOrThrow(SyntaxKind.Block);
  for (const stmt of inners.getStatementsWithComments()) {
    stmt.remove();
  }

  inners.addVariableStatement({
    declarationKind: VariableDeclarationKind.Let,
    declarations: [{
      name: 'blockchain_started',
      initializer: 'false'
    }]
  });
  inners.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'PACKAGE_NAME',
      initializer: `'${packageName.replaceAll('@', '').replaceAll(' / ', ' - ')}'`
    },
    {
      name: 'NODE_NAME',
      initializer: `'${node}'`
    },
    {
      name: 'LEDGER_URL',
      initializer: '`http://${process.env.STATUS_LEDGER_ENDPOINT}`'
    },
    {
      name: 'INSTANCE_ID',
      initializer: 'config.id'
    },
    {
      name: 'START_BLOCKCHAIN',
      initializer: (writer) => {
        writer.write('async () =>');
        writer.block(() => {
          writer.write('try');
          writer.block(() => {
            writer.writeLine('await fetch(`${LEDGER_URL}/chaincode/up/${PACKAGE_NAME}/${NODE_NAME}`, { method: "POST" })');
            writer.writeLine('blockchain_started = true;');
          });
          writeFetchCatchBlock(writer);
        });
      }
    }
    ]
  });
  inners.appendWhitespace('\n');
  inners.addStatements((writer) => {
    writer.write('this.on("input", async (msg) =>');
    writer.block(() => {
      writer.write('if (!blockchain_started)');
      writer.block(() => {
        writer.writeLine('await START_BLOCKCHAIN();');
      });
      writer.writeLine('const ops = { method: \'POST\', headers: { \'Content-Type\': \'application/json\' }, body: JSON.stringify({ msg, config }) };');
      writer.write('try');
      writer.block(() => {
        writer.writeLine('const response = await fetch(`${LEDGER_URL}/chaincode/transaction/${PACKAGE_NAME}/${NODE_NAME}/${INSTANCE_ID}`, ops);');
        writer.writeLine('this.send(await response.json());');
      });
      writeFetchCatchBlock(writer);
    });
    writer.write(');');
  });
}
