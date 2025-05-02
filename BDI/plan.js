import { a_star } from './astar_search.js';
import {map} from './map.js';
import {me, parcels} from './sensing.js';
import { distance, getDirection, nearestDelivery, recordVisit } from './utils.js';
import {isWall, isAgentNearby, isTileBlockedByAgent, center} from './utils.js';
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
            console.warn("[GoPickUp] Agent blocking pickup tile. Waiting...");
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }
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
    
        try {
            await this.subIntention(['go_to', tile.x, tile.y]);
        } catch (e) {
            console.warn("[GoDeliver] Failed to reach delivery location:", e);
            throw ['cannot_reach_delivery'];
        }
    
        // Double-check that we are actually at the correct location before dropping
        if (me.x !== tile.x || me.y !== tile.y) {
            console.error("[GoDeliver] Not at delivery location, aborting putdown.");
            throw ['not_at_delivery_location'];
        }
    
        if (isTileBlockedByAgent(tile.x, tile.y)) {
            console.warn("[GoDeliver] Agent blocking delivery tile. Waiting...");
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }
    
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

        const isBlocked = (xx, yy) => isWall(xx, yy) || isTileBlockedByAgent(xx, yy);
        let path = a_star({ x: me.x, y: me.y }, { x, y }, isBlocked);
        
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

const visitedTiles = new Map();
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
            console.log(`[SmartExploreSafeZone] Stepping ${best.dir} to (${best.x},${best.y})`);
            const r = await client.emitMove(best.dir);
            if (r) {
                me.x = r.x; me.y = r.y;
                recordVisit(me.x, me.y);
            }
            optionsGeneration();
            return true;
        }

        // se non ci sono vicini utili cerca un "frontier tile" lontano e inesplorato
        const allFrontiers = Array.from(map.tiles.values())
            .filter(t => !isWall(t.x, t.y)
                       && !isTileBlockedByAgent(t.x, t.y)
                       && (visitedTiles.get(`${t.x},${t.y}`) || 0) === 0);

        if (allFrontiers.length > 0) {
            // trovo quello che massimizza la distanza da me
            allFrontiers.sort((a, b) => {
                const da = distance(me, a);
                const db = distance(me, b);
                return db - da;
            });
            const target = allFrontiers[0];
            console.log(`[SmartExploreSafeZone] No neighbor left, A* to frontier (${target.x},${target.y})`);
            await this.subIntention(['go_to', target.x, target.y]);
            recordVisit(me.x, me.y);
            optionsGeneration();
            return true;
        }

        // se anche la frontiera è esaurita attendo e rigenero
        console.warn("[SmartExploreSafeZone] Bloccato. Attendo 500ms.");
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true;
    }
}

export { Plan, GoPickUp, GoDeliver, AStarMove, RandomMove, SmartExplore, visitedTiles };