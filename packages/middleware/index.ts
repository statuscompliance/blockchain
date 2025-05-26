import { logger } from '@statuscompliance/blockchain-shared/logger';
import Fastify from 'fastify';
import { routes } from './src/routes/index.ts';
import { startChannel, startNetwork } from './src/hyperledger.ts';

console.info('Starting status ledger...');

const app = Fastify();

await app.register(import('@fastify/swagger'));
await app.register(import('@fastify/swagger-ui'), {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'full'
  }
});

app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;

  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.message,
      details: error.validation
    });
  }

  if (statusCode >= 500) {
    logger.error(error);
  } else if (statusCode >= 400) {
    logger.warn(`${error.message} - ${request.method} ${request.url}`);
  }

  reply.status(statusCode).send({
    error: error.name || 'Error',
    message: error.message || 'An unexpected error occurred',
    statusCode
  });
});

app.register(routes);
await app.ready();
app.swagger();

// Starts blockchain operations before listening to requests, ensuring it's done inside Docker only
// hence, we assume that the middleware is always running inside a Docker container and when it's not
// it's because we are running in development mode.
if (process.env.DOCKER_VERSION) {
  try {
    await startChannel();
  } catch {
    await startNetwork();
  }
}

try {
  await app.listen({
    port: 80,
    host: '::',
    listenTextResolver: (address: string) => {
      logger.info(`Server listening at ${address}`);
      return address;
    }
  });
} catch (error) {
  logger.error(error);
}
