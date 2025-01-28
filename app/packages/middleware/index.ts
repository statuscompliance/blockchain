import { logger } from '@statuscompliance/blockchain-shared/logger';
import Fastify from 'fastify';
import { routes } from './src/routes/index.ts';
import { startChannel } from './src/hyperledger.ts';

console.info('Starting status ledger...');

const app = Fastify();

await app.register(import('@fastify/swagger'));
await app.register(import('@fastify/swagger-ui'), {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  }
});

app.register(routes);
await app.ready();
app.swagger();

// Starts blockchain operations before listening to requests
await startChannel();

try {
  await app.listen({
    port: 3000,
    listenTextResolver: (address: string) => {
      logger.info(`Server listening at ${address}`);
      return address;
    }
  });
} catch (error) {
  app.log.error(error);
}
