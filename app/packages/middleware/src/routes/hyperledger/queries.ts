import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { listChaincodes, query } from '../../hyperledger.ts';
import {
  commonChaincodeQueryParameters,
  runningChaincodes, type CommonChaincodeQueryParameters
} from '../../constants.ts';

export function hyperledgerQueries(fastify: FastifyInstance) {
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
  async () => await listChaincodes());

  fastify.get('/chaincode/query/:pkg/:node', {
    schema: {
      params: commonChaincodeQueryParameters(),
      response: {
        200: {
          type: 'object'
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

    if (!runningChaincodes.get(pkg)?.has(node)) {
      reply.code(404).send();
      return;
    }

    await query(pkg, node);
  });
}
