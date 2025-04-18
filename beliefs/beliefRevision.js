import { client } from "../deliveroo/client.js";
import { me } from "./me.js";
import { agents, updateAgents } from "./agents.js";
import { updateDeliveryZones, getSafestZone } from "./map.js";

// Memory of each agent's positions over time
const memory = new Map(); // agentId -> [{ x, y, time }]
const lastSeen = new Map(); // agentId -> timestamp

client.onAgentsSensing((sensedAgents) => {
    const now = Date.now();
    const seenNow = new Set(); // Track agents currently sensed

    // Update agent beliefs and process each sensed agent
    updateAgents(sensedAgents);

    for (const a of sensedAgents) {
        seenNow.add(a.id);

        const previous = memory.get(a.id);
        const lastTimeSeen = lastSeen.get(a.id);

        if (!previous) {
            // First time seeing this agent
            console.log("Hello", a.name);
            memory.set(a.id, [{ x: a.x, y: a.y, time: now }]);
        } else {
            const last = previous[previous.length - 1];

            if (last.time === lastTimeSeen) {
                // Same tick as before
                if (last.x === a.x && last.y === a.y) {
                    console.log("You are still in same place as before");
                } else {
                    console.log("You are moving", a.name);
                }
            } else {
                // Agent seen after a break
                if (last.x === a.x && last.y === a.y) {
                    console.log("Welcome back, seems you are still here as before", a.name);
                } else {
                    console.log("Welcome back, seems that moved", a.name);
                }
            }

            // Add new position to memory
            previous.push({ x: a.x, y: a.y, time: now });
            memory.set(a.id, previous);
        }

        // Update timestamp of last seen
        lastSeen.set(a.id, now);
    }

    // Forget agents who are no longer seen
    for (const [id, previous] of memory.entries()) {
        if (!seenNow.has(id)) {
            const last = previous[previous.length - 1];
            const delta = now - lastSeen.get(id);

            if (delta < 2000) {
                console.log("Bye", id);
            } else if (delta < 8000) {
                console.log("It's a while that I don't see", id, "I remember him in", last.x, last.y);
            } else {
                const d = Math.abs(me.x - last.x) + Math.abs(me.y - last.y);
                if (d <= 3) {
                    console.log("I remember", id, "was within 3 tiles from here. Forget him.");
                    memory.delete(id);
                    lastSeen.delete(id);
                }
            }
        }
    }
});

// Update beliefs when agent moves
function updateAgentPosition(newX, newY) {
    me.x = newX;
    me.y = newY;
  
    // Optionally update agent beliefs
    updateAgents(me);
  }

export { memory, updateDeliveryZones, getSafestZone, lastSeen, updateAgentPosition };