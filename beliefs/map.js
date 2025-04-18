import { client } from "../deliveroo/client.js";
import { agents } from "./otherAgents.js";

export const map = {
    tiles: [],
    deliveryAreas: new Set(),
    width: 0,
    height: 0
};

// Hook into the map config
client.onMap((newMap) => {
    const mapChanged = JSON.stringify(newMap.tiles) !== JSON.stringify(map.tiles);
    if (mapChanged) {
        map.deliveryAreas.clear();
    }

    map.tiles = newMap.tiles;
    map.width = newMap.width;
    map.height = newMap.height;

    for (let x = 0; x < map.width; x++) {
        for (let y = 0; y < map.height; y++) {
            const tile = map.tiles[x][y];
            if (tile === "D") {
                map.deliveryAreas.add(`${x},${y}`);
            }
        }
    }
});

// Add delivery zone manually (optional)
export function updateDeliveryZones(x, y) {
    map.deliveryAreas.add(`${x},${y}`);
}

// Clear delivery zones (if needed)
export function resetDeliveryZones() {
    map.deliveryAreas.clear();
}

// Return the safest delivery area (least agents nearby within distance 3)
export function getSafestZone() {
    const agentCounts = new Map();

    for (const zone of map.deliveryAreas) {
        const [zx, zy] = zone.split(',').map(Number);
        let count = 0;

        for (const agent of agents.values()) {
            const dx = Math.abs(agent.x - zx);
            const dy = Math.abs(agent.y - zy);
            if (dx + dy <= 3) count++;
        }

        agentCounts.set(zone, count);
    }

    let safest = null;
    let min = Infinity;

    for (const [zone, count] of agentCounts.entries()) {
        if (count < min) {
            min = count;
            safest = zone;
        }
    }

    if (safest) {
        const [x, y] = safest.split(',').map(Number);
        return { x, y };
    }

    return null;
}
