import { execSync } from 'node:child_process';
import { logger } from './util/logger.ts';

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

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('exit', onExit);
process.on('unhandledRejection', onExit);
process.on('uncaughtException', onExit);
