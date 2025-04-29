import { client } from './config.js';
import { setupSensingHandlers } from './sensing.js';
import { IntentionRevisionReplace } from './intention.js';

import { GoDeliver, GoPickUp } from './deliveryPlans.js';
import { AStarMove, SmartExplore } from './movementPlans.js';

import { optionsWithMetadata } from './sensing.js';
import { optionsGeneration } from './optionsGeneration.js';

// Create plan library
const planLibrary = [AStarMove, GoPickUp, GoDeliver, SmartExplore];

// Instantiate agent
export const myAgent = new IntentionRevisionReplace(planLibrary);

// Set up sensing callbacks
client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);



// Set up listeners for other environmental updates (if any)
setupSensingHandlers();

// Start intention revision loop
console.log('[Main] Starting intention loop...');
myAgent.loop();
