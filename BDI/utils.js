import { map } from './map.js';

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