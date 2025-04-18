import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
const client = new DeliverooApi();
import createPathfinder from '../movements/pathFinding.js';
const pathFinding = createPathfinder(client);

import { me } from '../beliefs/me.js'; // Correct import for 'me'

export class Intention {
    constructor(agent, predicate) {
        this.agent = agent;           // Reference to the Agent (or Revision)
        this.predicate = predicate;   // ['go_pick_up', 'parcel', id, parcelData, utility]
        this.stopped = false;
    }

    stop() {
        this.stopped = true;
    }

    async achieve() {
        if (this.stopped) return;

        const [type, , , parcelData] = this.predicate;

        // Get current agent position
        const from = { x: me.x, y: me.y }; // Using 'me' object here

        if (type === "go_pick_up") {
            const to = { x: parcelData.x, y: parcelData.y };
            const path = pathFinding.getPath(from, to);

            // Move along the path unless interrupted
            for (const step of path) {
                if (this.stopped) return;
                await client.move(step.x, step.y);
            }

            // Pick up the parcel
            if (this.stopped) return;
            await client.pickup(parcelData.id);
            console.log("[INFO] Picked up parcel", parcelData.id);

            return true;
        }

        if (type === "go_put_down") {
            // Deliver to any delivery location (use one near agent)
            const delivery = me.deliveryZones[0]; // Replace 'MyData' with 'me'
            const to = { x: delivery.x, y: delivery.y };
            const path = pathFinding.getPath(from, to);

            for (const step of path) {
                if (this.stopped) return;
                await client.move(step.x, step.y);
            }

            if (this.stopped) return;
            await client.putdown();
            console.log("[INFO] Delivered parcels");

            return true;
        }

        if (type === "patrolling") {
            const [x, y] = parcelData;
            const to = { x, y };
            const path = pathFinding.getPath(from, to);

            for (const step of path) {
                if (this.stopped) return;
                await client.move(step.x, step.y);
            }

            console.log("[INFO] Finished patrolling to", x, y);
            return true;
        }

        return false;
    }
}
