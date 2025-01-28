import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { deployChaincode, listChaincodes } from '../hyperledger.ts';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';
import { chaincodePath } from '../constants.ts';

const runningChaincodes = new Map<string, Set<string>>();

export function routes(fastify: FastifyInstance) {
  fastify.get('/ping', async (
    _: FastifyRequest,
    reply: FastifyReply
  ) => {
    reply.code(200).send();
  });

  fastify.post('/up/chaincode/:pkg/:node', {
    schema: {
      params: {
        type: 'object',
        properties: {
          pkg: {
            type: 'string',
            description: 'Pass without @ and replacing / with -'
          },
          node: {
            type: 'string',
            description: 'Name of the node to initialize transactions'
          }
        },
        required: ['pkg', 'node']
      },
      response: {
        226: {
          type: 'null',
          description: 'The chaincode is already installed and ruinning'
        },
        200: {
          type: 'null',
          description: 'Chaincode installed successfully'
        },
        404: {
          type: 'null',
          description: 'Chaincode not found'
        }
      }
    }
  },
  async (
    request: FastifyRequest<{
      Params: { node: string; pkg: string };
    }>,
    reply: FastifyReply
  ) => {
    const { node, pkg } = request.params;

    if (runningChaincodes.get(pkg)?.has(node)) {
      reply.code(226).send();
      return;
    }

    let found = '';
    for await (const match of glob(
      join('./**', pkg, '**', node, 'package.json'), { cwd: chaincodePath, withFileTypes: true }
    )) {
      found = match.parentPath;
      break;
    }

    if (!found) {
      reply.code(404).send();
      return;
    }

    try {
      await deployChaincode(node, found);

      const runningChaincodeByPackage = runningChaincodes.get(pkg);
      if (runningChaincodeByPackage) {
        runningChaincodeByPackage.add(node);
      } else {
        runningChaincodes.set(pkg, new Set([node]));
      }
    } catch {
      reply.code(500).send();
      return;
    }

    reply.code(200).send();
  });

  fastify.get('/list/chaincode', {
    schema: {
      response: {
        200: {
          type: 'array',
          items: {
            type: 'string',
            description: 'Package ID del chaincode instalado'
          }
        }
      }
    }
  },
  async (
    _request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const chaincodes = await listChaincodes();

    reply.code(200).send(chaincodes);
  });
}
