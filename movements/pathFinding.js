// pathfinding.js
import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

// Manhattan distance function
export function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    return Math.abs(Math.round(x1) - Math.round(x2)) + Math.abs(Math.round(y1) - Math.round(y2));
}

export default function createPathfinder(/** @type {DeliverooApi} */ client) {
    let AGENTS_OBSERVATION_DISTANCE;
    let MOVEMENT_DURATION;

    client.onConfig(config => {
        AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
        MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    });

    const map = new Map();

    client.onTile(({ x, y, type }) => {
        map.set(`${x}_${y}`, { x, y, type });
    });

    const me = { x: undefined, y: undefined };
    client.onYou(({ x, y }) => {
        me.x = x;
        me.y = y;
    });

    const agents = new Map();

    client.onAgentsSensing((sensedAgents) => {
        for (const { id, x, y } of sensedAgents) {
            agents.set(id, { id, x, y });
        }

        for (const [id, { x, y }] of agents.entries()) {
            if (
                distance(me, { x, y }) < AGENTS_OBSERVATION_DISTANCE &&
                !sensedAgents.find(sensed => id === sensed.id)
            ) {
                agents.delete(id);
            }
        }
    });

    return function pathfind({ x: initX, y: initY }, { x: targetX, y: targetY }) {
        initX = Math.round(initX);
        initY = Math.round(initY);
        targetX = Math.round(targetX);
        targetY = Math.round(targetY);

        // Mark nearby agent positions as locked
        for (const { x, y } of agents.values()) {
            try {
                map.get(`${Math.ceil(x)}_${Math.ceil(y)}`).locked = true;
                map.get(`${Math.floor(x)}_${Math.floor(y)}`).locked = true;
            } catch {}
        }

        // Recursive DFS with best-first order
        function search(cost, x, y, previous, action) {
            const key = `${x}_${y}`;
            const tile = map.get(key);
            if (!tile || tile.type === '0' || tile.locked) return false;

            if (tile.cost_to_here !== undefined && tile.cost_to_here <= cost) return false;

            tile.cost_to_here = cost;
            tile.previous_tile = previous;
            if (action) tile.action_from_previous = action;

            if (x === targetX && y === targetY) return true;

            const neighbors = [
                [cost + 1, x + 1, y, tile, 'right'],
                [cost + 1, x - 1, y, tile, 'left'],
                [cost + 1, x, y + 1, tile, 'up'],
                [cost + 1, x, y - 1, tile, 'down']
            ];

            neighbors.sort((a, b) =>
                distance({ x: targetX, y: targetY }, { x: a[1], y: a[2] }) -
                distance({ x: targetX, y: targetY }, { x: b[1], y: b[2] })
            );

            for (const option of neighbors) {
                search(...option);
            }
        }

        // Start search
        search(0, initX, initY);

        const plan = [];
        let dest = map.get(`${targetX}_${targetY}`);

        while (dest && dest.previous_tile) {
            plan.unshift({
                step: dest.cost_to_here,
                action: dest.action_from_previous,
                current: { x: dest.x, y: dest.y }
            });
            dest = dest.previous_tile;
        }

        // Clean up
        for (const tile of map.values()) {
            delete tile.cost_to_here;
            delete tile.previous_tile;
            delete tile.action_from_previous;
            delete tile.locked;
        }

        return plan;
    };
}
