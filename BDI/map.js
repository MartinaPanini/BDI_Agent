import { client } from "./client.js";

const map = {
    width: 0,
    height: 0,
    tiles: new Map(),
    add(tile) { this.tiles.set(tile.x + 1000 * tile.y, tile); },
    xy(x, y) { return this.tiles.get(Math.round(x) + 1000 * Math.round(y)); }
};

client.onMap((width, height, tiles) => {
    map.width = width;
    map.height = height;
    tiles.forEach(t => map.add(t));
});

client.onTile((x, y, delivery) => {
    map.add({ x, y, type: delivery ? 2 : 1 });
});

export { map }