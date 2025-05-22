import { client } from './client.js';
import { blockedParcels, parcels, otherAgents} from './sensing.js';
import { me } from "./sensing.js"

const teammatePickups = new Set();
let teammateDelivery = null;

client.onMsg((id, name, msg, reply) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'pickup_intentions' && Array.isArray(msg.data)) {
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
    }
    if (msg.type === 'clear_tile_for_handoff' && msg.data) {
        if (Math.round(me.x) === msg.data.x && Math.round(me.y) === msg.data.y) {
            myAgent.push(['explore']); 
        }
    }
    if (msg?.type === 'parcel_claimed') {
    const parcelId = msg.data.id;
    blockedParcels.add(parcelId);
    teammatePickups.delete(parcelId);
    }
    if (msg.type === 'parcels_dropped' && msg.data.urgent) {
    parcels.forEach(p => {
        const intent = ['go_pick_up', x, y, p.id, p.reward];
        intent._meta = {
            urgent: true,
            utility: 2000 + p.reward 
        };
        myAgent.push(intent);
        });
    }

    client.onMsg((id, name, msg) => {
        if (msg?.type === 'perception-update' && Array.isArray(msg.agents)) {
            msg.agents.forEach(agent => {
                if (agent.id !== me.id) { otherAgents.set(agent.id, agent); }
            });
        }
    });

});

function getTeammateDelivery() {
    if (!teammateDelivery) return null;
    if (Date.now() - teammateDelivery.timestamp > 10000) {
        teammateDelivery = null;
        return null;
    }
    return teammateDelivery;
}

export { teammatePickups, getTeammateDelivery };
