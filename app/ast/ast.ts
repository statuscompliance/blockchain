import * as ts from 'typescript';
import { writeFileSync } from 'node:fs';

/**
 * Generated using TypeScript AST Viewer
 */
const baseChaincodeClass = ts.factory.createClassDeclaration(
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
            ts.factory.createCallExpression(
              ts.factory.createIdentifier("eval"),
              undefined,
              [ts.factory.createStringLiteral("func")]
            ),
            undefined,
            []
          ))],
          true
        )
      )
    ]
  );

const sourceFile = ts.createSourceFile(
  "chaincode.ts",
  "",
  ts.ScriptTarget.Latest,
  false,
  ts.ScriptKind.TS
);

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const result = printer.printNode(ts.EmitHint.Unspecified, baseChaincodeClass, sourceFile);

// Escribir en el archivo
writeFileSync("chaincode.ts", result);

console.log("Archivo generado con éxito: chaincode.ts");
