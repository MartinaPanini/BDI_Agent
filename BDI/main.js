import {optionsGeneration} from './Intentions/options.js';
import { client} from './deliveroo/client.js';
import {AStarMove, GoPickUp, GoDeliver, SmartExplore, ExploreSpawnTiles} from './Plan/plan.js'
import { PddlMove} from './Plan/PDDL/pddl_plan.js';
import {IntentionRevisionReplace} from './Intentions/intentions.js'
import argsParser from 'args-parser';
import { assignRoles } from "./utils.js";
import { me } from "../BDI/Beliefs/sensing.js";
 
const args = argsParser(process.argv);
export const teamAgentId = args.teamId;

function waitForYou() {
    return new Promise(resolve => {
        client.onYou(() => {
            resolve();           
        });
    });
}

await waitForYou();      
await assignRoles();        

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

// Define the plan library based on whether we are in single-agent mode
export const planLibrary = teamAgentId === undefined || teamAgentId === null
    ? [PddlMove, GoPickUp, GoDeliver, ExploreSpawnTiles]
    : [AStarMove, GoPickUp, GoDeliver, ExploreSpawnTiles];
export const myAgent = new IntentionRevisionReplace();

myAgent.loop();
