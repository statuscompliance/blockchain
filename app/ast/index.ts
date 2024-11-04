import * as ts from 'typescript';
import { join } from 'node:path';
import { writeFileSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';

/**
 * Factory function for getting default AST for class
 * Generated using TypeScript AST Viewer
 */

function getBaseChaincodeAST() {
  return ts.factory.createClassDeclaration(
    undefined,
    ts.factory.createIdentifier("Chaincode"),
    undefined,
    undefined,
    [
      ts.factory.createPropertyDeclaration(
        [ts.factory.createToken(ts.SyntaxKind.PrivateKeyword)],
        ts.factory.createIdentifier("func"),
        undefined,
        undefined,
        ts.factory.createStringLiteral("")
      ),
      ts.factory.createMethodDeclaration(
        [ts.factory.createToken(ts.SyntaxKind.PublicKeyword)],
        undefined,
        ts.factory.createIdentifier("run"),
        undefined,
        undefined,
        [],
        undefined,
        ts.factory.createBlock(
          [ts.factory.createExpressionStatement(ts.factory.createCallExpression(
            ts.factory.createIdentifier("eval"),
            undefined,
            [ts.factory.createPropertyAccessExpression(
              ts.factory.createThis(),
              ts.factory.createIdentifier("func")
            )]
          ))],
          true
        )
      )
    ]
  );
}

/**
 * Gets the resulting source from the AST
 */
function getSourceFromAST(fileName = "_TMP_", node: ts.Node) {
  const sourceFile = ts.createSourceFile(
    fileName,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );

  const printer = ts.createPrinter();
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

/**
 * == START OF TESTS ==
 */

const outputPath = join(import.meta.dirname, "output");
mkdirSync(outputPath, { recursive: true });

// for (const file of readdirSync(join(import.meta.dirname, "tests"))) {
//   let newNode: ts.Node | undefined;
//   const sourceAst = ts.createSourceFile(file, readFileSync(join(import.meta.dirname, "tests", file)).toString(), ts.ScriptTarget.Latest, true);

//   sourceAst.forEachChild((node) => {
//     if (newNode) {
//       return;
//     }

//     if (ts.isFunctionDeclaration(node) && node.body) {
//       const baseAST = getBaseChaincodeAST();
//       const iifeAst = ts.factory.createCallExpression(
//         ts.factory.createParenthesizedExpression(
//           ts.factory.createFunctionExpression(
//             undefined,
//             undefined,
//             undefined,
//             undefined,
//             [],
//             undefined,
//             node.body
//           )
//         ),
//         undefined,
//         []
//       );

//       const iifeSource = getSourceFromAST(undefined, iifeAst);
//       console.log(iifeSource);

//       baseAST.members.map(member => {
//         if (ts.isPropertyDeclaration(member) && member.name?.getText() === "func") {
//           return ts.factory.createPropertyDeclaration(
//             [ts.factory.createToken(ts.SyntaxKind.PrivateKeyword)],
//             ts.factory.createIdentifier("func"),
//             undefined,
//             undefined,
//             ts.factory.createStringLiteral(iifeSource)
//           );
//         }
//         return member;
//       });

//       newNode = baseAST;
//     }
//   });

//   break;
//   const result = getSourceFromAST(file, getBaseChaincodeAST());
//   writeFileSync(join(outputPath, file), result);
// }



/**
 * Writes base chaincode for testing purposes
 */
const result = getSourceFromAST("chaincode.ts", getBaseChaincodeAST());
writeFileSync(join(outputPath, "chaincode.ts"), result);
