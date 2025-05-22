import { a_star } from './astar_search.js';
import {map} from './map.js';
import {me, parcels} from './sensing.js';
import { distance, getDirection, nearestDelivery, recordVisit } from './utils.js';
import {isWall, isAgentNearby, isTileBlockedByAgent, center, isTileBlockedByTeammate} from './utils.js';
import { client } from './client.js';
import { optionsGeneration } from './options.js';
import { Intention } from './intentions.js';

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
        // Add this inside GoPickUp before emitPickup
        if (isTileBlockedByAgent(x, y)) {
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }
        const success = await client.emitPickup();
        if (!success) {
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

        try {
            await this.subIntention(['go_to', tile.x, tile.y]);
        } catch (e) {
            throw ['cannot_reach_delivery'];
        }

        // Double-check that we are actually at the correct location before dropping
        if (me.x !== tile.x || me.y !== tile.y) {
            throw ['not_at_delivery_location'];
        }

        if (isTileBlockedByAgent(tile.x, tile.y)) {
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }

        const success = await client.emitPutdown();
        if (success) {
            me.carrying.clear();
        } else {
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

        const isBlocked = (xx, yy) => isWall(xx, yy) || isTileBlockedByAgent(xx, yy) || isTileBlockedByTeammate(xx, yy);
        let path = a_star({ x: me.x, y: me.y }, { x, y }, isBlocked);

        if (!path.length) {
            throw ['no path'];
        }

        for (const step of path.slice(1)) {
            if (this.stopped) throw ['stopped'];

            if (isTileBlockedByTeammate(step.x, step.y)) {
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked_by_teammate'];
            }

            let r;
            if (step.x > me.x) r = await client.emitMove('right');
            else if (step.x < me.x) r = await client.emitMove('left');
            else if (step.y > me.y) r = await client.emitMove('up');
            else if (step.y < me.y) r = await client.emitMove('down');

            if (r) {
                me.x = r.x;
                me.y = r.y;
            } else {
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
            }

            await new Promise(r => setTimeout(r, 100));
        }
    }
  }


// Keep visitedTiles for SmartExplore if needed, but not used by ExploreSpawnTiles
const visitedTiles = new Map();

class ExploreSpawnTiles extends Plan {
    static isApplicableTo(a) { return a === 'explore'; } 

    constructor(parent) {
      super(parent);
      // Build & sort once by initial distance
      this._spawnQueue = Array
        .from(map.spawnTiles.values())
        .map(t => ({ x: t.x, y: t.y }))
        // Initial sort by distance to the agent's starting position
        .sort((a, b) => distance(me, a) - distance(me, b));
      this._currentIndex = 0;
    }

    async execute() {
      if (this._spawnQueue.length === 0) {
        // If no spawn tiles, wait a bit and let optionsGeneration decide
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true; // Plan finished (unsuccessfully finding spawn tiles)
      }

      // Keep moving from spawn-tile to spawn-tile continuously
      while (!this.stopped) { // Use !this.stopped to allow external stopping
        const { x: tx, y: ty } = this._spawnQueue[this._currentIndex];
        // Check if we are already at the target spawn tile
        if (Math.round(me.x) === tx && Math.round(me.y) === ty) {
          optionsGeneration();
          this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;
          await new Promise(r => setTimeout(r, 50));
          continue; 
        }
        try {
          // Use subIntention to execute the go_to plan
          await this.subIntention(['go_to', tx, ty]);
          optionsGeneration();

        } catch (err) {
          optionsGeneration();
        }
        this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;
        await new Promise(r => setTimeout(r, 100));
      }
      return true; // Plan finished (due to being stopped externally)
    }
}

class SmartExplore extends Plan {
    static isApplicableTo(a) { return a === 'explore'; } 

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

        // solo quelli non troppo esplorati
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
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true;
    }
}


export { Plan, GoPickUp, GoDeliver, AStarMove, RandomMove, SmartExplore, ExploreSpawnTiles, visitedTiles };