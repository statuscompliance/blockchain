#!/usr/bin/env -S NODE_NO_WARNINGS=1 node --experimental-strip-types
import { spawnSync } from 'node:child_process';
import { join, parse } from 'node:path';
import { logger } from '@statuscompliance/blockchain-shared/logger';
import { globSync, mkdirSync, rmSync, renameSync, writeFileSync, readFileSync } from 'node:fs';
import { extract } from 'tar';
import { nodeToAST, getBaseChaincodeAST, writeASTToFile } from '../ast/utils/base.ts';
import { extractLogic, extractModuleExports, extractNodeContents } from '../ast/utils/extractors.ts';
import { addNodeLogicToChaincode, convertRequiresToImports, removeREDStatements, renameNode, transformLogic } from '../ast/utils/transforms.ts';
import { ModuleKind } from 'ts-morph';
import type { PackageJson } from 'type-fest';
import { mkdir } from 'node:fs/promises';

const pathIdentifier = 'blockchain-conversion';
const suffix = 'blockchainized';
const _TMP_PATH = `_${pathIdentifier}_tmp`;
const _TMP_outputPath = join(_TMP_PATH, 'output');
const _TMP_packagePath = join(_TMP_PATH, 'package');
const _TMP_chaincodeOutputPath = join(_TMP_outputPath, 'chaincode');
const baseOutputPath = join(process.cwd(), pathIdentifier);
const arguments_ = process.argv.slice(2);

type PackageJsonWithNodeRedDefinitions = PackageJson & {
  'node-red'?: {
    nodes?: Record<string, string>;
  };
};

/**
 * Show help if no arguments are given
 */
if (arguments_.length === 0 || arguments_[0].trim() === '--help' || arguments_[0].trim() === '-h') {
  logger.info([
    'Given an npm package that contains node-red nodes, this CLI tool converts them',
    'to be compatible with the blockchain layer of STATUS, so their logic runs in the blockchain instead of node-red.',
    '',
    'Usage: blockchainize-nodes <npm-package-name>',
    '',
    '<npm-package-name> is the name of the npm package that contains the node-red nodes to be converted.',
    '',
    'All the package types supported by \'npm install\' are accepted, including local paths. Some examples:',
    '',
    '· blockchainize-nodes node-red-contrib-example - \'node-red-contrib-example\' comes from npmjs.org',
    '· blockchainize-nodes ./my-nodes - \'my-nodes\' is a package that comes from a local folder',
    '· blockchainize-nodes mynodes-1.0.0.tgz - \'my-nodes\' comes from a tarball',
    '· blockchainize-nodes https://example.com/path/to/my-nodes.tgz - \'my-nodes\' is a package tarball from an HTTP URL',
    '· blockchainize-nodes git+https://github.com/user/nodes.git - \'nodes\' is a package from a git repository'
  ].join('\n')
  );
  process.exit(0);
}

// APPLICATION ENTRYPOINT STARTS HERE

/**
 * Cleanup temporary files on exit and handle stacktrace reporting
 * through custom logger.
 */
function onExit({ silent = false }, ...arguments__: unknown[]): void {
  if (arguments__.length > 0) {
    // @ts-expect-error - TypeScript doesn't infer this correctly, investigate later
    logger.error(...arguments__);
  }

  if (!silent) {
    logger.log('Exiting...');
  }

  rmSync(_TMP_PATH, { recursive: true, force: true });
}

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('exit', onExit);
process.on('unhandledRejection', (...arguments__) => {
  onExit({}, arguments__);
});
process.on('uncaughtException', (...arguments__) => {
  onExit({}, arguments__);
});
onExit({ silent: true });
rmSync(baseOutputPath, { recursive: true, force: true });

/**
 * Create a tarball of the given package argument
 */
mkdirSync(_TMP_PATH, { recursive: true });
spawnSync('npm', ['pack', '--pack-destination', _TMP_PATH, ...arguments_], { stdio: 'ignore' });

const packages = globSync(`${_TMP_PATH}/*.tgz`);

if (packages.length === 0) {
  logger.error('No packages have been found for the provided input');
  process.exit(1);
}

/**
 * Get the packages contents
 */
for (const file of packages) {
  try {
    extract({
      cwd: _TMP_PATH,
      file,
      preservePaths: true,
      sync: true
    });

    /**
     * Fetches the nodes JavaScript files from the package.json
     */
    const packageJson: PackageJsonWithNodeRedDefinitions = JSON.parse(
      readFileSync(join(process.cwd(), _TMP_packagePath, 'package.json'), 'utf8')
    );
    const packageName = packageJson.name ?? file.replace('.tgz', '');
    const outputPath = join(baseOutputPath, packageName.replaceAll('@', '').replaceAll('/', '-'));
    const nodeDefinitions = packageJson['node-red']?.nodes;

    logger.info(`Converting nodes from package ${packageName}...`);

    if (!nodeDefinitions) {
      logger.error('No nodes found in the provided package');
      process.exit(1);
    }

    packageJson.name = `${packageName}_${suffix}`;
    // The arguments passed to JSON.stringify are for pretty printing
    const packageJsonContents = JSON.stringify(packageJson, undefined, 2);
    writeFileSync(join(_TMP_packagePath, 'package.json'), packageJsonContents);

    /**
     * Conversion process
     */
    mkdirSync(_TMP_chaincodeOutputPath, { recursive: true });

    for (const node in nodeDefinitions) {
      logger.info(`|- [${packageName}] Converting node '${node}'...`);

      try {
        const sourcePath = join(process.cwd(), _TMP_PATH, 'package', nodeDefinitions[node]);
        const targetAst = getBaseChaincodeAST();
        const sourceAst = nodeToAST(sourcePath, {
          module: ModuleKind.CommonJS,
          useMemory: false
        });
        const innerExportsAst = extractModuleExports(sourceAst);

        if (!innerExportsAst) {
          throw new Error('No module.exports found');
        }

        renameNode(
          sourcePath,
          sourceAst,
          innerExportsAst,
          node,
          nodeDefinitions,
          suffix
        );

        const contents = extractNodeContents(innerExportsAst);
        convertRequiresToImports(sourceAst, targetAst);
        removeREDStatements(contents);

        const extractedLogic = extractLogic(contents);
        addNodeLogicToChaincode(targetAst, extractedLogic);
        transformLogic(targetAst.body.getBodyOrThrow());
        writeASTToFile(targetAst.source, join(_TMP_chaincodeOutputPath, node, `${node}.ts`), true);

        // Prepare the output directories' structure to match what Hyperledger expects for the chaincodes
        await mkdir(join(_TMP_chaincodeOutputPath, node, 'src'), { recursive: true });
        await mkdir(join(_TMP_chaincodeOutputPath, node, 'dist'), { recursive: true });
        renameSync(join(_TMP_chaincodeOutputPath, node, `${node}.ts`), join(_TMP_chaincodeOutputPath, node, 'src', `${node}.ts`));
        renameSync(join(_TMP_chaincodeOutputPath, node, `${node}.js`), join(_TMP_chaincodeOutputPath, node, 'dist', 'index.js'));
        writeFileSync(join(_TMP_chaincodeOutputPath, node, 'package.json'), packageJsonContents);
        // Adds the fabric-contract-api dependency to the chaincode's package.json
        spawnSync('npm', ['install', '--package-lock-only', '--no-package-lock', '--ignore-scripts', 'fabric-contract-api', 'fabric-shim'], {
          stdio: 'ignore',
          cwd: join(_TMP_chaincodeOutputPath, node)
        });
        spawnSync('npm', ['pkg', 'set', 'scripts.start=set -x && fabric-chaincode-node start'], {
          stdio: 'ignore',
          cwd: join(_TMP_chaincodeOutputPath, node)
        });
        spawnSync('npm', ['pkg', 'set', 'main=dist/index.js'], {
          stdio: 'ignore',
          cwd: join(_TMP_chaincodeOutputPath, node)
        });
      } catch (error) {
        logger.error(`Converting node ${node}`, error, (error as Error).stack);
        process.exit(1);
      }
    }

    /**
     * After all the transformations are done, we pack and prepare the
     * output artifacts (generated chaincode and the installable nodes package
     * for Node-RED).
     */
    const chaincodeOutputPath = join(outputPath, 'chaincode');

    mkdirSync(chaincodeOutputPath, { recursive: true });
    renameSync(_TMP_chaincodeOutputPath, chaincodeOutputPath);
    spawnSync('npm', ['pack', '--pack-destination', outputPath, `./${_TMP_packagePath}`], { stdio: 'ignore' });
  } catch (error) {
    logger.error(`Processing package ${parse(file).name}:`, error, (error as Error).stack);
    process.exit(1);
  } finally {
    /**
     * Perform cleanup after each node conversion
     */
    rmSync(_TMP_outputPath, { recursive: true, force: true });
    rmSync(_TMP_packagePath, { recursive: true, force: true });
  }
}
