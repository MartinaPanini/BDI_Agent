// optionsGeneration.js
import { parcels, me } from "../sensing/sensing.js";

const myAgent = [];

function distance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function optionsGeneration() {
    const options = [];
    for (const parcel of parcels.values()) {
        if (!parcel.carriedBy) {
            options.push(['go_pick_up', parcel.x, parcel.y, parcel.id]);
        }
    }

    let best_option;
    let nearest = Number.MAX_VALUE;
    for (const option of options) {
        if (option[0] === 'go_pick_up') {
            const [_, x, y, id] = option;
            const current_d = distance({ x, y }, me);
            if (current_d < nearest) {
                best_option = option;
                nearest = current_d;
            }
        }
    }

    if (best_option) {
        myAgent.push(best_option);
        console.log("Selected option:", best_option);
    }
}

export { optionsGeneration, myAgent };