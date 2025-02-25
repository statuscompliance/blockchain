import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { listChaincodes, query } from '../../hyperledger.ts';
import {
  commonChaincodeQueryParameters,
  runningChaincodes, type CommonChaincodeQueryParameters
} from '../../constants.ts';
import { logger } from '@statuscompliance/blockchain-shared/logger';

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
  async (
    _request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const chaincodes = await listChaincodes();

    reply.code(200).send(chaincodes);
  });

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

    try {
      await query(pkg, node);
    } catch (e) {
      logger.error(e);
      reply.code(500).send(e);
      return;
    }

    reply.code(200).send();
  });
}
