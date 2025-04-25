// --- intention_revision.js (with A* integration) ---

import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { a_star } from "./astar_search.js";
import EventEmitter from "events";

const client = new DeliverooApi(
    'https://deliveroojs2.rtibdi.disi.unitn.it/',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjQxYzdhYiIsIm5hbWUiOiJ0ZXN0Iiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDUzMDY1ODJ9.474kBOhupyTQ3GflIZVjm6xwYMTSPKzrTm1wBWnhHyA'
);

function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    return Math.abs(Math.round(x1) - Math.round(x2)) + Math.abs(Math.round(y1) - Math.round(y2));
}

var AGENTS_OBSERVATION_DISTANCE, MOVEMENT_DURATION, PARCEL_DECADING_INTERVAL;
const DELIVERY_ZONE_THRESHOLD = 5;

client.onConfig((config) => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1000000;
});

const map = {
    width: undefined,
    height: undefined,
    tiles: new Map(),
    add(tile) {
        const { x, y } = tile;
        return this.tiles.set(x + 1000 * y, tile);
    },
    xy(x, y) {
        return this.tiles.get(x + 1000 * y);
    }
};

client.onMap((width, height, tiles) => {
    map.width = width;
    map.height = height;
    for (const t of tiles) map.add(t);
});

client.onTile((x, y, delivery) => {
    map.add({ x, y, delivery });
});

function nearestDelivery({ x, y }) {
    return Array.from(map.tiles.values()).filter(({ type }) => type === 2).sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0];
}

const me = { id: null, name: null, x: null, y: null, score: null, carrying: new Map() };

client.onYou(({ id, name, x, y, score }) => {
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
});

const parcels = new Map();
const sensingEmitter = new EventEmitter();

client.onParcelsSensing((perceived_parcels) => {
    let new_parcel_sensed = false;
    for (const p of perceived_parcels) {
        if (!parcels.has(p.id)) new_parcel_sensed = true;
        parcels.set(p.id, p);
        if (p.carriedBy === me.id) me.carrying.set(p.id, p);
    }
    for (const [id, p] of parcels.entries()) {
        if (!perceived_parcels.find(q => q.id === id) && p.carriedBy === me.id) {
            parcels.delete(id);
            me.carrying.delete(id);
        }
    }
    if (new_parcel_sensed) sensingEmitter.emit("new_parcel");
});

const optionsWithMetadata = new Map();
function optionsGeneration() {
    let carriedQty = me.carrying.size;
    let carriedReward = Array.from(me.carrying.values()).reduce((acc, parcel) => acc + parcel.reward, 0);
    const options = [];

    const deliveryTile = nearestDelivery(me);
    const distanceToDelivery = distance(me, deliveryTile);
    let deliveryUtility = 0;

    if (carriedReward > 0) {
        deliveryUtility = (distanceToDelivery < DELIVERY_ZONE_THRESHOLD)
            ? 10000
            : carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * distanceToDelivery;

        const deliveryOption = ['go_deliver'];
        deliveryOption._meta = { utility: deliveryUtility };
        optionsWithMetadata.set(deliveryOption.join(','), deliveryOption._meta);
        options.push(deliveryOption);
    }

    if (carriedReward > 0 && parcels.size === 0) {
        const deliveryOption = ['go_deliver'];
        deliveryOption._meta = { utility: carriedReward };
        optionsWithMetadata.set(deliveryOption.join(','), deliveryOption._meta);
        options.push(deliveryOption);
    } else if (carriedReward <= 0 || parcels.size > 0) {
        for (const parcel of parcels.values()) {
            if (!parcel.carriedBy) {
                const opt = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
                const utility = carriedReward + parcel.reward - (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * (distance({ x: parcel.x, y: parcel.y }, me) + distance({ x: parcel.x, y: parcel.y }, deliveryTile));
                opt._meta = { utility };
                optionsWithMetadata.set(opt.join(','), opt._meta);
                options.push(opt);
            }
        }
    } else {
        const randomMoveOption = ['random_move'];
        randomMoveOption._meta = { utility: 0 };
        optionsWithMetadata.set(randomMoveOption.join(','), randomMoveOption._meta);
        options.push(randomMoveOption);
    }

    options.sort((a, b) => b._meta.utility - a._meta.utility);
    for (const opt of options) myAgent.push(opt);
}

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);

class IntentionRevision {
    #intention_queue = [];
    get intention_queue() { return this.#intention_queue; }

    async loop() {
        while (true) {
            if (this.intention_queue.length > 0) {
                const intention = this.intention_queue[0];
                const id = intention.predicate[2];
                const parcel = parcels.get(id);
                if (parcel && parcel.carriedBy) continue;
                await intention.achieve().catch(() => {});
                this.intention_queue.shift();
            }
            await new Promise(resolve => setImmediate(resolve));
        }
    }
}

class IntentionRevisionReplace extends IntentionRevision {
    async push(predicate) {
        const key = predicate.join(',');
        const newMeta = optionsWithMetadata.get(key);
        const newUtility = newMeta?.utility ?? 0;

        const current = this.intention_queue[0];
        if (current) {
            const currKey = current.predicate.join(',');
            const currentMeta = optionsWithMetadata.get(currKey);
            const currUtility = currentMeta?.utility ?? 0;

            if (currKey === key || newUtility <= currUtility) return;
            current.stop();
            this.intention_queue.shift();
        }

        const intention = new Intention(this, predicate);
        intention.utility = newUtility;
        this.intention_queue.unshift(intention);
    }
}

const myAgent = new IntentionRevisionReplace();
myAgent.loop();

class Intention {
    #predicate;
    #parent;
    #current_plan;
    #started = false;
    #stopped = false;

    constructor(parent, predicate) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    get predicate() { return this.#predicate; }
    get stopped() { return this.#stopped; }
    stop() { this.#stopped = true; if (this.#current_plan) this.#current_plan.stop(); }

    async achieve() {
        if (this.#started) return this;
        this.#started = true;
        for (const planClass of planLibrary) {
            if (this.stopped) throw ['stopped intention', ...this.predicate];
            if (planClass.isApplicableTo(...this.predicate)) {
                this.#current_plan = new planClass(this.#parent);
                try {
                    return await this.#current_plan.execute(...this.predicate);
                } catch (e) { optionsGeneration(); }
            }
        }
        if (this.stopped) throw ['stopped intention', ...this.predicate];
        throw ['no plan satisfied the intention', ...this.predicate];
    }
}

const planLibrary = [];

class Plan {
    #sub_intentions = [];
    #parent;
    #stopped = false;

    constructor(parent) { this.#parent = parent; }
    stop() { this.#stopped = true; for (const i of this.#sub_intentions) i.stop(); }
    get stopped() { return this.#stopped; }
    async subIntention(predicate) {
        const sub = new Intention(this, predicate);
        this.#sub_intentions.push(sub);
        return sub.achieve();
    }
}

class GoPickUp extends Plan {
    static isApplicableTo(a, x, y, id) { return a === 'go_pick_up'; }
    async execute(_, x, y) {
        await this.subIntention(['go_to', x, y]);
        await client.emitPickup();
        return true;
    }
}

class GoDeliver extends Plan {
    static isApplicableTo(a) { return a === 'go_deliver'; }
    async execute() {
        const tile = nearestDelivery(me);
        await this.subIntention(['go_to', tile.x, tile.y]);
        await client.emitPutdown();
        return true;
    }
}

class AStarMove extends Plan {
    static isApplicableTo(a, x, y) { return a === 'go_to'; }
    async execute(_, x, y) {
        const isWall = (x, y) => { const t = map.xy(x, y); return !t || t.type === 1; };
        const path = a_star({ x: me.x, y: me.y }, { x, y }, isWall);
        if (!path.length) throw ['no path found'];

        for (const step of path.slice(1)) {
            if (this.stopped) throw ['stopped'];
            let r;
            if (step.x > me.x) r = await client.emitMove('right');
            else if (step.x < me.x) r = await client.emitMove('left');
            else if (step.y > me.y) r = await client.emitMove('up');
            else if (step.y < me.y) r = await client.emitMove('down');
            if (!r) throw ['blocked'];
            me.x = r.x;
            me.y = r.y;
        }
        return true;
    }
}

class RandomMove extends Plan {
    static isApplicableTo(a) { return a === 'random_move'; }
    async execute() {
        while (true) {
            if (this.stopped) throw ['stopped'];
            const dirs = ['up', 'down', 'left', 'right'];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            const r = await client.emitMove(dir);
            if (r) { me.x = r.x; me.y = r.y; }
            await new Promise(res => setTimeout(res, 1000));
        }
    }
}

planLibrary.push(GoPickUp, GoDeliver, AStarMove, RandomMove);
