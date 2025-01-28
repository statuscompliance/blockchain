import { join } from 'node:path';

const fabricPath = process.env.FABRIC_TOOLS_PATH ?? '/fabric';

export const chaincodePath = process.env.CHAINCODE_PATH ?? '/chaincodes';
export const networkSh = join(fabricPath, 'test-network/network.sh');
export const channelName = 'statuscompliance';
