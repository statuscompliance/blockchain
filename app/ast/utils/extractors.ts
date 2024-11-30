import { BinaryExpression, SourceFile, SyntaxKind, type Node } from 'ts-morph';
import { readHTMLFile } from './base.ts';

/**
 * Extracts the module.exports from the source file
 */
export function extractModuleExports(source: SourceFile) {
  const _first = source.getFirstDescendantByKindOrThrow(SyntaxKind.BinaryExpression);

  return _first.getLeft().getText() === 'module.exports' ? _first : undefined;
}

/**
 * Extracts the contents of the node definition.
 * This requires the AST of the module.exports node (obtained through
 * extractModuleExports) as an argument.
 */
export function extractNodeContents(cjs_exports: BinaryExpression) {
  const reject: () => never = (): never => {
    throw new Error('The provided node-red file is in an incompatible format');
  };
  const functionExpression = cjs_exports
    .getRight()
    .asKind(SyntaxKind.FunctionExpression);

  if (!functionExpression) {
    reject();
  }

  const nodeDefinition = functionExpression.getFirstDescendantByKind(SyntaxKind.FunctionDeclaration);

  if (!nodeDefinition) {
    reject();
  }

  const nodeBody = nodeDefinition.getBody();

  if (!nodeBody) {
    reject();
  }

  return nodeBody;
}

/**
 * Gets the input handler function AST from the node definition.
 * @param descendants - Descendants of a node
 * @returns
 */
function getInputHandlers(descendants: Node[]) {
  return descendants
    .filter(node =>
      node.asKind(SyntaxKind.ExpressionStatement)
        ?.getExpression().asKind(SyntaxKind.CallExpression)
        && node.getText().startsWith('this.on')
    );
}

/**
 * Gets the AST of the code that sorrounds the input handler, placing the input handler
 * in the last position (so it comes last).
 */
export function extractLogic(source: Node) {
  const descendants = source.asKindOrThrow(SyntaxKind.Block).getStatements();
  const inputHandlers = getInputHandlers(descendants);
  const result = descendants.filter(node => !inputHandlers.includes(node));

  for (const handler of inputHandlers) {
    const callExpression = handler
      .asKindOrThrow(SyntaxKind.ExpressionStatement)
      .getExpression()
      .asKindOrThrow(SyntaxKind.CallExpression);
    const node = callExpression
      .getArguments()[1]
      ?.asKind(SyntaxKind.FunctionExpression)
      ?.getBody()
      .asKindOrThrow(SyntaxKind.Block)
      .getStatements();

    if (!node) {
      throw new Error('Unexpected syntax found in a input handler');
    }

    result.push(...node);
  }

  return result;
}

/**
 * Extracts the registration script from the HTML file.
 */
export function extractDefinitionFromHTML(htmlPath: string) {
  const htmlContent = readHTMLFile(htmlPath);
  const scriptMatch = /<script.*?>([\s\S]*?)<\/script>/i.exec(htmlContent);

  if (!scriptMatch) {
    throw new Error('No <script> tag with the node definition found');
  }

  return {
    htmlContent,
    script: scriptMatch.find(v => v.includes('RED.nodes.registerType'))
  };
}
