import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { deployChaincode, transaction } from '../../hyperledger.ts';
import { glob } from 'node:fs/promises';
import {
  chaincodePath,
  commonChaincodeQueryParameters,
  runningChaincodes,
  runningNodeInstances,
  type CommonChaincodeQueryParameters
} from '../../constants.ts';
import { join } from 'node:path';

export function hyperledgerActions(fastify: FastifyInstance) {
  fastify.post('/chaincode/up/:pkg/:node/:id', {
    schema: {
      params: commonChaincodeQueryParameters(),
      body: {
        type: 'object'
      },
      response: {
        200: {
          type: 'null',
          description: 'Chaincode installed successfully'
        },
        226: {
          type: 'null',
          description: 'The chaincode is already installed and running'
        },
        404: {
          type: 'null',
          description: 'Chaincode not found'
        },
        500: {
          type: 'string',
          description: 'Server error'
        }
      }
    }
  },
  async (
    request: FastifyRequest<{
      Params: CommonChaincodeQueryParameters;
      Body: unknown;
    }>,
    reply: FastifyReply
  ) => {
    const { node, pkg, id: instance_id } = request.params;

    if (runningNodeInstances.has(instance_id)) {
      reply.code(226).send();
      return;
    }

    if (!runningChaincodes.get(pkg)?.has(node)) {
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

      await deployChaincode(pkg, node, found);

      const runningChaincodeByPackage = runningChaincodes.get(pkg);
      if (runningChaincodeByPackage) {
        runningChaincodeByPackage.add(node);
      } else {
        runningChaincodes.set(pkg, new Set([node]));
      }
    }

    await transaction(pkg, node, 'initInstance', request.body, instance_id);
    runningNodeInstances.add(instance_id);

    reply.code(200).send();
  });

  fastify.post('/chaincode/transaction/:pkg/:node/:id', {
    schema: {
      params: commonChaincodeQueryParameters(),
      body: {
        type: 'object'
      },
      response: {
        200: {
          type: 'object',
          description: 'Chaincode response'
        },
        404: {
          type: 'null',
          description: 'Chaincode not found'
        },
        500: {
          type: 'string',
          description: 'Server error'
        }
      }
    }
  },
  async (
    request: FastifyRequest<{
      Params: CommonChaincodeQueryParameters;
      Body: unknown;
    }>,
    reply: FastifyReply
  ) => {
    const { node, pkg, id } = request.params;

    if (!runningChaincodes.get(pkg)?.has(node)) {
      reply.code(404).send();
      return;
    }

    return await transaction(pkg, node, 'runInstance', request.body, id);
  });
}
