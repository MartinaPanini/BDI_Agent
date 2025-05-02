import { client } from "./client.js";
import { Beliefset } from "@unitn-asa/pddl-client";

const map = {
    width: 0,
    height: 0,
    myBeliefSet: new Beliefset(),
    tiles: new Map(),
    add(tile) { this.tiles.set(tile.x + 1000 * tile.y, tile); },
    xy(x, y) { return this.tiles.get(Math.round(x) + 1000 * Math.round(y)); }
};

client.onMap((width, height, tiles, beliefset) => {
    //console.log('Received onMap event with beliefset:', beliefset);

    map.width = width;
    map.height = height;

    // Only process beliefset if it's a valid array
    if (Array.isArray(beliefset)) {
        beliefset.forEach(b => map.myBeliefSet.declare(b));
    } else {
        updateBeliefset(); // fall back on reconstructing it
    }
    

    tiles.forEach(t => map.add(t));
});


client.onTile((x, y, delivery) => {
    map.add({ x, y, type: delivery ? 2 : 1 });
});

 /**
     * function to update the beliefset used in planning
     * this function use the map to find the tiles and their neighbors 
     */
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