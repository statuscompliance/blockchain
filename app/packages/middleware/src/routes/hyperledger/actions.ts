import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { deployChaincode, transaction } from '../../hyperledger.ts';
import { glob } from 'node:fs/promises';
import {
  chaincodePath,
  commonChaincodeQueryParameters,
  runningChaincodes,
  type CommonChaincodeQueryParameters
} from '../../constants.ts';
import { join } from 'node:path';

export function hyperledgerActions(fastify: FastifyInstance) {
  fastify.post('/chaincode/up/:pkg/:node', {
    schema: {
      params: commonChaincodeQueryParameters(),
      response: {
        226: {
          type: 'null',
          description: 'The chaincode is already installed and running'
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
      Params: CommonChaincodeQueryParameters;
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
      await deployChaincode(pkg, node, found);

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

  fastify.post('/chaincode/transaction/:pkg/:node/:id', {
    schema: {
      params: commonChaincodeQueryParameters({
        id: {
          type: 'string',
          description: 'Instance ID of the node'
        }
      }),
      body: {
        type: 'object',
        properties: {
          msg: {
            type: 'object'
          },
          config: {
            type: 'object'
          }
        },
        required: ['msg', 'config']
      }
    }
  },
  async (
    request: FastifyRequest<{
      Params: CommonChaincodeQueryParameters & { id: string };
      Body: { msg: unknown; config: unknown };
    }>,
    reply: FastifyReply
  ) => {
    const { node, pkg, id } = request.params;

    if (!runningChaincodes.get(pkg)?.has(node)) {
      reply.code(404).send();
      return;
    }

    try {
      return await transaction(pkg, node, request.body, id);
    } catch {
      reply.code(500).send();
      return;
    }
  });
}
