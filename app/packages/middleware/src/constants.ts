import { join } from 'node:path';

export interface CommonChaincodeQueryParameters {
  pkg: string;
  node: string;
}

const fabricPath = process.env.FABRIC_TOOLS_PATH ?? '/fabric';

export const chaincodePath = process.env.CHAINCODE_PATH ?? '/chaincodes';
export const networkSh = join(fabricPath, 'test-network/network.sh');
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
