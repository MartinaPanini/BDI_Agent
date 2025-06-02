import { client } from '../deliveroo/client.js';
import { me } from '../Beliefs/sensing.js';

const teammatePickups = new Set(); // Set of parcel IDs that the teammate intends to pick up
let teammateDelivery = null; // Object representing the teammate's delivery intention with details

/**
 * Handles incoming messages from other agents via the client communication system.
 * 
 * Listens specifically for:
 * - 'pickup_intentions': a list of parcel IDs the teammate plans to pick up.
 * - 'delivery_intention': detailed info about the teammate's planned delivery.
 */
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
});

/**
 * Retrieves the teammate's current delivery intention if it is recent.
 * 
 * Returns `null` if no delivery intention exists or if it is older than 10 seconds.
 * 
 * @returns {Object|null} Teammate delivery info or null if outdated/missing.
 */
function getTeammateDelivery() {
    if (!teammateDelivery) return null;
    if (Date.now() - teammateDelivery.timestamp > 10000) {
        teammateDelivery = null;
        return null;
    }
    return teammateDelivery;
}

export { teammatePickups, getTeammateDelivery };