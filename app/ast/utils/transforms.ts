import { Block, ModuleKind, Node, SourceFile, Statement, SyntaxKind } from 'ts-morph';
import { type IBaseChaincodeAST, getProject, writeModifiedHTML, writeASTToFile } from './base.ts';
import { extractDefinitionFromHTML } from './extractors.ts';
import { _temporary_filename } from './shared.ts';

/**
 * 1. Replaces NODE-RED calls with their JavaScript equivalent (recursively).
 * Examples:
 * -  `node.send(msg)` -> `return msg`
 * -  `node.error("Error message")` -> `throw new Error("Error message")`
 * 2. Maps the statement's text, so it can be written to the function.
 * @param statement
 */
function transformFunctionStatements(statement: Statement): string {
  for (const stat of statement.getDescendantStatements()) {
    if (!stat.wasForgotten()) {
      stat.replaceWithText(transformFunctionStatements(stat as Statement));
    }
  }

  if (statement.isKind(SyntaxKind.ExpressionStatement)) {
    const expression = statement.getExpression().asKind(SyntaxKind.CallExpression);

    if (expression) {
      const callee = expression.getExpression();
      const arguments_ = expression.getArguments()[0]?.getText();

      try {
        switch (callee.getText()) {
          case 'this.error': {
            return `throw new Error(${arguments_})`;
          }
          case 'this.send': {
            return `return ${arguments_};`;
          }
        }
      } catch {} finally {
        // Removes everything after the throw or return statement, since it's unreachable code
        for (const sibling of statement.getNextSiblings()) {
          (sibling as Statement).remove();
        }
      }
    }
  }

  return statement.getText();
}

/**
 * Transform an specific function extracted from a Node-RED's node into a chaincode compatible function.
 *
 * @param func - The AST of the function to transform
 * @param target - The target chaincode class AST, where the transformed function will be written.
 */
export function transformFunction(function_: Block, target: IBaseChaincodeAST): void {
  for (const statement of function_.getStatements()) {
    target.body.addStatements(transformFunctionStatements(statement));
  }
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

      const referenceSymbol = node.getSymbol();

      return referenceSymbol && (referenceSymbol === symbol
        || referenceSymbol.getAliasedSymbol() === symbol);
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
    .findLast(node =>
      (
        node.isKind(SyntaxKind.VariableDeclaration)
        || node.isKind(SyntaxKind.VariableDeclarationList)
      ) && node.getText().endsWith('this')
    )?.asKind(SyntaxKind.VariableDeclaration);

  if (nodeThis) {
    const variableName = nodeThis.getName();
    const otherReferences = findReferences(source, nodeThis);
    nodeThis.remove();

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
   * Modifies the category of the node to be the value of categoryToAssign
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
 * Updates the name of the node, both in the node itself and in the HTML definition.
 *
 * @param cjs_exports - The AST of the module.exports from the node (obtained from
 * extractors/extractModuleExports)
 */
export function updateNodeName(
  sourcePath: string,
  sourceAst: SourceFile,
  cjs_exports: Node,
  identifier = 'blockchain'
) {
  /**
   * Updates the name in the node itself
   */
  updateNodeNameInRegistration(cjs_exports, identifier);
  writeASTToFile(sourceAst, sourcePath);
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
    htmlPath: nodeHTMLDefinitionPath
  });
}
