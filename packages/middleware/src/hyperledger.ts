import { spawn } from 'node:child_process';
import { channelName, getLedgerGateway, networkSh } from './constants.ts';
import { logger } from '@statuscompliance/blockchain-shared/logger';

export async function waitProcess(...arguments_: [string, string[]]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(...arguments_, {
      stdio: ['inherit', 'pipe', 'inherit']
    });

    let output = '';
    process.stdout.on('data', (data: string) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${String(code ?? -1)}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

export async function startChannel() {
  await waitProcess(networkSh, ['up', 'createChannel', '-c', channelName, '-s', 'couchdb']);
}

export async function startNetwork() {
  await waitProcess(networkSh, ['up']);
}

function getChaincodeName(package_: string, name: string) {
  return `${package_}-${name}`;
}

export async function deployChaincode(package_: string, name: string, path: string) {
  await waitProcess(networkSh, [
    'deployCC',
    '-ccn',
    getChaincodeName(package_, name),
    '-ccp',
    path,
    '-ccl',
    'javascript',
    '-c',
    channelName
  ]);
}

export async function listChaincodes() {
  const output = await waitProcess(networkSh, ['cc', 'list']);

  return output
    .split('\n')
    .filter(line => line.includes('Package ID:'))
    .map((line) => {
      const match = /Package ID: (.*?), Label:/.exec(line);
      return match ? match[1] : '';
    })
    .filter(Boolean);
}

export async function transaction(
  package_: string,
  name: string,
  method: 'initInstance' | 'runInstance',
  payload: unknown,
  instance_id: string
) {
  const { network } = getLedgerGateway();
  const contract = network.getContract(getChaincodeName(package_, name));
  const result = await contract.submitTransaction(
    method,
    JSON.stringify(payload),
    instance_id
  );
  const decodedResult = Buffer.from(result).toString('utf8');
  logger.log('Transaction result:', decodedResult);
  return decodedResult;
}

/**
 * TODO: Finish the querying until all the requirements are properly determined
 */
export async function query(package_: string, name: string) {
  // ./network.sh cc query -c statuscompliance -ccn and -ccqc '{"Args":["getResult"]}'
  await waitProcess(networkSh, [
    'cc',
    'query',
    '-c',
    channelName,
    '-ccn',
    getChaincodeName(package_, name),
    '-ccqc',
    JSON.stringify({
      Args: ['getResult']
    })
  ]);
}
