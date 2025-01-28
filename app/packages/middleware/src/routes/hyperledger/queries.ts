import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { listChaincodes } from '../../hyperledger.ts';

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
}
