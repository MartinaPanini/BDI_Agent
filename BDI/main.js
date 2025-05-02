import {optionsGeneration} from './options.js';
import { client} from './client.js';
import {AStarMove, GoPickUp, GoDeliver, SmartExplore} from './plan.js'
import { PddlMove} from './pddl_plan.js';
import {IntentionRevisionReplace} from './intentions.js'

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

export const planLibrary = [PddlMove, GoPickUp, GoDeliver, SmartExplore];

// Start agent
export const myAgent = new IntentionRevisionReplace();
myAgent.loop();