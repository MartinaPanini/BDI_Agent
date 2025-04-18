import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { IntentionRevision } from './intentions/intentionRevision.js';
import { distance } from './movements/pathFinding.js';  // Assuming distance function is moved to this file for simplicity
import { parcels} from './beliefs/parcels.js'; // Assuming belief data is centralized
import { me } from './beliefs/me.js'; // Assuming belief data is centralized

const clientApi = new DeliverooApi('https://deliveroojs2.rtibdi.disi.unitn.it/');

// ✅ Corrected: instantiate the correct class
const myAgent = new IntentionRevision();

// Function to simulate the agent's thinking process and decision making
function optionsGeneration() {
    // Generate options based on the parcels available
    const options = [];
    for (const parcel of parcels.values()) {
        if (!parcel.carriedBy) {
            options.push(['go_pick_up', parcel.x, parcel.y, parcel]);
        }
    }

    // Filter the best option based on distance from the agent's current position
    let bestOption;
    let nearest = Number.MAX_VALUE;
    for (const option of options) {
        if (option[0] === 'go_pick_up') {
            const [go_pick_up, x, y, parcel] = option;
            const currentDistance = distance({ x, y }, me);
            if (currentDistance < nearest) {
                bestOption = [...option, parcel.reward - currentDistance]; // Include utility
                nearest = currentDistance;
            }
        }
    }

    // If a best option is found, push it to the agent's intention queue
    if (bestOption) {
        myAgent.push(bestOption);
    }
}

// Belief update functions
clientApi.onYou(({ id, name, x, y, score }) => {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
});

clientApi.onParcelsSensing(async (newParcels) => {
    // Update parcels based on sensor data
    for (const parcel of newParcels) {
        parcels.set(parcel.id, parcel);
    }
    for (const parcel of parcels.values()) {
        if (!newParcels.some(p => p.id === parcel.id)) {
            parcels.delete(parcel.id);
        }
    }
    // Trigger options generation after parcel sensing
    optionsGeneration();
});

// Agent decision loop
async function agentLoop() {
    while (true) {
        // Continuously revise and process intentions
        await myAgent.loop();
        // Add a delay between each iteration to simulate real-time behavior
        await new Promise(resolve => setImmediate(resolve));
    }
}

// Start the agent loop
agentLoop();
