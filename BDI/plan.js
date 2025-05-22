import { a_star } from './astar_search.js';
import {map} from './map.js';
import {me, parcels, otherAgents, blockedParcels} from './sensing.js';
import { distance, getDirection, nearestDelivery, recordVisit, isWall, isAgentNearby, isTileBlockedByAgent, center, isTileBlockedByTeammate } from './utils.js';
import { client } from './client.js';
import { optionsGeneration } from './options.js';
import { Intention } from './intentions.js';
import { teamAgentId } from './main.js';    
import { getTeammateDelivery } from './teamOptions.js';
import { pickupCoordination } from './shared.js';

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
        if (parcelId) {
        pickupCoordination.set(parcelId, me.id);
        console.log(`[GoPickUp] Registered parcel ${parcelId} as carried by ${me.id}`);
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
        } catch (e) { throw ['cannot_reach_delivery']; }
        if (Math.round(me.x) !== Math.round(tile.x) && Math.round(me.y) !== Math.round(tile.y)){
            this.stop(); // STOP INTENTION LOOP
            throw ['not at delivery location'];
        }
        if (isTileBlockedByAgent(tile.x, tile.y)) {
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }
        if (isTileBlockedByTeammate(tile.x, tile.y)) {
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by teammate'];
        }

        const success = await client.emitPutdown();
        if (success) {
            me.carrying.forEach((_, parcelId) => { pickupCoordination.delete(parcelId); });
            me.carrying.clear();
        } else {
            // Error handling for delivery failure
            const teammateDel = getTeammateDelivery();
            if (teammateDel && teammateDel.x === tile.x && teammateDel.y === tile.y) {
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); 
            }
            throw ['delivery_failed'];
        }
        return true;
    }
}

class PutDown extends Plan {
    static isApplicableTo(a) { return a === 'put_down'; }
    async execute() {
        if (me.carrying.size === 0) { return true; }
        if (!teamAgentId) { throw ['teammate_id_not_configured']; }
        const teammate = otherAgents.get(teamAgentId);

        if (!teammate || typeof teammate.x !== 'number' || typeof teammate.y !== 'number') { throw ['teammate_not_found_or_no_position']; }
        const potentialDropTiles = [
            { x: Math.round(teammate.x) + 1, y: Math.round(teammate.y) },
            { x: Math.round(teammate.x) - 1, y: Math.round(teammate.y) },
            { x: Math.round(teammate.x),     y: Math.round(teammate.y) + 1 },
            { x: Math.round(teammate.x),     y: Math.round(teammate.y) - 1 },
        ];
       const validDropTiles = potentialDropTiles.filter(tileCoords => {
            const tileOnMap = map.xy(tileCoords.x, tileCoords.y);
            return !isWall(tileCoords.x, tileCoords.y) && !isTileBlockedByAgent(tileCoords.x, tileCoords.y, me.id); 
        });
        if (validDropTiles.length === 0) {
            throw ['no_valid_handoff_tile_near_teammate'];
        }

        validDropTiles.sort((a, b) => distance(me, a) - distance(me, b));
        const dropTile = validDropTiles[0];

        // Check if the selected dropTile is blocked by the teammate AFTER selection
        if (isTileBlockedByTeammate(dropTile.x, dropTile.y)) {
            client.emitSay(teamAgentId, {
                type: 'clear_tile_for_handoff', 
                data: { x: dropTile.x, y: dropTile.y, requesterId: me.id }
            });
            await new Promise(r => setTimeout(r, 1500)); 
            if (isTileBlockedByTeammate(dropTile.x, dropTile.y)) {
                throw ['handoff_tile_blocked_by_teammate_after_request'];
            }
        }

        if (Math.round(me.x) !== dropTile.x || Math.round(me.y) !== dropTile.y) {
            try {
                await this.subIntention(['go_to', dropTile.x, dropTile.y]);
            } catch (e) { throw ['cannot_reach_handoff_tile', e]; }
        }
        // Re-check position after move attempt
        if (Math.round(me.x) !== dropTile.x || Math.round(me.y) !== dropTile.y) {
            throw ['not_at_handoff_location_after_move'];
        }

        // Check if tile became blocked by ANY agent (including teammate if they moved back) just before putdown
        if (isTileBlockedByAgent(dropTile.x, dropTile.y)) {
            await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
            if (isTileBlockedByAgent(dropTile.x, dropTile.y)) {
                throw ['handoff_tile_still_blocked_after_wait'];
            }
        }

        const currentX = Math.round(me.x); 
        const currentY = Math.round(me.y);

        const success = await client.emitPutdown();
        if (success) {;
            const droppedParcelsInfo = Array.from(me.carrying.values()).map(p => ({id: p.id, reward: p.reward }));
            client.emitSay(teamAgentId, { 
                type: 'parcels_dropped',
                data: {
                    x: currentX,
                    y: currentY,
                    parcels: droppedParcelsInfo,
                    urgent: true // Add urgency flag
            }
        });
     
            droppedParcelsInfo.forEach(p => {
                blockedParcels.add(p.id);
            });
            me.carrying.clear();

            const deliveryTile = nearestDelivery(me);
            if (deliveryTile) {
                const moveDir = me.y < deliveryTile.y ? 'down' : 'up';
                try { await client.emitMove(moveDir);
                } catch (e) { console.warn("[PutDown] Forced move failed, staying put");
                }
            }
            // Attempt each tile in prioritized order
            for (const moveAwayTile of potentialMoveAwayTiles) {
                try {
                    await this.subIntention(['go_to', moveAwayTile.x, moveAwayTile.y]);
                    movedAway = true;
                    break;
                } catch (e) {
                    continue;
                }
            }
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

        if (!path.length && isWall(x, y)) {
                throw ['blocked by wall'];
        }
        if (!path.length && isTileBlockedByAgent(x, y)) {
            throw ['blocked by agent'];
        }
       if (!path.length) {
        if (isTileBlockedByTeammate(x, y) && me.carrying.size > 0) {
            this.stop();
            myAgent.push(['put_down']);
            throw ['blocked_by_teammate'];
        }
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
            } else {throw ['move blocked'];}
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

    async execute() {
      if (this._spawnQueue.length === 0) {
        console.warn('[ExploreSpawnTiles] No spawn tiles found.');
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
            console.warn(`[ExploreSpawnTiles] Failed to reach (${tx},${ty}):`, err);
            this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;
            optionsGeneration();

        }

        this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;

        await new Promise(r => setTimeout(r, 100));
      }
      console.log('[ExploreSpawnTiles] Plan stopped.');
      return true; 
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


export { Plan, GoPickUp, GoDeliver, AStarMove, RandomMove, SmartExplore, ExploreSpawnTiles, PutDown, visitedTiles };
