// options.js
import { client } from './client.js';
import { me, parcels, blockedParcels, otherAgents } from './sensing.js';
import { distance, nearestDelivery } from './utils.js';
import { myAgent, teamAgentId } from './main.js';
import { teammatePickups, getTeammateDelivery } from './teamOptions.js'; 

let AGENTS_OBSERVATION_DISTANCE;
let MOVEMENT_DURATION;
let PARCEL_DECADING_INTERVAL;

let lastDeliverySent = 0;

client.onConfig(config => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1000000;
});

const optionsWithMetadata = new Map();

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
            console.warn(`[${me.name}] Teammate is delivering to the same tile (${deliveryTile.x}, ${deliveryTile.y}) — applying utility penalty.`);
            deliveryPenalty = 0.3; 
        }

        const util = (
            carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * d2d
        ) * deliveryPenalty;

        const o = ['go_deliver'];
        o._meta = { utility: util };
        optionsWithMetadata.set(o.join(','), o._meta);
        opts.push(o);

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

            const teammate = otherAgents.get(teamAgentId);
            if (teammate && typeof teammate.x === 'number') {
                const teammateDist = distance(teammate, parcel);
                if (d > teammateDist) {
                    return;
                }
            }
            const o = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
            o._meta = { utility: util };
            optionsWithMetadata.set(o.join(','), o._meta);
            opts.push(o);
            intendedPickups.push(parcel.id);
        }
    });

    // === COMMUNICATE PICKUP INTENTIONS TO TEAMMATE ===
    if (intendedPickups.length > 0 && teamAgentId) {
    client.emitSay(teamAgentId, { 
        type: 'pickup_intentions',
        data: intendedPickups
    });
}

    // === SELECT BEST OPTION ===
    opts.sort((a, b) => b._meta.utility - a._meta.utility);
    const forcedIntention = myAgent.peek?.();
   if (forcedIntention && forcedIntention._meta?.urgent) {
    myAgent.push(forcedIntention); 
    } else if (opts.length > 0) {
        console.log(`Selected intention: ${opts[0].join(', ')} | Utility: ${opts[0]._meta.utility.toFixed(2)}`);
        myAgent.push(opts[0]);
    } else {
        myAgent.push(['explore']);
    }
}

export { optionsWithMetadata };
