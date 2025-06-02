// options.js
import { client } from '../deliveroo/client.js';
import { me, parcels, blockedParcels } from '../Beliefs/sensing.js';
import { distance, nearestDelivery } from '../utils.js';
import { myAgent, teamAgentId } from '../main.js';
import { teammatePickups, getTeammateDelivery } from '../Communication/teamOptions.js'; 

let AGENTS_OBSERVATION_DISTANCE;
let MOVEMENT_DURATION;
let PARCEL_DECADING_INTERVAL;

client.onConfig(config => { // Listen to config updates from the client and assign parameters
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1000000;
});

const optionsWithMetadata = new Map(); // Map storing available options keyed by their stringified predicates and their metadata (utility etc.)

/**
 * Generates and updates the current set of possible agent options.
 * It evaluates delivery and pickup options based on utility and environmental factors,
 * communicates intentions to teammates, and pushes the best option to the agent's intention queue.
 */
export function optionsGeneration() {
    optionsWithMetadata.clear();
    const opts = [];
    const deliveryTile = nearestDelivery(me);
    const carriedQty = me.carrying.size;
    const carriedReward = Array.from(me.carrying.values()).reduce((a, p) => a + p.reward, 0);

    if (!deliveryTile) return;

    const d2d = distance(me, deliveryTile);

    // === DELIVERY OPTION ===
    if (carriedReward > 0) {
        const teammateDel = getTeammateDelivery();
        let deliveryPenalty = 1;

        if (teammateDel && teammateDel.x === deliveryTile.x && teammateDel.y === deliveryTile.y) {
            deliveryPenalty = 0.5; 
        }

        const util = (
            carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * d2d
        ) * deliveryPenalty;

        const o = ['go_deliver'];
        o._meta = { utility: util };
        optionsWithMetadata.set(o.join(','), o._meta);
        opts.push(o);

        // Share delivery intention
        setTimeout(() => {
            client.emitSay(teamAgentId, {
                type: 'delivery_intention',
                data: {
                    x: deliveryTile.x,
                    y: deliveryTile.y,
                    parcels: carriedQty,
                    reward: carriedReward
                }
            });
        }, 100);
    }

    // === PICKUP OPTIONS ===
    const intendedPickups = [];

    parcels.forEach(parcel => {
        const d = distance(me, parcel);
        if (
            !parcel.carriedBy &&
            !blockedParcels.has(parcel.id) &&
            d <= AGENTS_OBSERVATION_DISTANCE &&
            !me.carrying.has(parcel.id) &&
            !teammatePickups.has(parcel.id)
        ) {
            const totalDistance = distance(me, parcel) + distance(parcel, deliveryTile);
            const decayPenalty = (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * totalDistance;
            const util = (carriedReward + parcel.reward - decayPenalty);

            const o = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
            o._meta = { utility: util };
            optionsWithMetadata.set(o.join(','), o._meta);
            opts.push(o);
            intendedPickups.push(parcel.id);
        }
    });

    // Share pick_ip intentions
    if (intendedPickups.length > 0 && teamAgentId) {
        setTimeout(() => {
            client.emitSay(teamAgentId, {
                type: 'pickup_intentions',
                data: intendedPickups
            });
        }, 100);
    }

    // === SELECT BEST OPTION ===
    opts.sort((a, b) => b._meta.utility - a._meta.utility);
    if (opts.length > 0) {
        myAgent.push(opts[0]);
    } else {
        myAgent.push(['explore']); // Fallback to exploration if no options available
    }
}

export { optionsWithMetadata };