import { client } from "../deliveroo/client.js";
import { Beliefset } from "@unitn-asa/pddl-client";
import { assignRoles } from "../utils.js";

const map = {
    width: 0,
    height: 0,
    MAP_NAME: null,
    myBeliefSet: new Beliefset(),
    tiles: new Map(),
    spawnTiles: new Map(),
    add(tile) { this.tiles.set(tile.x + 1000 * tile.y, tile); },
    xy(x, y) { return this.tiles.get(Math.round(x) + 1000 * Math.round(y)); }
};

client.onConfig(config => {
    map.MAP_NAME = config.MAP_FILE; 
});
client.onMap((width, height, tiles, beliefset) => {
    map.width = width;
    map.height = height;

    if (Array.isArray(beliefset)) {
        beliefset.forEach(b => map.myBeliefSet.declare(b));
    } else {
        updateBeliefset();
    }
    map.spawnTiles.clear(); 
    tiles.forEach(t => {
        map.add(t);
        if (t.type === 1) {
            map.spawnTiles.set(`${t.x},${t.y}`, t);
        }
    });
});
client.onTile((x, y, delivery) => {
    const tile = { x, y, type: delivery ? 2 : 1 };
    map.add(tile);

    if (tile.type === 1) {
        map.spawnTiles.set(`${x},${y}`, tile);
    }
});

function updateBeliefset() {
    map.myBeliefSet = new Beliefset();

    for (let tile of map.tiles.values()) {
        const { x, y, type } = tile;
        if (type === 0 || type === -1) continue;
        const right = map.xy(x + 1, y);
        if (right && right.type > 0)
            map.myBeliefSet.declare(`right t${x}_${y} t${x + 1}_${y}`);
        const left = map.xy(x - 1, y);
        if (left && left.type > 0)
            map.myBeliefSet.declare(`left t${x}_${y} t${x - 1}_${y}`);
        const up = map.xy(x, y + 1);
        if (up && up.type > 0)
            map.myBeliefSet.declare(`up t${x}_${y} t${x}_${y + 1}`);
        const down = map.xy(x, y - 1);
        if (down && down.type > 0)
            map.myBeliefSet.declare(`down t${x}_${y} t${x}_${y - 1}`);
    }
}

export { map, updateBeliefset }