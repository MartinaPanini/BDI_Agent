import {optionsGeneration} from './Intentions/options.js';
import { client} from './deliveroo/client.js';
import {AStarMove, GoPickUp, GoDeliver, SmartExplore, ExploreSpawnTiles} from './Plan/plan.js'
import { PddlMove} from './Plan/PDDL/pddl_plan.js';
import {IntentionRevisionReplace} from './Intentions/intentions.js'
import { pickupCoordination } from './Communication/shared.js';
import argsParser from 'args-parser';
import { me, ally } from './Beliefs/sensing.js'; // Import me and ally

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

const args = argsParser(process.argv);
export const teamAgentId = args.teamId;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Ricezione messaggi per la coordinazione del pickup
client.onMsg(async (id, name, msg, reply) => {
    if (msg?.action === 'pickup') {
        await sleep(Math.random() * 50);
        if (reply) {
            if (pickupCoordination[msg.parcelId] === client.id) {
                reply(false); // io sto già andando
            } else {
                pickupCoordination[msg.parcelId] = id;
                reply(true); // vai pure tu
            }
        }
    }
});

export const planLibrary = [AStarMove, GoPickUp, GoDeliver, ExploreSpawnTiles];

// Start agent
export const myAgent = new IntentionRevisionReplace();
myAgent.loop();