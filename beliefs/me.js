import { client } from "../deliveroo/client.js";

export const me = {
    id: null,
    name: null,
    x: null,
    y: null,
    score: null,
    carrying: []
};

client.onYou(({ id, name, x, y, score, parcels }) => {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
    me.carrying = Array.isArray(parcels) ? parcels : [];
});
