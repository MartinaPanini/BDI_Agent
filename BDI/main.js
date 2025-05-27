import {optionsGeneration} from './Intentions/options.js';
import { client} from './deliveroo/client.js';
import {AStarMove, GoPickUp, GoDeliver, SmartExplore, ExploreSpawnTiles} from './Plan/plan.js'
import { PddlMove} from './Plan/PDDL/pddl_plan.js';
import {IntentionRevisionReplace} from './Intentions/intentions.js'
import argsParser from 'args-parser';
import { assignRoles } from "./utils.js";
import { me } from "../BDI/Beliefs/sensing.js";
import { pickerBehavior } from './Communication/hallway/picker.js';
 
const args = argsParser(process.argv);
export const teamAgentId = args.teamId;

function waitForYou() {
    return new Promise(resolve => {
        client.onYou(() => {
            resolve();            // segnala che "me" è pronto
        });
    });
}

await waitForYou();      
await assignRoles();        

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

export const planLibrary = [PddlMove, GoPickUp, GoDeliver, ExploreSpawnTiles];
export const myAgent = new IntentionRevisionReplace();

if (me.role === 'picker'){
    pickerBehavior();
}else if (me.role === 'deliver'){

}else{myAgent.loop();}
