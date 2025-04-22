import { client } from './deliveroo/client.js';
import { me, parcels } from './beliefRevision.js';
import { distance } from './utils.js';
import { myAgent, IntentionRevisionRevise } from './intentionRevision.js';

/*
========= Generations of options based on current beliefs, filtering and selection of the best option =========
*/

/**
 * Options generation and filtering function
 * Function called every time that the agent perceive a change in the environment
 * (e.g. new parcels, new agents, or itself)
 */
export function optionsGeneration () {
    const options = [];

    // === 1. Se sto trasportando pacchi ===
    if (me.carrying.length > 0) {
        const lowValueParcels = me.carrying.filter(p => p.reward < 10);

        if (lowValueParcels.length > 0 && map.deliveryCoordinates.length > 0) {

            const filteredDeliveryZones = map.deliveryCoordinates.filter(({x, y}) => {
                const agentsInZone = agents.filter(agent => distance({x, y}, agent) < someThreshold).length;
                return agentsInZone === 0;
            });

            if (filteredDeliveryZones.length > 0) {
                // Trova la zona più vicina tra quelle disponibili
                let bestDelivery = filteredDeliveryZones.reduce((best, current) => {
                    const currentDist = distance(me, current);
                    return currentDist < distance(me, best) ? current : best;
                }, filteredDeliveryZones[0]);

                options.push(['go_deliver', bestDelivery.x, bestDelivery.y]);
            } else {
                console.log('🚫 Nessuna delivery zone disponibile o troppo affollata');
            }
        }
    }

    // === 2. Se NON sto trasportando nulla ===
    if (me.carrying.length === 0) {
        for (const parcel of parcels.values()) {
            if (!parcel.carriedBy) {
                options.push(['go_pick_up', parcel.x, parcel.y, parcel.id]);
            }
        }
    }

    // === 3. Selezione dell'opzione migliore ===
    let bestOption = null;
    let nearest = Number.MAX_VALUE;

    for (const option of options) {
        const [_, x, y] = option;
        const d = distance({x, y}, me);
        if (d < nearest) {
            nearest = d;
            bestOption = option;
        }
    }

    // === 4. Push finale ===
    if (bestOption) {
        console.log('✅ Best option:', bestOption);
        myAgent.push(bestOption);
    } else {
        console.log('Nessuna opzione valida generata');
    }
}

/**
 * Generate options at every sensing event
 */
client.onParcelsSensing( optionsGeneration )
client.onAgentsSensing( optionsGeneration )
client.onYou( optionsGeneration )


setInterval(() => { // Alternatively, generate options every 2 seconds
    if (me.id && parcels.size) {
        optionsGeneration();
    }
}, 2000);


// /**
//  * Alternatively, generate options continuously
//  */
// while (true) {
//     if ( ! me.id || ! parcels.size ) {
//         await new Promise( res => setTimeout( res, 100 ) );
//         continue;
//     }
//     optionsGeneration();
//     await new Promise( res => setTimeout( res ) );
// }