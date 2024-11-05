import { join } from 'node:path';
import { mkdir, readdir } from 'node:fs/promises';
import { fileToAST, getBaseChaincodeAST, writeASTToFile } from './utils/base.ts';
import { transformFunction } from './utils/transforms.ts';

/**
 * == START OF TESTS ==
 */

const outputPath = join(import.meta.dirname, "output");
await mkdir(outputPath, { recursive: true });

for await (const file of await readdir(join(import.meta.dirname, "tests"))) {
  const targetAst = getBaseChaincodeAST();
  const sourceAst = fileToAST(join(import.meta.dirname, "tests", file));

  for (const func of sourceAst.getFunctions()) {
    transformFunction(func, targetAst);
  }

  await writeASTToFile(targetAst, join(outputPath, file));
}



/**
 * Writes base chaincode for testing purposes
 */
await writeASTToFile(getBaseChaincodeAST(), join(outputPath, "chaincode.ts"));