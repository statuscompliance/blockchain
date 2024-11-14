#!/usr/bin/env -S NODE_NO_WARNINGS=1 node --experimental-strip-types
import { logger } from '../util/logger.ts';

const arguments_ = process.argv.slice(2);

if (arguments_.length === 0 || arguments_[0].includes('--help') || arguments_[0].includes('-h')) {
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

console.log(`¡Hola, ${arguments_[0]}!`);
