import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { a_star } from "./astar_search.js";
import EventEmitter from "events";

// API Initialization
const client = new DeliverooApi(
    'https://deliveroojs2.rtibdi.disi.unitn.it/',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVjODgyNyIsIm5hbWUiOiJ0ZXN0Iiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDU2Njk4MDF9.qOnwzOc8Wf0mTO82v_5Q6cOI9e3nMQJ1zgjuVL2DVxk'
);

// Reassignable configuration vars
let AGENTS_OBSERVATION_DISTANCE;
let MOVEMENT_DURATION;
let PARCEL_DECADING_INTERVAL;
const DELIVERY_ZONE_THRESHOLD = 3;
const blockedParcels = new Set();
const visitedTiles = new Map();

// Helpers
function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    return Math.abs(Math.round(x1) - Math.round(x2)) + Math.abs(Math.round(y1) - Math.round(y2));
}

function recordVisit(x, y) {
    const key = `${Math.round(x)},${Math.round(y)}`;
    visitedTiles.set(key, (visitedTiles.get(key) || 0) + 1);
}
// Helper to determine direction from coordinates
function getDirection(x1, y1, x2, y2) {
    if (x2 > x1) return 'right';
    if (x2 < x1) return 'left';
    if (y2 > y1) return 'up';
    if (y2 < y1) return 'down';
    return null;
}

// Map
const map = {
    width: 0,
    height: 0,
    tiles: new Map(),
    add(tile) { this.tiles.set(tile.x + 1000 * tile.y, tile); },
    xy(x, y) { return this.tiles.get(Math.round(x) + 1000 * Math.round(y)); }
};

// Config loading
client.onConfig(config => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1000000;
});

client.onMap((width, height, tiles) => {
    map.width = width;
    map.height = height;
    tiles.forEach(t => map.add(t));
});
client.onTile((x, y, delivery) => {
    map.add({ x, y, type: delivery ? 2 : 1 });
});

// Find nearest delivery spot
function nearestDelivery({ x, y }) {
    return Array.from(map.tiles.values())
        .filter(t => t.type === 2)
        .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0];
}

// Me state
const me = { id: null, name: null, x: null, y: null, score: null, carrying: new Map() };
client.onYou(({ id, name, x, y, score }) => {
    Object.assign(me, { id, name, x, y, score });
});

// Parcels
const parcels = new Map();
const sensingEmitter = new EventEmitter();
client.onParcelsSensing((perceived) => {
  let newParcel = false;
  perceived.forEach(p => {
      const d = distance(me, p); // Distance between me and the parcel
      if (!parcels.has(p.id) && d <= AGENTS_OBSERVATION_DISTANCE) {  // Only consider parcels within range
          newParcel = true;
          parcels.set(p.id, p);
      }
      if (p.carriedBy === me.id) me.carrying.set(p.id, p);
  });

  for (const [id, p] of parcels) {
      if (!perceived.find(q => q.id === id) && p.carriedBy === me.id) {
          parcels.delete(id);
          me.carrying.delete(id);
      }
  }

  if (newParcel) sensingEmitter.emit("new_parcel");
});

let otherAgents = new Map();
client.onAgentsSensing((agents) => {
  otherAgents.clear();
  for (const agent of agents) {
    if (agent.id !== me.id) { // Skip myself
        const d = distance(me, agent);  // Distance between me and the agent
        if (d <= AGENTS_OBSERVATION_DISTANCE) {
            otherAgents.set(agent.id, agent); // Add agent to perception if within range
        }
    }
  }
});


// Option generation
const optionsWithMetadata = new Map();
function optionsGeneration() {
    optionsWithMetadata.clear();
    const carriedQty = me.carrying.size;
    const carriedReward = Array.from(me.carrying.values()).reduce((a, p) => a + p.reward, 0);
    const opts = [];
    const deliveryTile = nearestDelivery(me);

    if (!deliveryTile) return;

    const d2d = distance(me, deliveryTile);
    if (carriedReward > 0) {
        const util = (d2d < DELIVERY_ZONE_THRESHOLD)
            ? carriedReward
            : carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * d2d;
        const o = ['go_deliver'];
        o._meta = { utility: util };
        optionsWithMetadata.set(o.join(','), o._meta);
        opts.push(o);
    }

    if (carriedReward <= 0 || parcels.size > 0) {
        parcels.forEach(parcel => {
            const d = distance(me, parcel);
            if (!parcel.carriedBy && !blockedParcels.has(parcel.id) && d <= AGENTS_OBSERVATION_DISTANCE && !me.carrying.has(parcel.id)) {
                let penalty = 0;
                for (const other of otherAgents.values()) {
                    const agentDistance = distance(parcel, other);
                    if (agentDistance <= 1) penalty *= 2;
                    else if (agentDistance <= 2) penalty *= 1.5;
                    else if (agentDistance <= 3) penalty *= 1.25;
                }

                const util = carriedReward + parcel.reward - (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * (distance(me, parcel) + distance(parcel, deliveryTile)) - penalty;

                const o = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
                o._meta = { utility: util };
                optionsWithMetadata.set(o.join(','), o._meta);
                opts.push(o);
            }
        });
    }

    opts.sort((a, b) => b._meta.utility - a._meta.utility);

    // Push highest-utility option to intention queue
    if (opts.length > 0) {
        myAgent.push(opts[0]);  // <-- QUESTA È LA PARTE CRUCIALE
    } else {
        console.log('[OptionsGeneration] No valid options, falling back to smart exploration.');
        myAgent.push(['smart_explore']);
    }

    console.log('Option Sorted ', opts);
}


client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

// Intention and Plans
class IntentionRevision {
    #intention_queue = [];
    get intention_queue() { return this.#intention_queue; }

    async loop() {
        while (true) {
            if (this.intention_queue.length > 0) {
                const intention = this.intention_queue[0];
                console.log('[Intention loop] Pursuing:', intention.predicate);
    
                try {
                    await intention.achieve();
                    console.log('[Intention loop] Completed intention:', intention.predicate);
                    this.intention_queue.shift();
                } catch (err) {
                    console.error('[Intention loop] Failed intention:', intention.predicate, 'Error:', err);
                    this.intention_queue.shift();
    
                    const failedKey = intention.predicate.join(',');
                    if (optionsWithMetadata.has(failedKey)) {
                        console.log(`[Intention loop] Removing failed option: ${failedKey}`);
                        optionsWithMetadata.delete(failedKey);
                    }
    
                    if (intention.predicate[0] === 'go_pick_up') {
                        const parcelId = intention.predicate[3];
                        if (parcelId) {
                            console.warn(`[Intention loop] Blacklisting unreachable parcel: ${parcelId}`);
                            blockedParcels.add(parcelId);
                        }
                    }
    
                    optionsGeneration();
                    console.log('Regenerating options');
                }
            }
            await new Promise(r => setImmediate(r));
        }
    } 
}

class IntentionRevisionReplace extends IntentionRevision {
    async push(predicate) {
        const key = predicate.join(',');
        const newMeta = optionsWithMetadata.get(key) ?? { utility: 0 };
        const newU = newMeta.utility;

        const current = this.intention_queue[0];

        // Se non c'è nulla in coda → accoda nuova intenzione
        if (!current) {
            const intent = new Intention(this, predicate);
            intent.utility = newU;
            this.intention_queue.unshift(intent);
            return;
        }

        const curKey = current.predicate.join(',');
        const curMeta = optionsWithMetadata.get(curKey) ?? { utility: 0 };
        const curU = curMeta.utility;

        // FORZA la sostituzione se quella attuale è 'smart_explore'
        const shouldReplace =
            curKey === 'smart_explore' ||
            key !== curKey && newU > curU;

        if (!shouldReplace) return;

        current.stop();
        this.intention_queue.shift();

        const intent = new Intention(this, predicate);
        intent.utility = newU;
        this.intention_queue.unshift(intent);
    }
}


class Intention {
    #predicate; #parent; #current_plan; #started = false; #stopped = false;
    constructor(parent, predicate) { this.#parent = parent; this.#predicate = predicate; }
    get predicate() { return this.#predicate; }
    get stopped() { return this.#stopped; }
    stop() { this.#stopped = true; if (this.#current_plan) this.#current_plan.stop(); }

    async achieve() {
        if (this.#started) return this;
        this.#started = true;
        for (const PlanClass of planLibrary) {
            if (this.stopped) throw ['stopped', ...this.predicate];
            if (PlanClass.isApplicableTo(...this.predicate)) {
                this.#current_plan = new PlanClass(this.#parent);
                try { return await this.#current_plan.execute(...this.predicate); }
                catch (e) { optionsGeneration(); throw e; }
            }
        }
        if (this.stopped) throw ['stopped', ...this.predicate];
        throw ['no plan for', ...this.predicate];
    }
}

class Plan {
    #sub = []; #parent; #stopped = false;
    constructor(parent) { this.#parent = parent; }
    get stopped() { return this.#stopped; }
    stop() { this.#stopped = true; this.#sub.forEach(s => s.stop()); }
    async subIntention(pred) {
        const i = new Intention(this, pred);
        this.#sub.push(i);
        return i.achieve();
    }
}

// Plans
class GoPickUp extends Plan {
    static isApplicableTo(a) { return a === 'go_pick_up'; }
    async execute(_, x, y, parcelId) {

        await this.subIntention(['go_to', x, y]);
        const success = await client.emitPickup();
        if (!success) {
            console.error("[GoPickUp] Pickup failed, throwing error");
            throw ['pickup_failed'];
        }
        const picked = parcels.get(parcelId);
        if (picked) {
            me.carrying.set(parcelId, picked);
            parcels.delete(parcelId);
        }
        return true;
    }
}


class GoDeliver extends Plan {
    static isApplicableTo(a) { return a === 'go_deliver'; }
    async execute() {
        const tile = nearestDelivery(me);
        await this.subIntention(['go_to', tile.x, tile.y]);
        const success = await client.emitPutdown();
        if (success) {
            me.carrying.clear();
        } else {
            console.error("[GoDeliver] Delivery failed, throwing error");
            throw ['delivery_failed'];
        }
        return true;
    }
}

class AStarMove extends Plan {
    static isApplicableTo(a) { return a === 'go_to'; }

    async execute(_, x, y) {
        const isWall = (xx, yy) => {
            const t = map.xy(xx, yy);
            if (!t) return true;
            return (t.type === 0);
        };

        let path = a_star({ x: me.x, y: me.y }, { x, y }, isWall);
        if (!path.length) {
            console.error(`[AStarMove] No path to goal.`);
            throw ['no path'];
        }

        for (const step of path.slice(1)) {
            if (this.stopped) throw ['stopped'];
            console.log(`[AStarMove] Step to (${step.x},${step.y})`);

            let r;
            if (step.x > me.x) r = await client.emitMove('right');
            else if (step.x < me.x) r = await client.emitMove('left');
            else if (step.y > me.y) r = await client.emitMove('up');
            else if (step.y < me.y) r = await client.emitMove('down');

            if (r) {
                me.x = r.x;
                me.y = r.y;
            } else {
                console.error('[AStarMove] Move blocked!');
                throw ['move blocked'];
            }
        }
        return true;
    }
}
class RandomMove extends Plan {
    static isApplicableTo(a) { return a === 'random_move'; }
  
    async execute() {
        const dirs = ['up', 'down', 'left', 'right'];
  
        const isWall = (xx, yy) => {
            const t = map.xy(xx, yy);
            if (!t) return true;
            return (t.type === 0);
        };
  
        while (!this.stopped) {
            const dir = dirs[Math.floor(Math.random() * 4)];
            let newX = me.x;
            let newY = me.y;
  
            if (dir === 'up') newY--;
            else if (dir === 'down') newY++;
            else if (dir === 'left') newX--;
            else if (dir === 'right') newX++;
  
            if (isWall(newX, newY)) {
                await new Promise(r => setTimeout(r, 100)); // Aspetta un po' prima di riprovare
                continue;
            }
  
            const r = await client.emitMove(dir);
            if (r) {
                me.x = r.x;
                me.y = r.y;
                console.log(`[RandomMove] Mi sono mosso a ${dir} in (${me.x}, ${me.y})`);
            }
  
            await new Promise(r => setTimeout(r, 100));
        }
    }
  }

  class SmartExploreSafeZone extends Plan {
    static isApplicableTo(a) { return a === 'smart_explore'; }

    async execute() {
        const center = { x: map.width / 2, y: map.height / 2 };

        const isWall = (xx, yy) => {
            const t = map.xy(xx, yy);
            return (!t || t.type === 0);
        };

        function isAgentNearby(x, y) {
            for (const agent of otherAgents.values()) {
                const d = Math.abs(Math.round(agent.x) - x) + Math.abs(Math.round(agent.y) - y);
                if (d <= 1) return true;
            }
            return false;
        }

        function scoreMove(x, y) {
            const key = `${x},${y}`;
            const visits = visitedTiles.get(key) || 0;
            const distToCenter = Math.abs(center.x - x) + Math.abs(center.y - y);
            return visits + distToCenter * 0.1;
        }

        // 1) primo tentativo sui vicini diretti
        const neighbors = [
            { x: me.x + 1, y: me.y },
            { x: me.x - 1, y: me.y },
            { x: me.x,     y: me.y + 1 },
            { x: me.x,     y: me.y - 1 },
        ].filter(n => !isWall(n.x, n.y) && !isAgentNearby(n.x, n.y));

        let candidates = neighbors.map(n => ({
            x: n.x,
            y: n.y,
            dir: getDirection(me.x, me.y, n.x, n.y),
            visits: visitedTiles.get(`${n.x},${n.y}`) || 0,
            score: scoreMove(n.x, n.y)
        }));

        // solo quelli non troppo battuti
        candidates = candidates.filter(c => c.visits < 5);

        if (candidates.length > 0) {
            candidates.sort((a, b) => a.score - b.score);
            const best = candidates[0];
            console.log(`[SmartExploreSafeZone] Stepping ${best.dir} to (${best.x},${best.y})`);
            const r = await client.emitMove(best.dir);
            if (r) {
                me.x = r.x; me.y = r.y;
                recordVisit(me.x, me.y);
            }
            optionsGeneration();
            return true;
        }

        // 2) se non ci sono vicini utili → cerca un "frontier tile" lontano e inesplorato
        const allFrontiers = Array.from(map.tiles.values())
            .filter(t => !isWall(t.x, t.y)
                       && !isAgentNearby(t.x, t.y)
                       && (visitedTiles.get(`${t.x},${t.y}`) || 0) === 0);

        if (allFrontiers.length > 0) {
            // trovo quello che massimizza la distanza da me
            allFrontiers.sort((a, b) => {
                const da = Math.abs(me.x - a.x) + Math.abs(me.y - a.y);
                const db = Math.abs(me.x - b.x) + Math.abs(me.y - b.y);
                return db - da;
            });
            const target = allFrontiers[0];
            console.log(`[SmartExploreSafeZone] No neighbor left, A* to frontier (${target.x},${target.y})`);
            await this.subIntention(['go_to', target.x, target.y]);
            recordVisit(me.x, me.y);
            optionsGeneration();
            return true;
        }

        // 3) se anche la frontiera è esaurita → attendo e rigenero
        console.warn("[SmartExploreSafeZone] Mappa esplorata / bloccato. Attendo 500ms.");
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true;
    }
}

// Plan library
const planLibrary = [GoPickUp, GoDeliver, RandomMove, AStarMove, SmartExploreSafeZone];

// Start agent
const myAgent = new IntentionRevisionReplace();
myAgent.loop();
