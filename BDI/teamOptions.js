import { client } from './client.js';
import { blockedParcels, parcels, otherAgents} from './sensing.js';
import { me } from "./sensing.js"

const teammatePickups = new Set();
let teammateDelivery = null;

// Handle incoming messages from teammate
client.onMsg((id, name, msg, reply) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'pickup_intentions' && Array.isArray(msg.data)) {
        //console.log(`Received pickup intentions from ${name}: ${msg.data.join(', ')}`);
        teammatePickups.clear();
        msg.data.forEach(id => teammatePickups.add(id));
    }

    if (msg.type === 'delivery_intention' && msg.data) {
        teammateDelivery = {
            x: msg.data.x,
            y: msg.data.y,
            parcels: msg.data.parcels,
            reward: msg.data.reward,
            from: name,
            timestamp: Date.now()
        };
        //console.log(`Received delivery intention from ${name} to (${msg.data.x}, ${msg.data.y})`);
    }
    if (msg.type === 'clear_tile_for_handoff' && msg.data) {
        console.log(`[${me.name}] Received request to clear tile (${msg.data.x}, ${msg.data.y}) for teammate ${msg.data.requesterId}`);
        // Logic to move off that tile if currently occupying it
        if (Math.round(me.x) === msg.data.x && Math.round(me.y) === msg.data.y) {
            myAgent.push(['explore']); // Or a more strategic move
        }
    }

    if (msg.type === 'parcels_dropped' && msg.data) {
        const { x, y, parcels } = msg.data;
        console.log(`[${me.name}] Teammate dropped parcels at (${x}, ${y})`);

        if (Array.isArray(parcels)) {
            // Block these parcels locally (optional, if you want to prevent redelivery)
            parcels.forEach(p => blockedParcels.add(p.id));

            // Immediately plan to pick them up
            parcels.forEach(p => {
                console.log(`[${me.name}] Planning to pick up dropped parcel ${p.id} at (${x}, ${y})`);
                const intent = ['go_pick_up', x, y, p.id, p.reward];
                intent._meta = { urgent: true };
                myAgent.push(intent);
            });
        }
    }

    client.onMsg((id, name, msg) => {
        if (msg?.type === 'perception-update' && Array.isArray(msg.agents)) {
            msg.agents.forEach(agent => {
                if (agent.id !== me.id) {
                    otherAgents.set(agent.id, agent); // Keep updated teammate positions
                }
            });
        }
    });

});

// Access to current (fresh) delivery intention from teammate
function getTeammateDelivery() {
    if (!teammateDelivery) return null;
    if (Date.now() - teammateDelivery.timestamp > 10000) {
        teammateDelivery = null;
        return null;
    }
    return teammateDelivery;
}

export { teammatePickups, getTeammateDelivery };
