import { BinaryExpression, SourceFile, SyntaxKind, type Node } from 'ts-morph';
import { readTextFile } from './base.ts';

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

  return { contents: nodeBody, nodeDefinition };
}

/**
 * Gets an object whose keys are the event names and the values are the
 * corresponding handlers.
 * @param descendants - Descendants of a node
 */
function getHandlers(descendants: Node[]) {
  const handlers: Record<string, Node[]> = {};

  const filtered = descendants
    .filter(node =>
      node.asKind(SyntaxKind.ExpressionStatement)
        ?.getExpression().asKind(SyntaxKind.CallExpression)
        && node.getText().startsWith('this.on')
    );

  for (const handler of filtered) {
    const callExpr = handler
      .asKind(SyntaxKind.ExpressionStatement)
      ?.getExpression()
      .asKind(SyntaxKind.CallExpression);

    if (callExpr) {
      const arguments_ = callExpr.getArguments();
      const eventName = arguments_[0]!.getText().replaceAll(/['"]/g, '');

      if (!(eventName in handlers)) {
        handlers[eventName] = [];
      }

      handlers[eventName]!.push(arguments_[1]!);
    }
  }

  return {
    handlers,
    filtered
  };
}

/**
 * Gets the AST of the code that sorrounds the input handler, and the input handlers themselves.
 */
export function extractLogic(source: Node) {
  const descendants = source.asKindOrThrow(SyntaxKind.Block).getStatements();
  const { handlers, filtered } = getHandlers(descendants);
  const result = descendants.filter(node => !filtered.includes(node));

  return {
    body: result,
    handlers
  };
}

/**
 * Extracts the registration script from the HTML file.
 */
export function extractDefinitionFromHTML(htmlPath: string) {
  const htmlContent = readTextFile(htmlPath);
  const scriptMatch = /<script.*?>([\s\S]*?)<\/script>/i.exec(htmlContent);

  if (!scriptMatch) {
    throw new Error('No <script> tag with the node definition found');
  }

  return {
    htmlContent,
    script: scriptMatch.find(v => v.includes('RED.nodes.registerType'))
  };
}
