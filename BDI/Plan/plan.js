import { a_star } from './astar_search.js';
import {map} from '../Beliefs/map.js';
import {me, parcels} from '../Beliefs/sensing.js';
import { distance, getDirection, nearestDelivery, recordVisit } from '../utils.js';
import {isWall, isAgentNearby, isTileBlockedByAgent, center} from '../utils.js';
import { client } from '../deliveroo/client.js';
import { optionsGeneration } from '../Intentions/options.js';
import { Intention } from '../Intentions/intentions.js';

/**
 * Core plan structure with support for nested intentions and stoppable execution.
 */
class Plan {
    #sub = []; #parent; #stopped = false;
    constructor(parent) { this.#parent = parent; }
    get stopped() { return this.#stopped; }
    stop() { this.#stopped = true; this.#sub.forEach(s => s.stop()); }
     /**
     * Creates a sub-intention and delegates execution to it.
     * @param {Array} pred - The goal predicate.
     * @returns {Promise<any>}
     */
    async subIntention(pred) {
        const i = new Intention(this, pred);
        this.#sub.push(i);
        return i.achieve();
    }
}

/**
 * Plan to move to a parcel and pick it up.
 */
class GoPickUp extends Plan {
    static isApplicableTo(a) { return a === 'go_pick_up'; }
    /**
     * Moves to the target tile and picks up the parcel.
     * @param {string} _ - Placeholder.
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {string} parcelId - ID of the parcel to pick up.
     */
    async execute(_, x, y, parcelId) {

        await this.subIntention(['go_to', x, y]);
        if (isTileBlockedByAgent(x, y)) {
            //console.warn("[GoPickUp] Agent blocking pickup tile. Waiting...");
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }
        const success = await client.emitPickup();
        if (!success) {
            //console.error("[GoPickUp] Pickup failed, throwing error");
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

/**
 * Plan to deliver a parcel to the nearest delivery tile.
 */
class GoDeliver extends Plan {
    static isApplicableTo(a) { return a === 'go_deliver'; }

    /**
     * Finds the nearest delivery tile and delivers the parcel.
     */
    async execute() {
        const tile = nearestDelivery(me);

        try {
            await this.subIntention(['go_to', tile.x, tile.y]);
        } catch (e) {
            //console.warn("[GoDeliver] Failed to reach delivery location:", e);
            throw ['cannot_reach_delivery'];
        }

        // Double-check that we are actually at the correct location before dropping
        if (me.x !== tile.x || me.y !== tile.y) {
            //console.error("[GoDeliver] Not at delivery location, aborting putdown.");
            throw ['not_at_delivery_location'];
        }

        if (isTileBlockedByAgent(tile.x, tile.y)) {
            //console.warn("[GoDeliver] Agent blocking delivery tile. Waiting...");
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }

        const success = await client.emitPutdown();
        if (success) {
            me.carrying.clear();
        } else {
            //console.error("[GoDeliver] Delivery failed, throwing error");
            throw ['delivery_failed'];
        }
        return true;
    }
}

/**
 * Plan that uses A* to move to a specific tile.
 */
class AStarMove extends Plan {
    static isApplicableTo(a) { return a === 'go_to'; }
     /**
     * Executes movement using the A* pathfinding algorithm.
     * @param {string} _ - Placeholder.
     * @param {number} x - Target x coordinate.
     * @param {number} y - Target y coordinate.
     */
    async execute(_, x, y) {
        const isWall = (xx, yy) => {
            const t = map.xy(xx, yy);
            if (!t) return true;
            return (t.type === 0);
        };

        const isBlocked = (xx, yy) => isWall(xx, yy) || isTileBlockedByAgent(xx, yy);
        let path = a_star({ x: me.x, y: me.y }, { x, y }, isBlocked);

        if (!path.length) {
            //console.error(`[AStarMove] No path to goal.`);
            throw ['no path'];
        }

        for (const step of path.slice(1)) {
            if (this.stopped) throw ['stopped'];
            let r;
            if (step.x > me.x) r = await client.emitMove('right');
            else if (step.x < me.x) r = await client.emitMove('left');
            else if (step.y > me.y) r = await client.emitMove('up');
            else if (step.y < me.y) r = await client.emitMove('down');

            if (r) {
                me.x = r.x;
                me.y = r.y;
            } else {
                //console.error('[AStarMove] Move blocked!');
                throw ['move blocked'];
            }
        }
        return true;
    }
}

// ====================== EXPLORATION PLANS ======================

/**
 * Plan that randomly moves around the map.
 */
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
                await new Promise(r => setTimeout(r, 100)); 
                continue;
            }

            const r = await client.emitMove(dir);
            if (r) {
                me.x = r.x;
                me.y = r.y;
            }

            await new Promise(r => setTimeout(r, 100));
        }
    }
  }

const visitedTiles = new Map();
/**
 * Plan to explore all spawn tiles in sequence.
 */
class ExploreSpawnTiles extends Plan {
    static isApplicableTo(a) { return a === 'explore'; } 
    constructor(parent) {
      super(parent);
      this._spawnQueue = Array
        .from(map.spawnTiles.values())
        .map(t => ({ x: t.x, y: t.y }))
        .sort((a, b) => distance(me, a) - distance(me, b));
      this._currentIndex = 0;
    }

    /**
     * Visits each spawn tile and runs option generation.
     */
    async execute() {
      if (this._spawnQueue.length === 0) {
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true; 
      }
      while (!this.stopped) { 
        const { x: tx, y: ty } = this._spawnQueue[this._currentIndex];
        if (Math.round(me.x) === tx && Math.round(me.y) === ty) {
          optionsGeneration();
          this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;
          await new Promise(r => setTimeout(r, 50));
          continue; 
        }
        try {
          await this.subIntention(['go_to', tx, ty]);
          optionsGeneration();

        } catch (err) {
          optionsGeneration();
        }
        this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;
        await new Promise(r => setTimeout(r, 100));
      }
      return true; 
    }
}

/**
 * Smarter exploration strategy that prioritizes under-visited and central tiles.
 */
class SmartExplore extends Plan {
    static isApplicableTo(a) { return a === 'explore'; } 

    /**
     * Explores the map by prioritizing nearby unvisited tiles and updating visit history.
     */
    async execute() {

        function scoreMove(x, y) {
            const key = `${x},${y}`;
            const visits = visitedTiles.get(key) || 0;
            const distToCenter = Math.abs(center.x - x) + Math.abs(center.y - y);
            return visits + distToCenter * 0.1;
        }
        const neighbors = [
            { x: me.x + 1, y: me.y },
            { x: me.x - 1, y: me.y },
            { x: me.x,     y: me.y + 1 },
            { x: me.x,     y: me.y - 1 },
        ].filter(n => !isWall(n.x, n.y) && !isTileBlockedByAgent(n.x, n.y));

        let candidates = neighbors.map(n => ({
            x: n.x,
            y: n.y,
            dir: getDirection(me.x, me.y, n.x, n.y),
            visits: visitedTiles.get(`${n.x},${n.y}`) || 0,
            score: scoreMove(n.x, n.y)
        }));
        candidates = candidates.filter(c => c.visits < 5);
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.score - b.score);
            const best = candidates[0];
            const r = await client.emitMove(best.dir);
            if (r) {
                me.x = r.x; me.y = r.y;
                recordVisit(me.x, me.y);
            }
            optionsGeneration();
            return true;
        }
        const allFrontiers = Array.from(map.tiles.values())
            .filter(t => !isWall(t.x, t.y)
                       && !isTileBlockedByAgent(t.x, t.y)
                       && (visitedTiles.get(`${t.x},${t.y}`) || 0) === 0);
        if (allFrontiers.length > 0) {
            allFrontiers.sort((a, b) => {
                const da = distance(me, a);
                const db = distance(me, b);
                return db - da;
            });
            const target = allFrontiers[0];
            await this.subIntention(['go_to', target.x, target.y]);
            recordVisit(me.x, me.y);
            optionsGeneration();
            return true;
        }
        console.warn("[SmartExplore] Bloccato. Attendo 500ms.");
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true;
    }
}


export { Plan, GoPickUp, GoDeliver, AStarMove, RandomMove, SmartExplore, ExploreSpawnTiles, visitedTiles };