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


// Helpers
function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
    return Math.abs(Math.round(x1) - Math.round(x2)) + Math.abs(Math.round(y1) - Math.round(y2));
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
client.onParcelsSensing(perceived => {
    let newParcel = false;
    perceived.forEach(p => {
        if (!parcels.has(p.id)) newParcel = true;
        parcels.set(p.id, p);
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
          // 🆕 SKIP parcels in blockedParcels
          if (!parcel.carriedBy && !blockedParcels.has(parcel.id)) {
              const util = carriedReward + parcel.reward
                - (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL
                * (distance(me, parcel) + distance(parcel, deliveryTile));
              const o = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
              o._meta = { utility: util };
              optionsWithMetadata.set(o.join(','), o._meta);
              opts.push(o);
          }
      });
  }

  opts.sort((a, b) => b._meta.utility - a._meta.utility);
  opts.forEach(o => myAgent.push(o));
}

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);

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
                  this.intention_queue.shift();
              } catch (err) {
                console.error('[Intention loop] Failed intention:', intention.predicate, 'Error:', err);
                this.intention_queue.shift();
            
                const failedKey = intention.predicate.join(',');
                if (optionsWithMetadata.has(failedKey)) {
                    console.log(`[Intention loop] Removing failed option: ${failedKey}`);
                    optionsWithMetadata.delete(failedKey);
                }
            
                // 🆕 If it's a go_pick_up that failed, blacklist the parcel id
                if (intention.predicate[0] === 'go_pick_up') {
                    const parcelId = intention.predicate[3];
                    if (parcelId) {
                        console.warn(`[Intention loop] Blacklisting unreachable parcel: ${parcelId}`);
                        blockedParcels.add(parcelId);
                    }
                }    
                optionsGeneration();
                console.log('Regenerating options')
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
        if (current) {
            const curKey = current.predicate.join(',');
            const curMeta = optionsWithMetadata.get(curKey) ?? { utility: 0 };
            if (curKey === key || newU <= curMeta.utility) return;
            current.stop();
            this.intention_queue.shift();
        }
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
    static isApplicableTo(a) { return a === 'go_to'; }

    async execute(_, x, y) {
        const isWall = (xx, yy) => {
            const t = map.xy(xx, yy);
            if (!t) return true;
            return (t.type === 0);
        };

        console.log(`[AStarMove] Planning from (${me.x},${me.y}) to (${x},${y})`);
        let path = a_star({ x: me.x, y: me.y }, { x, y }, isWall);
        if (!path.length) {
            console.error(`[AStarMove] No path to goal.`);
            throw ['no path'];
        }
        console.log(`[AStarMove] Path:`, path.map(p => `(${p.x},${p.y})`).join('->'));

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
        while (!this.stopped) {
            const dir = dirs[Math.floor(Math.random() * 4)];
            const r = await client.emitMove(dir);
            if (r) { me.x = r.x; me.y = r.y; }
            await new Promise(r => setTimeout(r, 500));
        }
    }
}

// Plan library
const planLibrary = [GoPickUp, GoDeliver, RandomMove, AStarMove];

// Start agent
const myAgent = new IntentionRevisionReplace();
myAgent.loop();
