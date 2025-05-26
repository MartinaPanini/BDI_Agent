export function a_star(start, goal, isWall) {
    const openSet = [start];
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(`${start.x},${start.y}`, 0);

    const fScore = new Map();
    const h = (a) => Math.abs(a.x - goal.x) + Math.abs(a.y - goal.y);
    fScore.set(`${start.x},${start.y}`, h(start));

    while (openSet.length > 0) {
        openSet.sort((a, b) => (fScore.get(`${a.x},${a.y}`) - fScore.get(`${b.x},${b.y}`)));
        const current = openSet.shift();

        if (current.x === goal.x && current.y === goal.y) {
            // Reconstruct path
            const path = [];
            let currKey = `${current.x},${current.y}`;
            while (cameFrom.has(currKey)) {
                const [cx, cy] = currKey.split(',').map(Number);
                path.unshift({ x: cx, y: cy });
                currKey = cameFrom.get(currKey);
            }
            path.unshift(start);
            return path;
        }

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 }
        ].filter(n => !isWall(n.x, n.y));

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            const tentativeG = gScore.get(`${current.x},${current.y}`) + 1;

            if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
                cameFrom.set(neighborKey, `${current.x},${current.y}`);
                gScore.set(neighborKey, tentativeG);
                fScore.set(neighborKey, tentativeG + h(neighbor));

                if (!openSet.some(n => n.x === neighbor.x && n.y === neighbor.y)) {
                    openSet.push(neighbor);
                }
            }
        }
    }

    return []; // If no path found
}
