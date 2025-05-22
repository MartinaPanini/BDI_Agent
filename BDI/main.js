import {optionsGeneration} from './options.js';
import { client} from './client.js';
import {AStarMove, GoPickUp, GoDeliver, SmartExplore, ExploreSpawnTiles} from './plan.js'
import { PddlMove} from './pddl_plan.js';
import {IntentionRevisionReplace} from './intentions.js'
import { pickupCoordination } from './shared.js';
import argsParser from 'args-parser';
import { me, ally } from './sensing.js'; // Import me and ally

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