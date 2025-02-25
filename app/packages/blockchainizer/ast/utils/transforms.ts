import { basename, dirname, extname, join } from 'node:path';
import { CodeBlockWriter, FunctionDeclaration, ModuleKind, Node, SourceFile, SyntaxKind, VariableDeclarationKind } from 'ts-morph';
import { type IBaseChaincodeAST, getProject, writeASTToFile, readTextFile } from './base.ts';
import { extractLogic } from './extractors.ts';
import { _temporary_filename } from './shared.ts';
import { rmSync, writeFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

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

      if (arguments_) {
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
    for (const node of extractedLogic.handlers[handler]!) {
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
      .getArguments()[0]!
      .getText()
      .replaceAll(/['"]/g, '');
    const variableName = declaration.getName().replaceAll(':', ' as '); // Handle aliases

    chaincode.source.addImportDeclaration({
      moduleSpecifier: modulePath,
      defaultImport: variableName
    });

    declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement)?.remove();
  }
}

/**
 * There are some cases where the getSymbol method throws an error
 * due to (what I believe) is a bug in TypeScript.
 *
 * TODO: This is a workaround to avoid the error for now, but investigate
 * further and report upstream in case it's needed.
 */
function safeGetSymbol(node: Node) {
  try {
    return node.getSymbol();
  } catch {}
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
  const symbol = safeGetSymbol(target);

  const references = source
    .getDescendants()
    .filter((node) => {
      if (!node.isKind(SyntaxKind.Identifier)) {
        return false;
      }

      try {
        const referenceSymbol = safeGetSymbol(node);

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
 * Erases the reassignments of a variable in the source AST. For example, if passed as variable
 * the symbol of the this keyword, the following:
 *
 * ```
 * const node = this;
 * const node2 = node;
 * node2.on('input', () => {});
 * ```
 *
 * Will be replaced with:
 *
 * ```
 * this.on('input', () => {});
 * ```
 */
export function eraseReassignments(source: Node, variable: Node | string, overrideNewName?: string) {
  const reassignments = source
    .getDescendants()
    .find(node =>
      (
        node.isKind(SyntaxKind.VariableDeclaration)
        || node.isKind(SyntaxKind.VariableDeclarationList)
      ) && (typeof variable === 'string'
        ? node.getText().endsWith(variable)
        : safeGetSymbol(node) === safeGetSymbol(variable))
    )?.asKindOrThrow(SyntaxKind.VariableDeclarationList);

  if (reassignments) {
    for (const declaration of reassignments.getDeclarations()) {
      const variableName = declaration.getName();
      const otherReferences = findReferences(source, reassignments);
      declaration.remove();

      const nodeReferences = source
        .getDescendants()
        .filter(node =>
          node.isKind(SyntaxKind.Identifier)
          && node.getText().startsWith(variableName)
        );

      for (const reference of nodeReferences) {
        reference.replaceWithText(
          overrideNewName ?? (typeof variable === 'string' ? variable : variable.getText())
        );
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
 * - Replaces assignments like `var node = this` with `this` directly.
 * - The first parameter of the node's function expression will be added if it doesn't exist
 * (or renamed to config if it's named differently).
 *
 * Also ensures the variables are named as expected everywhere (for instance, if `config`
 * was not being named `config` in any of the child nodes, it will be renamed to `config`).
 */
export function ensureEnvironmentConsistency(body: Node, functionExpr: FunctionDeclaration): void {
  const configParameter = functionExpr.getParameters()[0];
  const newConfigName = 'config';
  eraseReassignments(body, 'this');

  if (configParameter) {
    configParameter.rename(newConfigName);
    eraseReassignments(body, configParameter.getName(), newConfigName);
  } else {
    functionExpr.addParameter({
      name: newConfigName
    });
  }
}

/**
 * Removes the Node-RED specific statements from the source file (declarations like
 * RED.nodes.createNode, RED.nodes.registerType, etc.)
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
}

/**
 * Updates the name of the node in the `RED.nodes.registerType` call.
 * @returns - The AST of the `RED.nodes.registerType` call
 */
function updateNodeNameInRegistration(source: Node, new_node_name: string) {
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
  registerCall.getArguments()[0]?.replaceWithText(new_node_name);

  return registerCall;
}

/**
 * Modifies the name and category of the new nodes, so they're easily identifiable
 * in the Node-RED's UI.
 *
 * @param script - The raw string of the node registration script
 * @returns
 */
function transformNodeRegistrationScript(
  htmlContent: string,
  identifier: string,
  original_node_name: string,
  new_node_name: string
) {
  const parsedHtml = parseHTML(htmlContent);
  const scripts = parsedHtml.window.document.querySelectorAll('script');

  for (const element of scripts) {
    for (const attribute of element.attributes) {
      if (attribute.value === original_node_name) {
        attribute.value = new_node_name.replaceAll(/['"]/g, '');
      }
    }

    if (element.textContent?.includes('RED.nodes.registerType')) {
      const project = getProject({ module: ModuleKind.CommonJS });
      const source = project.createSourceFile(_temporary_filename, element.textContent);
      const registerCall = updateNodeNameInRegistration(source, new_node_name);

      /**
       * Modifies the category of the node to be the value of identifier
       */
      const secondArgument = registerCall.getArguments()[1]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const categoryProperty = secondArgument?.getProperty('category')
        ?.asKind(SyntaxKind.PropertyAssignment)
        ?.getInitializer();
      const labelProperty = secondArgument?.getProperty('label')
        ?.asKind(SyntaxKind.PropertyAssignment)
        ?.getInitializer();

      if (categoryProperty) {
        categoryProperty.replaceWithText(`'${identifier}'`);
      } else {
        secondArgument?.addPropertyAssignment({
          name: 'category',
          initializer: `'${identifier}'`
        });
      }

      if (labelProperty) {
        /**
         * If it's a function, we find and replace the content of the descendants
         */
        if (labelProperty.isKind(SyntaxKind.FunctionExpression)) {
          const functionBody = labelProperty.getBody();
          const identifiers = functionBody
            .getDescendants()
            .filter(node =>
              node.isKind(SyntaxKind.StringLiteral)
              || node.isKind(SyntaxKind.Identifier)
            );

          for (const node of identifiers) {
            const text = node.getText().replaceAll(/['"]/g, '');
            if (text === original_node_name) {
              node.replaceWithText(new_node_name);
            }
          }
        } else {
          /**
           * Replace the value directly if it's not a function.
           */
          labelProperty.replaceWithText(new_node_name);
        }
      } else {
        secondArgument?.addPropertyAssignment({
          name: 'label',
          initializer: new_node_name
        });
      }

      element.textContent = source.getFullText();
    }
  }

  /**
   * This is no the standard Document interface, but linkedom's implementation,
   * but the rule is not aware of that.
   */
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return parsedHtml.document.toString();
}

/**
 * Adds a suffix to a file name while preserving its directory path and extension.
 *
 * @param filePath - The full path of the file including name and extension
 * @param suffix - The suffix to append to the file name before the extension
 * @returns The new file path with the suffix added to the file name
 * @example
 * returns "/path/to/file-suffix.ts"
 * addSuffixToFileName("/path/to/file.ts", "-suffix")
 */
function addSuffixToFileName(filePath: string, suffix: string) {
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
  new_node_names: Map<string, string>,
  identifier = 'blockchain'
) {
  /**
   * Updates the references in the package.json object
   */
  let newName = `${node}-${identifier}`;
  node_defs[newName] = addSuffixToFileName(node_defs[node]!, identifier);
  new_node_names.set(node, newName);
  delete node_defs[node];
  newName = `'${newName}'`;

  /**
   * Updates the name in the node .js file
   */
  updateNodeNameInRegistration(cjs_exports, newName);
  writeASTToFile(sourceAst, addSuffixToFileName(sourcePath, identifier));
  rmSync(sourcePath, { force: true });

  /**
   * Updates the HTML definition of the node
   */
  const nodeHTMLDefinitionPath = sourcePath.replace('.js', '.html');
  const htmlDefinition = readTextFile(nodeHTMLDefinitionPath);

  const newHtml = transformNodeRegistrationScript(htmlDefinition, identifier, node, newName);
  writeFileSync(addSuffixToFileName(nodeHTMLDefinitionPath, identifier), newHtml);
  rmSync(nodeHTMLDefinitionPath, { force: true });
}

/**
 * The common catch block for fetch requests inside the node's logic
 */
function writeFetchCatchBlock(writer: CodeBlockWriter) {
  writer.write('catch (e)');
  writer.block(() => {
    writer.writeLine('this.error(e);');
  });
};

/**
 * Writes all the logic to connect a node with our blockchain
 * middleware
 */
export function connectNodeWithBlockchain(
  source: Node,
  packageName: string,
  node: string
) {
  const inners = source.asKindOrThrow(SyntaxKind.Block);
  for (const stmt of inners.getStatementsWithComments()) {
    stmt.remove();
  }

  inners.addStatements((writer) => {
    writer.writeLine('RED.nodes.createNode(this, config);');
    writer.newLine();
  });
  inners.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{
      name: 'PACKAGE_NAME',
      initializer: `'${packageName}'`
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
      initializer: 'this.id'
    },
    {
      name: 'START_BLOCKCHAIN',
      initializer: (writer) => {
        writer.write('async () =>');
        writer.block(() => {
          writer.write('try');
          writer.block(() => {
            writer.writeLine('const response = await fetch(`${LEDGER_URL}/chaincode/up/${PACKAGE_NAME}/${NODE_NAME}`, { method: "POST" });');
          });
          writeFetchCatchBlock(writer);
        });
      }
    }
    ]
  });
  inners.appendWhitespace('\n');
  inners.addVariableStatement({
    declarationKind: VariableDeclarationKind.Let,
    declarations: [{
      name: 'promise_queue',
      initializer: 'START_BLOCKCHAIN()'
    }]
  });
  inners.addStatements((writer) => {
    writer.write('this.on("input", (msg) =>');
    writer.block(() => {
      writer.writeLine('const ops = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msg, config }) };');
      writer.writeLine('promise_queue = promise_queue.then(async () =>');
      writer.block(() => {
        writer.write('try');
        writer.block(() => {
          writer.writeLine('const response = await fetch(`${LEDGER_URL}/chaincode/transaction/${PACKAGE_NAME}/${NODE_NAME}/${INSTANCE_ID}`, ops);');
          writer.writeLine('this.send(await response.json());');
        });
        writeFetchCatchBlock(writer);
      });
      writer.write(');');
    });
    writer.write(');');
  });
}
