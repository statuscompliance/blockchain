import { join } from 'node:path';
import { mkdir, readdir } from 'node:fs/promises';
import { nodeToAST, getBaseChaincodeAST, writeASTToFile } from './utils/base.ts';
import { transformFunction } from './utils/transforms.ts';
import { SyntaxKind } from 'ts-morph';

/**
 * == START OF TESTS ==
 */

const outputPath = join(import.meta.dirname, 'output');
await mkdir(outputPath, { recursive: true });

for (const file of await readdir(join(import.meta.dirname, 'tests'))) {
  const targetAst = getBaseChaincodeAST();
  const sourceAst = nodeToAST(join(import.meta.dirname, 'tests', file));

  for (const function_ of sourceAst.getFunctions()) {
    transformFunction(function_.asKindOrThrow(SyntaxKind.Block), targetAst);
  }

  writeASTToFile(targetAst.source, join(outputPath, file));
}

/**
 * Writes base chaincode for testing purposes
 */
writeASTToFile(getBaseChaincodeAST().source, join(outputPath, 'chaincode.ts'));
