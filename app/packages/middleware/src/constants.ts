import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { connect, hash, signers, type Gateway, type Network } from '@hyperledger/fabric-gateway';
import { Client, credentials as grpc_credentials } from '@grpc/grpc-js';

export interface CommonChaincodeQueryParameters {
  pkg: string;
  node: string;
}

const fabricPath = process.env.FABRIC_TOOLS_PATH ?? '/fabric';

export const chaincodePath = process.env.CHAINCODE_PATH ?? '/chaincodes';
const testNetworkPath = join(fabricPath, 'test-network');
export const networkSh = join(testNetworkPath, 'network.sh');
export const channelName = 'statuscompliance';
export const runningChaincodes = new Map<string, Set<string>>();
export const commonChaincodeQueryParameters = () => ({
  type: 'object',
  properties: {
    pkg: {
      type: 'string',
      description: 'Pass without @ and replacing / with -'
    },
    node: {
      type: 'string',
      description: 'Name of the node to initialize transactions'
    }
  },
  required: ['pkg', 'node']
});

let gateway: Gateway | undefined;
let network: Network | undefined;

export function getLedgerGateway() {
  if (!gateway) {
    /**
      * TODO: Revisit these constants, since they could change if we refactor the initialization
      * logic to not use the test-network scripts.
      */
    // Path to crypto materials
    const cryptoPath = join(testNetworkPath, 'organizations/peerOrganizations/org1.example.com');
    const userCryptoPath = join(cryptoPath, 'users/User1@org1.example.com/msp');
    const tlsCert = readFileSync(join(cryptoPath, 'peers/peer0.org1.example.com/tls/ca.crt'));
    // User certificate.
    const credentials = readFileSync(join(userCryptoPath, 'signcerts/User1@org1.example.com-cert.pem'));
    // User private key
    const userPK = readFileSync(join(userCryptoPath, 'keystore/priv_sk'));

    // Any peer can act as a discovery peer, thorugh the network other peers are automatically discovered
    // and transactions are performed as the endorsing policies configured for the network dictates.
    const client = new Client('127.0.0.1:7051', grpc_credentials.createSsl(tlsCert), {
      'grpc.ssl_target_name_override': 'peer0.org1.example.com'
    });

    gateway = connect({
      client,
      identity: {
        mspId: 'Org1MSP',
        credentials
      },
      signer: signers.newPrivateKeySigner(createPrivateKey(userPK)),
      hash: hash.sha256
    });

    const cleanup = () => {
      console.log('Closing gateway...');
      gateway?.close();
      client.close();
    };

    process.on('exit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('unhandledRejection', cleanup);
    process.on('uncaughtException', cleanup);
  }

  if (!network) {
    network = gateway.getNetwork(channelName);
  }

  return { gateway, network };
}
