import { spawn } from 'node:child_process';
import { channelName, networkSh } from './constants.ts';

export async function waitProcess(...arguments_: unknown[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // @ts-expect-error - Type this properly later
    const process = spawn(...arguments_, {
      stdio: ['inherit', 'pipe', 'inherit']
    });

    let output = '';
    process.stdout?.on('data', (data) => {
      output += data.toString();
    });

    // @ts-expect-error - Type this properly later
    process.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    // @ts-expect-error - Type this properly later
    process.on('error', (error) => {
      reject(error);
    });
  });
}

export async function startChannel() {
  await waitProcess(networkSh, ['up', 'createChannel', '-c', channelName, '-s', 'couchdb'], { stdio: 'inherit' });
}

export async function stopChannel() {
  await waitProcess(networkSh, ['down']);
}

export async function deployChaincode(name: string, path: string) {
  await waitProcess(networkSh, [
    'deployCC',
    '-ccn',
    name,
    '-ccp',
    path,
    '-ccl',
    'typescript',
    '-c',
    channelName
  ], { stdio: 'inherit' });
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
