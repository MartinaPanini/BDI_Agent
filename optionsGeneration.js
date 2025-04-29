import {
    DELIVERY_ZONE_THRESHOLD,
    MOVEMENT_DURATION,
    PARCEL_DECADING_INTERVAL,
    AGENTS_OBSERVATION_DISTANCE
} from './config.js';
import { nearestDelivery } from './mapManager.js';
import { distance } from './helpers.js';
import {
    parcels,
    otherAgents,
    blockedParcels,
    optionsWithMetadata
} from './sensing.js';
import { myAgent } from './main.js';
import { me } from './agentState.js';

export function optionsGeneration() {
    optionsWithMetadata.clear();
    const carriedQty = me.carrying.size;
    const carriedReward = Array.from(me.carrying.values()).reduce((a, p) => a + p.reward, 0);
    const deliveryTile = nearestDelivery(me);

    if (!deliveryTile) return;

    const d2d = distance(me, deliveryTile);
    const opts = [];

    // === DELIVERY OPTION ===
    if (carriedReward > 0) {
        let deliveryPenalty = 0;
        for (const agent of otherAgents.values()) {
            const d = distance(agent, deliveryTile);
            if (d <= 1) deliveryPenalty += 5;
            else if (d <= 2) deliveryPenalty += 3;
            else if (d <= 3) deliveryPenalty += 1;
        }

        const util = (
            d2d < DELIVERY_ZONE_THRESHOLD
                ? carriedReward
                : carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * d2d
        ) - deliveryPenalty;

        const pred = ['go_deliver'];
        optionsWithMetadata.set(pred.join(','), { utility: util });
        opts.push({ pred, utility: util });
    }

    // === PICKUP OPTIONS ===
    if (carriedReward <= 0 || parcels.size > 0) {
        parcels.forEach(parcel => {
            const d = distance(me, parcel);
            if (!parcel.carriedBy && !blockedParcels.has(parcel.id) && d <= AGENTS_OBSERVATION_DISTANCE && !me.carrying.has(parcel.id)) {
                let agentPenalty = 0;
                for (const agent of otherAgents.values()) {
                    const agentDistance = distance(parcel, agent);
                    if (agentDistance <= 1) agentPenalty += 5;
                    else if (agentDistance <= 2) agentPenalty += 3;
                    else if (agentDistance <= 3) agentPenalty += 1;
                }

                const totalDistance = distance(me, parcel) + distance(parcel, deliveryTile);
                const decayPenalty = (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * totalDistance;
                const util = carriedReward + parcel.reward - decayPenalty - agentPenalty;

                const pred = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
                optionsWithMetadata.set(pred.join(','), { utility: util });
                opts.push({ pred, utility: util });
            }
        });
    }

    // === Sort and push ===
    opts.sort((a, b) => b.utility - a.utility);

    if (opts.length > 0) {
        console.log('[OptionsGeneration] Pushing best option:', opts[0].pred, 'with utility:', opts[0].utility);
        myAgent.push(opts[0].pred);
    } else {
        console.log('[OptionsGeneration] No valid options, falling back to smart_explore.');
        myAgent.push(['smart_explore']);
    }

    console.log('[OptionsGeneration] Sorted options:', opts.map(o => ({ pred: o.pred, utility: o.utility })));
}
