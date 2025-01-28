import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hyperledgerQueries } from './hyperledger/queries.ts';
import { hyperledgerActions } from './hyperledger/actions.ts';

export function routes(fastify: FastifyInstance) {
  fastify.get('/ping', async (
    _: FastifyRequest,
    reply: FastifyReply
  ) => {
    reply.code(200).send();
  });

  hyperledgerQueries(fastify);
  hyperledgerActions(fastify);
}
