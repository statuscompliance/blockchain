import { FunctionDeclaration, Statement, SyntaxKind } from 'ts-morph';
import type { IBaseChaincodeAST } from './base';

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
          case 'node.error': {
            return `throw new Error(${arguments_})`;
          }
          case 'node.send': {
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
export function transformFunction(function_: FunctionDeclaration, target: IBaseChaincodeAST): void {
  for (const statement of function_.getStatements()) {
    target.body.addStatements(transformFunctionStatements(statement));
  }
}
