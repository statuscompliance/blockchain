import { BinaryExpression, Block, SourceFile, SyntaxKind, type Node } from 'ts-morph';
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
 * Must be called after removeRedStatements (from transform module)!
 */
export function extractInputHandler(source: Node): Block | undefined {
  const nodeOn = source
    .getDescendants()
    .find(node =>
      node.isKind(SyntaxKind.CallExpression)
      && node.getText().startsWith('this.on')
    );

  if (!nodeOn) {
    throw new Error('No input handler found');
  }

  const callExpression = nodeOn.asKindOrThrow(SyntaxKind.CallExpression);

  return callExpression
    .getArguments()[1]
    ?.asKind(SyntaxKind.FunctionExpression)
    ?.getBody()
    ?.asKind(SyntaxKind.Block);
}

export function extractDefinitionFromHTML(htmlPath: string) {
  const htmlContent = readHTMLFile(htmlPath);
  const scriptMatch = /<script.*?>([\s\S]*?)<\/script>/i.exec(htmlContent);

  if (!scriptMatch) {
    throw new Error('No <script> tag with the node definition found');
  }

  return {
    htmlContent,
    script: scriptMatch.findLast(v => v.includes('RED.nodes.registerType'))
  };
}
