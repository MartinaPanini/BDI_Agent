import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { a_star } from "./astar_search.js";
import EventEmitter from "events";

// — API Client Initialization
const client = new DeliverooApi(
  'https://deliveroojs2.rtibdi.disi.unitn.it/',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImVjODgyNyIsIm5hbWUiOiJ0ZXN0Iiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDU2Njk4MDF9.qOnwzOc8Wf0mTO82v_5Q6cOI9e3nMQJ1zgjuVL2DVxk'
);

// — Reassignable configuration vars
let AGENTS_OBSERVATION_DISTANCE;
let MOVEMENT_DURATION;
let PARCEL_DECADING_INTERVAL;
const DELIVERY_ZONE_THRESHOLD = 3;
// how close another agent must be to “contest” a parcel
const OTHER_AGENT_CONTEST_DIST = 2;
// when contested, scale utility by this (0 = ignore entirely; 1 = no penalty)
const CONTESTED_UTILITY_FACTOR = 0.5;


// — Helpers
function distance({ x: x1, y: y1 }, { x: x2, y: y2 }) {
  return Math.abs(Math.round(x1) - Math.round(x2))
       + Math.abs(Math.round(y1) - Math.round(y2));
}

// — Map storage
const map = {
  width: 0,
  height: 0,
  tiles: new Map(),
  add(tile) {
    this.tiles.set(tile.x + 1000 * tile.y, tile);
  },
  xy(x, y) {
    return this.tiles.get(Math.round(x) + 1000 * Math.round(y));
  }
};

// — Config & map loading
client.onConfig(config => {
  AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
  MOVEMENT_DURATION         = config.MOVEMENT_DURATION;
  PARCEL_DECADING_INTERVAL  = config.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1000000;
});

client.onMap((width, height, tiles) => {
  map.width  = width;
  map.height = height;
  tiles.forEach(t => map.add(t));
});
client.onTile((x, y, delivery) => {
  map.add({ x, y, type: delivery ? 2 : 1 });
});

// — Find nearest delivery spot
function nearestDelivery({ x, y }) {
  return Array
    .from(map.tiles.values())
    .filter(t => t.type === 2)
    .sort((a, b) => distance(a, { x, y }) - distance(b, { x, y }))[0];
}

// — “Me” state
const me = { id: null, name: null, x: null, y: null, score: null, carrying: new Map() };
client.onYou(({ id, name, x, y, score }) => {
  Object.assign(me, { id, name, x, y, score });
});

// — Parcels sensing
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

// — Track other agents in sight
const otherAgents = new Map();

client.onAgentsSensing(sensed_agents => {
  otherAgents.clear();
  for (const a of sensed_agents) {
    otherAgents.set(a.id, { x: a.x, y: a.y });
  }
});

// — Option generation
const optionsWithMetadata = new Map();
function optionsGeneration() {
    const carriedQty    = me.carrying.size;
    const carriedReward = Array
      .from(me.carrying.values())
      .reduce((sum, p) => sum + p.reward, 0);
  
    const opts = [];
    const deliveryTile = nearestDelivery(me);
    if (!deliveryTile) return;
  
    // 1) Deliver option (if carrying something)
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
  
    // 2) Pick‐up options (including contested penalty)
    if (carriedReward <= 0 || parcels.size > 0) {
      parcels.forEach(parcel => {
        if (parcel.carriedBy) return;
  
        // base utility = total reward minus travel cost
        let util = carriedReward + parcel.reward - (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * (distance(me, parcel) + distance(parcel, deliveryTile));
  
        // if any other agent is within contest distance, penalize
        for (const other of otherAgents.values()) {
          if (distance(other, parcel) <= OTHER_AGENT_CONTEST_DIST) { util *= CONTESTED_UTILITY_FACTOR;
            break;
          }
        }
  
        const o = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
        o._meta = { utility: util };
        optionsWithMetadata.set(o.join(','), o._meta);
        opts.push(o);
      });
    }
  
    // 3) Sort & push to agent
    opts.sort((a, b) => b._meta.utility - a._meta.utility);
    opts.forEach(o => myAgent.push(o));
  }  

client.onYou(optionsGeneration);
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);

// — Intention revision base
class IntentionRevision {
  #intention_queue = [];
  get intention_queue() { return this.#intention_queue; }

  async loop() {
    while (true) {
      if (this.intention_queue.length > 0) {
        const intent = this.intention_queue[0];
        console.log('[Intention loop] Pursuing:', intent.predicate);
        const id = intent.predicate[2];
        const p  = parcels.get(id);
        if (p && p.carriedBy) { this.intention_queue.shift(); continue; }
        await intent.achieve().catch(() => {});
        this.intention_queue.shift();
      }
      await new Promise(r => setImmediate(r));
    }
  }
}

// — Replace revision policy
class IntentionRevisionReplace extends IntentionRevision {
  async push(predicate) {
    const key     = predicate.join(',');
    const newMeta = optionsWithMetadata.get(key) ?? { utility: 0 };
    const newU    = newMeta.utility;

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

// — Intention & Plan base
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
        catch (e) { optionsGeneration(); }
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

// — GoPickUp & GoDeliver
class GoPickUp extends Plan {
  static isApplicableTo(a, x, y) { return a === 'go_pick_up'; }
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

// — A* movement with proper wall checks & retry/backoff
class AStarMove extends Plan {
  static isApplicableTo(a) { return a === 'go_to'; }

  async execute(_, x, y) {
    // now properly checks tile.type === 0 for walls
    const isWall = (xx, yy) => {
      const t = map.xy(xx, yy);
      if (!t)      return true;      // outside bounds
      if (t.type===0) return true;  // real wall
      return false;
    };

    //console.log(`[AStarMove] Planning from (${me.x},${me.y}) to (${x},${y})`);
    let path = a_star({ x: me.x, y: me.y }, { x, y }, isWall);
    if (!path.length) throw ['no path'];

    console.log(`[AStarMove] Path:`, path.map(p=>`(${p.x},${p.y})`).join('->'));

    for (const step of path.slice(1)) {
      if (this.stopped) throw ['stopped'];
      //console.log(`[AStarMove] Step to (${step.x},${step.y})`);

      let success = false, retries = 0;
      const MAX_RETRIES = 5;

      while (!success) {
        if (this.stopped) throw ['stopped'];

        let r;
        if      (step.x>me.x) r = await client.emitMove('right');
        else if (step.x<me.x) r = await client.emitMove('left');
        else if (step.y>me.y) r = await client.emitMove('up');
        else if (step.y<me.y) r = await client.emitMove('down');

        if (r) {
          me.x = r.x; me.y = r.y;
          success = true;
        } else {
          retries++;
          if (retries > MAX_RETRIES) {
            console.error('[AStarMove] Too many retries, aborting');
            throw ['too many retries'];
          }
          console.warn(`[AStarMove] Blocked at (${step.x},${step.y}), retry #${retries}`);
          await new Promise(res => setTimeout(res, 300));
          path = a_star({ x: me.x, y: me.y }, { x, y }, isWall);
          if (!path.length) throw ['no replan path'];
          break;  // break inner loop, go reprocess new path
        }
      }
    }
    return true;
  }
}

// — Random fallback
class RandomMove extends Plan {
  static isApplicableTo(a) { return a==='random_move'; }
  async execute() {
    const dirs = ['up','down','left','right'];
    while (!this.stopped) {
      const dir = dirs[Math.floor(Math.random()*4)];
      const r = await client.emitMove(dir);
      if (r) { me.x=r.x; me.y=r.y; }
      await new Promise(r=>setTimeout(r,500));
    }
    throw ['stopped'];
  }
}

// — Assemble plan library & start
const planLibrary = [ GoPickUp, GoDeliver, RandomMove, AStarMove ];
const myAgent = new IntentionRevisionReplace();
myAgent.loop();
