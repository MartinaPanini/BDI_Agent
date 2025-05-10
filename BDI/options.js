import{client} from './client.js';
import { me, parcels, otherAgents } from './sensing.js';
import { distance, nearestDelivery } from './utils.js';
import { myAgent} from './main.js';
import { blockedParcels } from './sensing.js';

let AGENTS_OBSERVATION_DISTANCE;
let PARCEL_OBSERVATION_DISTANCE;
let MOVEMENT_DURATION;
let PARCEL_DECADING_INTERVAL;
const DELIVERY_ZONE_THRESHOLD = 5; // Threshold for delivery zone
// Config loading
client.onConfig(config => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1000000;
    PARCEL_OBSERVATION_DISTANCE = config.PARCEL_OBSERVATION_DISTANCE;
});

const optionsWithMetadata = new Map();
export function optionsGeneration() {
    optionsWithMetadata.clear();
    const carriedQty = me.carrying.size;
    const carriedReward = Array.from(me.carrying.values()).reduce((a, p) => a + p.reward, 0);
    const opts = [];
    const deliveryTile = nearestDelivery(me);

    if (!deliveryTile) return;

    const d2d = distance(me, deliveryTile);

    // === DELIVERY OPTION ===
    if (carriedReward > 0) {
        // Penalità se altri agenti sono vicini alla zona di consegna
        let deliveryPenalty = 0;
        for (const agent of otherAgents.values()) {
            const d = distance(agent, deliveryTile);
            if (d <= 1) deliveryPenalty += 0.7;
            else if (d <= 2) deliveryPenalty += 0.8;
            else if (d <= 3) deliveryPenalty += 0.9;
        }

        const util = (
            (d2d < DELIVERY_ZONE_THRESHOLD)
                ? carriedReward
                : carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * d2d
        ) * deliveryPenalty;

        const o = ['go_deliver'];
        o._meta = { utility: util };
        optionsWithMetadata.set(o.join(','), o._meta);
        opts.push(o);
    }

    // === PICKUP OPTIONS ===
    if (carriedReward <= 0 || parcels.size > 0) {
        parcels.forEach(parcel => {
            const d = distance(me, parcel);
            if (!parcel.carriedBy && !blockedParcels.has(parcel.id) && d <= AGENTS_OBSERVATION_DISTANCE && !me.carrying.has(parcel.id)) {
                let agentPenalty = 1;

                for (const agent of otherAgents.values()) {
                    const agentDistance = distance(parcel, agent);
                    if (agentDistance <= 1) agentPenalty = 0.5;
                    else if (agentDistance <= 2) agentPenalty = 0.75;
                    else if (agentDistance <= 3) agentPenalty = 0.9;
                }

                const totalDistance = distance(me, parcel) + distance(parcel, deliveryTile);
                const decayPenalty = (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * totalDistance;

                const util = (carriedReward + parcel.reward - decayPenalty) * agentPenalty;

                const o = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
                o._meta = { utility: util };
                optionsWithMetadata.set(o.join(','), o._meta);
                opts.push(o);
            }
        });
    }

    // === Sort and select ===
    opts.sort((a, b) => b._meta.utility - a._meta.utility);

    if (opts.length > 0) {
        myAgent.push(opts[0]);
    } else {
        // console.log('[OptionsGeneration] No valid options, falling back to smart exploration.');
        myAgent.push(['explore']);
    }

    // console.log('Option Sorted ', opts);
}

export { optionsWithMetadata }