import { execSync } from 'node:child_process';
import { logger } from '@statuscompliance/blockchain-shared/logger';
import Fastify from 'fastify';
import { routes } from './src/routes/index.ts';

console.info('Starting status ledger...');

/**
 * This function kills the hyperledger containers when the process is terminated
 */
function onExit(): void {
  console.info('Cleaning up hyperledger containers...');
  execSync('docker ps -a --filter "label=$DIND_DEFAULT_LABEL" -q | xargs docker rm -f || true', { stdio: 'ignore' });
  execSync('docker images --filter "label=$DIND_DEFAULT_LABEL" -q | xargs docker rmi -f || true', { stdio: 'ignore' });
  execSync('docker network ls --filter "label=$DIND_DEFAULT_LABEL" -q | xargs docker network rm -f || true', { stdio: 'ignore' });
  execSync('docker volume ls --filter "label=$DIND_DEFAULT_LABEL" -q | xargs docker volume rm -f || true', { stdio: 'ignore' });
  logger.success('Cleanup done! Exiting...\n');
}

// process.on('SIGTERM', onExit);
// process.on('SIGINT', onExit);
// process.on('exit', onExit);
// process.on('unhandledRejection', onExit);
// process.on('uncaughtException', onExit);

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

try {
  app.listen({
    port: 3000,
    listenTextResolver: (address: string) => {
      logger.info(`Server listening at ${address}`);
      return address;
    }
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
