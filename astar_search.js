import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    'http://localhost:8080',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjA5ZmQ2NDllNzZlIiwibmFtZSI6Im1hcmNvIiwiaWF0IjoxNjc5OTk3Njg2fQ.6_zmgL_C_9QgoOX923ESvrv2i2_1bgL_cWjMw4M7ah4'
)

function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}



/**
 * @type {Map<x,Map<y,{x,y,delivery}>}
 */
const map = new Map()

client.onTile( ( x, y, delivery ) => {
    if ( ! map.has(x) )
        map.set(x, new Map)    
    map.get(x).set(y, {x, y, delivery})
} );



const {x: init_x, y: init_y} = await new Promise( res => client.onYou( res ) );
const target_x = parseInt( process.argv[2] ), target_y = parseInt( process.argv[3] );
console.log('go from', init_x, init_y, 'to', target_x, target_y);



await new Promise( res => setTimeout( res, 500 ) );



function reconstruct_path(cameFrom, current) {
    const total_path = [current]
    while ( cameFrom.has(current) ) {
        current = cameFrom.get(current)
        total_path = [current].concat( total_path ) // prepend
        console.log(total_path)
    }
    return total_path
}

export function a_star(start, goal, isWall) {
    const openSet = [start];
    const cameFrom = new Map();

    const gScore = new Map();
    gScore.set(`${start.x},${start.y}`, 0);

    const fScore = new Map();
    const h = (a) => Math.abs(a.x - goal.x) + Math.abs(a.y - goal.y);
    fScore.set(`${start.x},${start.y}`, h(start));

    while (openSet.length > 0) {
        openSet.sort((a, b) => fScore.get(`${a.x},${a.y}`) - fScore.get(`${b.x},${b.y}`));
        const current = openSet.shift();

        if (current.x === goal.x && current.y === goal.y) {
            const path = [];
            let curr = `${current.x},${current.y}`;
            while (cameFrom.has(curr)) {
                const [x, y] = curr.split(',').map(Number);
                path.unshift({ x, y });
                curr = cameFrom.get(curr);
            }
            path.unshift(start);
            return path;
        }

        const neighbors = [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 },
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

    return []; // fail-safe: no path found
}


const start = {x: init_x, y: init_y};
const goal = {x: target_x, y: target_y};
function h(e) {
    let x = e.x;
    let y = e.y;
    distance( {x: target_x, y: target_y}, {x, y} )
}

const path = a_star(start, goal, h);

for (let i = 0; i < path.length; i++) {
    const element = path[i];
    console.log( i + ' move ' +  ' ' + element.x + ',' + element.y );
}

export default a_star