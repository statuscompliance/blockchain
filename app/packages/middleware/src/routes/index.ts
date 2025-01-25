import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { spawn } from 'node:child_process';

export function routes(fastify: FastifyInstance) {
  fastify.get('/ping', {}, async (
    _: FastifyRequest,
    reply: FastifyReply
  ) => {
    reply.code(200).send();
  });

  fastify.post('/up', {}, (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    void spawn('/usr/local/bin/docker', ['run', '--rm', 'hyperledger/fabric-peer'], { stdio: 'inherit' });
    void spawn('/usr/local/bin/docker', ['run', '--rm', 'hyperledger/fabric-orderer'], { stdio: 'inherit' });
    void spawn('/usr/local/bin/docker', ['run', '--rm', 'hyperledger/fabric-ca'], { stdio: 'inherit' });
    void spawn('/usr/local/bin/docker', ['run', '--rm', 'hyperledger/fabric-ccaenv'], { stdio: 'inherit' });
    
    reply.code(200).send();
  });
}
