import { client } from "../deliveroo/client.js";
import pathFinding from '../movements/pathFinding.js';


export const agents = new Map();

client.onAgentsSensing((sensedAgents) => {
    agents.clear();
    for (const a of sensedAgents) {
        agents.set(a.id, a);
    }
});

export function getSafestNearbyTile(tiles, meX, meY) {
    const crowdMap = {};

    for (const agent of agents.values()) {
        const key = `${agent.x},${agent.y}`;
        crowdMap[key] = (crowdMap[key] || 0) + 1;
    }

    let bestTile = null;
    let minCrowd = Infinity;

    for (const tile of tiles) {
        const key = `${tile.x},${tile.y}`;
        const crowd = crowdMap[key] || 0;
        if (crowd < minCrowd) {
            minCrowd = crowd;
            bestTile = tile;
        }
    }

    return bestTile;
}

// Assuming `me` holds the agent's current position
export function handleMovement(targetX, targetY) {
    const path = pathFinding(me, {x: targetX, y: targetY});
    
    if (path) {
      for (let step of path) {
        console.log(`Moving ${step.action} to ${step.current.x}, ${step.current.y}`);
        // Update agent's belief about its position
        me.x = step.current.x;
        me.y = step.current.y;
        // You can also add logic to update the agent’s belief state after each move
      }
    }
  }

/**
 * Returns the closest agent to the given (x, y) position.
 * @param {Map<string, {x: number, y: number}>} agents - A map of agents.
 * @param {number} x - The X coordinate to compare.
 * @param {number} y - The Y coordinate to compare.
 * @returns {{x: number, y: number} | null}
 */
export function getClosestAgent(agents, x, y) {
    let closestAgent = null;
    let minDistanceSq = Infinity; // use squared distance to avoid sqrt

    for (const agent of agents.values()) {
        const dx = agent.x - x;
        const dy = agent.y - y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            closestAgent = agent;
        }
    }

    return closestAgent;
}
