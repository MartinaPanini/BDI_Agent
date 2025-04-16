// sensing.js
import { optionsGeneration } from "../desires/optionsGeneration.js";

/** @type {Map<string,[{id,name,x,y}|string]>} */
const beliefset = new Map();
const start = Date.now();
const seenParcelIds = new Set();
const seenAgentIds = new Set();

/** @type { {id:string, name:string, x:number, y:number, score:number} } */
const me = {id: null, name: null, x: null, y: null, score: null};
var AOD; 

client.onConfig(config => AOD = config.AGENTS_OBSERVATION_DISTANCE);

client.onYou(({ id, name, x, y, score }) => {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
});

/** @type { Map< string, {id: string, carriedBy?: string, x:number, y:number, reward:number} > } */
const parcels = new Map();

client.onParcelsSensing((pp) => {
    let triggered = false;

    for (const parcel of pp) {
        if (!seenParcelIds.has(parcel.id)) {
            seenParcelIds.add(parcel.id);
            triggered = true;
        }
        parcels.set(parcel.id, parcel);
    }

    for (const id of parcels.keys()) {
        if (!pp.find(p => p.id === id)) {
            parcels.delete(id);
        }
    }

    if (triggered) {
        optionsGeneration();
    }
});

const dist = (a1, a2) => Math.abs(a1.x - a2.x) + Math.abs(a1.y - a2.y);

client.onAgentsSensing((agents) => {
    const timestamp = Date.now() - start;
    for (let a of agents) {
        // Check if the agent is newly perceived
        if (!seenAgentIds.has(a.id)) {
            seenAgentIds.add(a.id);

            // Determine opposite direction
            const dx = me.x - a.x;
            const dy = me.y - a.y;
            let move;

            if (Math.abs(dx) > Math.abs(dy)) {
                move = dx > 0 ? 'right' : 'left';  // move away in x-direction
            } else {
                move = dy > 0 ? 'down' : 'up';     // move away in y-direction
            }

            // Push the move option
            myAgent.push(['move', move]);
        }

        // Store the belief as before
        if (!beliefset.has(a.id)) beliefset.set(a.id, []);
        const log = { id: a.id, name: a.name, x: a.x, y: a.y, score: a.score, timestamp, direction: 'none' };
        const logs = beliefset.get(a.id);
        if (logs.length > 0) {
            let previous = logs[logs.length - 1];
            if (previous.x < a.x) log.direction = 'right';
            else if (previous.x > a.x) log.direction = 'left';
            else if (previous.y < a.y) log.direction = 'up';
            else if (previous.y > a.y) log.direction = 'down';
        }
        logs.push(log);
    }

    let prettyPrint = Array.from(beliefset.values()).map((logs) => {
        const { timestamp, name, x, y, direction } = logs[logs.length - 1];
        const d = dist(me, { x, y });
        return `${name}(${direction},${d < AOD})@${timestamp}:${x},${y}`;
    }).join(' ');
    console.log(prettyPrint);
});

function getDirection(prev, curr) {
    if (prev.x < curr.x) return 'right';
    if (prev.x > curr.x) return 'left';
    if (prev.y < curr.y) return 'up';
    if (prev.y > curr.y) return 'down';
    return 'none';
}

export { parcels, me };