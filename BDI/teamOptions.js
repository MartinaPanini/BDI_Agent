import { client } from './client.js';
import { me } from './sensing.js';

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