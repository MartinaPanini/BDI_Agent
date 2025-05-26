import { map } from './map.js';
import { otherAgents, me } from './sensing.js';
import { visitedTiles } from './plan.js';
import fs from 'fs';

export function positionsEqual(a, b) {
    return a.x === b.x && a.y === b.y;
}

/**
 * Read the content of a file
 * 
 * @param {string} path - path to the file 
 * @returns {Promise<string>} - the content of the file
 */
export function readFile(path) {
    return new Promise((res, rej) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) rej(err)
            else res(data)
        })
    })
}

export function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    return Math.abs(Math.round(x1) - Math.round(x2)) + Math.abs(Math.round(y1) - Math.round(y2));
}

export function recordVisit(x, y) {
    const key = `${Math.round(x)},${Math.round(y)}`;
    visitedTiles.set(key, (visitedTiles.get(key) || 0) + 1);
}

export function getDirection(x1, y1, x2, y2) {
    if (x2 > x1) return 'right';
    if (x2 < x1) return 'left';
    if (y2 > y1) return 'up';
    if (y2 < y1) return 'down';
    return null;
}

export function nearestDelivery({ x, y }) {
    return Array.from(map.tiles.values())
        .filter(t => t.type === 2)
        .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0];
}

export function isTileBlockedByAgent(x, y) {
    for (const agent of otherAgents.values()) {
        if (Math.round(agent.x) === Math.round(x) && Math.round(agent.y) === Math.round(y)) {
            return true;
        }
    }
    return false;
}

// Utilities for SmartExplore
export const center = { x: map.width / 2, y: map.height / 2 };

export const isWall = (xx, yy) => {
    const t = map.xy(xx, yy);
    return (!t || t.type === 0);
};

export function isAgentNearby(x, y) {
    for (const agent of otherAgents.values()) {
        const d = distance(me, agent);
        if (d <= 1) return true;
    }
    return false;
}