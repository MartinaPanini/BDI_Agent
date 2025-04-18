import { client } from "../client.js";
import { me } from "./me.js";

export const parcels = new Map();

client.onParcelsSensing((sensedParcels) => {
    const seenIds = new Set();

    for (const p of sensedParcels) {
        parcels.set(p.id, p);
        seenIds.add(p.id);
    }

    for (const id of parcels.keys()) {
        if (!seenIds.has(id)) {
            const p = parcels.get(id);
            if (!p.carriedBy || p.carriedBy === me.id) {
                parcels.delete(id);
            }
        }
    }

    // Sync my carried parcels
    for (const id of me.carrying) {
        if (parcels.has(id)) {
            const p = parcels.get(id);
            p.carriedBy = me.id;
        }
    }
});
