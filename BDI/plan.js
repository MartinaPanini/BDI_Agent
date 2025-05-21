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
        } catch (e) {
            console.warn("[GoDeliver] Failed to reach delivery location:", e);
            throw ['cannot_reach_delivery'];
        }

        // Double-check that we are actually at the correct location before dropping
        if (Math.round(me.x) !== Math.round(tile.x) && Math.round(me.y) !== Math.round(tile.y)){
            console.error("[GoDeliver] Not at delivery location, stopping intention.");
            this.stop(); // STOP INTENTION LOOP
            throw ['not at delivery location'];
        }

        if (isTileBlockedByAgent(tile.x, tile.y)) {
            console.warn("[GoDeliver] Agent blocking delivery tile. Waiting...");
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by agent'];
        }

        if (isTileBlockedByTeammate(tile.x, tile.y)) {
            console.warn("[GoDeliver] Teammate blocking delivery tile. Waiting...");
            await new Promise(r => setTimeout(r, 500));
            throw ['blocked by teammate'];
        }

        const success = await client.emitPutdown();
        if (success) {
            me.carrying.forEach((_, parcelId) => {
                pickupCoordination.delete(parcelId);
            });
            me.carrying.clear();
        } else {
            console.error("[GoDeliver] Delivery failed, throwing error");
            // Enhanced error handling:
            const teammateDel = getTeammateDelivery(); // Ensure this function is accessible
            if (teammateDel && teammateDel.x === tile.x && teammateDel.y === tile.y) {
                console.warn(`[<span class="math-inline">\{me\.name\}\] Delivery failed and teammate also targeting this tile \(</span>{tile.x},${tile.y}). Waiting before re-planning.`);
                await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); // Wait 1.5-2.5 seconds
            }
            throw ['delivery_failed'];
        }
        return true;
    }
}

class PutDown extends Plan {
    static isApplicableTo(a) { return a === 'put_down'; }
    async execute() {
        if (me.carrying.size === 0) {
            console.warn("[PutDown] No parcels to put down.");
            return true;
        }
        if (!teamAgentId) {
            console.warn("[PutDown] Teammate ID not configured. Cannot execute handoff.");
            throw ['teammate_id_not_configured'];
        }
        const teammate = otherAgents.get(teamAgentId);

        if (!teammate || typeof teammate.x !== 'number' || typeof teammate.y !== 'number') {
            console.warn(`[PutDown] Teammate (ID: ${teamAgentId}) not found in sensed agents or position unknown.`);
            throw ['teammate_not_found_or_no_position'];
        }
        const potentialDropTiles = [
            { x: Math.round(teammate.x) + 1, y: Math.round(teammate.y) },
            { x: Math.round(teammate.x) - 1, y: Math.round(teammate.y) },
            { x: Math.round(teammate.x),     y: Math.round(teammate.y) + 1 },
            { x: Math.round(teammate.x),     y: Math.round(teammate.y) - 1 },
        ];
       const validDropTiles = potentialDropTiles.filter(tileCoords => {
            const tileOnMap = map.xy(tileCoords.x, tileCoords.y);
            // Tile must exist, be a normal walkable tile (type 1), and not be blocked by another agent (excluding self initially).
            return tileOnMap && tileOnMap.type === 1 &&
                   !isTileBlockedByAgent(tileCoords.x, tileCoords.y, me.id); // Pass me.id to exclude self from blocking check initially
        });
        if (validDropTiles.length === 0) {
            console.warn(`[PutDown] No valid empty tile found adjacent to teammate ${teammate.name} at (${teammate.x}, ${teammate.y}).`);
            throw ['no_valid_handoff_tile_near_teammate'];
        }

        validDropTiles.sort((a, b) => distance(me, a) - distance(me, b));
        const dropTile = validDropTiles[0];

        console.log(`[PutDown] Selected handoff tile (${dropTile.x}, ${dropTile.y}) near teammate ${teammate.name}.`);

        // Check if the selected dropTile is blocked by the teammate AFTER selection
        if (isTileBlockedByTeammate(dropTile.x, dropTile.y)) {
            console.warn(`[PutDown] Handoff tile (${dropTile.x}, ${dropTile.y}) is currently blocked by teammate ${teamAgentId}. Requesting them to move.`);
            client.emitSay(teamAgentId, {
                type: 'clear_tile_for_handoff', 
                data: { x: dropTile.x, y: dropTile.y, requesterId: me.id }
            });
            await new Promise(r => setTimeout(r, 1500)); 

            if (isTileBlockedByTeammate(dropTile.x, dropTile.y)) {
                console.error(`[PutDown] Handoff tile (${dropTile.x}, ${dropTile.y}) still blocked by teammate ${teamAgentId} after request. Aborting putdown for this tile.`);
                throw ['handoff_tile_blocked_by_teammate_after_request'];
            }
            console.log(`[PutDown] Teammate seems to have cleared tile (${dropTile.x}, ${dropTile.y}). Proceeding with move.`);
        }

        if (Math.round(me.x) !== dropTile.x || Math.round(me.y) !== dropTile.y) {
            try {
                console.log(`[PutDown] Moving to handoff tile (${dropTile.x}, ${dropTile.y}).`);
                await this.subIntention(['go_to', dropTile.x, dropTile.y]);
            } catch (e) {
                console.warn(`[PutDown] Failed to reach handoff location (${dropTile.x}, ${dropTile.y}):`, e);
                throw ['cannot_reach_handoff_tile', e];
            }
        }

        // Re-check position after move attempt
        if (Math.round(me.x) !== dropTile.x || Math.round(me.y) !== dropTile.y) {
            console.error(`[PutDown] Not at designated handoff location (${dropTile.x},${dropTile.y}); current: (${Math.round(me.x)},${Math.round(me.y)}). Aborting putdown.`);
            throw ['not_at_handoff_location_after_move'];
        }

        // Check if tile became blocked by ANY agent (including teammate if they moved back) just before putdown
        if (isTileBlockedByAgent(dropTile.x, dropTile.y)) {
            console.warn(`[PutDown] Handoff tile (${dropTile.x}, ${dropTile.y}) became blocked by an agent. Waiting briefly...`);
            await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
            if (isTileBlockedByAgent(dropTile.x, dropTile.y)) {
                console.error(`[PutDown] Handoff tile (${dropTile.x}, ${dropTile.y}) still blocked. Aborting.`);
                throw ['handoff_tile_still_blocked_after_wait'];
            }
        }

        const currentX = Math.round(me.x); // Store position before putdown for finding move_away_tile
        const currentY = Math.round(me.y);

        const success = await client.emitPutdown();
        if (success) {
            console.log(`[PutDown] Successfully put down parcels at (${currentX}, ${currentY}) for teammate ${teammate.name}.`);
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
            
            console.log(`[PutDown] Notified teammate ${teamAgentId} about dropped parcels at (${currentX},${currentY}).`);
            
            droppedParcelsInfo.forEach(p => {
                blockedParcels.add(p.id);
            });
            console.log(`[PutDown] Added dropped parcel IDs to local block list: ${droppedParcelsInfo.map(p => p.id).join(', ')}.`);
            me.carrying.clear();

            const deliveryTile = nearestDelivery(me);
            if (deliveryTile) {
                // Calculate direction towards delivery area
                const moveDir = me.y < deliveryTile.y ? 'down' : 'up';
                try {
                    await client.emitMove(moveDir);
                    console.log(`[PutDown] Forced move ${moveDir} to clear path`);
                } catch (e) {
                    console.warn("[PutDown] Forced move failed, staying put");
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
            if (!movedAway) {
                console.warn("[PutDown] Could not find a valid adjacent tile to move away to, or all attempts failed. Staying put.");
            }

        } else {
            console.error("[PutDown] Putdown action failed at API level.");
            throw ['putdown_api_failed'];
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
                console.error(`[AStarMove] No path to goal.`);
                throw ['blocked by wall'];
        }
        if (!path.length && isTileBlockedByAgent(x, y)) {
            console.error(`[AStarMove] No path to goal, blocked by agent.`);
            throw ['blocked by agent'];
        }
       if (!path.length) {
        if (isTileBlockedByTeammate(x, y) && me.carrying.size > 0) {
            console.log("[Emergency] Blocked by teammate while carrying parcels");
            this.stop();
            myAgent.push(['put_down']);
            throw ['blocked_by_teammate'];
        }
        }

        for (const step of path.slice(1)) {
            if (this.stopped) throw ['stopped'];
            //console.log(`[AStarMove] Step to (${step.x},${step.y})`);

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
                //console.log(`[RandomMove] Mi sono mosso a ${dir} in (${me.x}, ${me.y})`);
            }

            await new Promise(r => setTimeout(r, 100));
        }
    }
  }


// Keep visitedTiles for SmartExplore if needed, but not used by ExploreSpawnTiles
const visitedTiles = new Map();

class ExploreSpawnTiles extends Plan {
    static isApplicableTo(a) { return a === 'explore'; } // Assuming 'explore' intention can map to this plan

    constructor(parent) {
      super(parent);
      // Build & sort once by initial distance
      this._spawnQueue = Array
        .from(map.spawnTiles.values())
        .map(t => ({ x: t.x, y: t.y }))
        // Initial sort by distance to the agent's starting position
        .sort((a, b) => distance(me, a) - distance(me, b));
      this._currentIndex = 0;
      //console.log(`[ExploreSpawnTiles] Initialized with ${this._spawnQueue.length} spawn tiles.`);
    }

    async execute() {
      if (this._spawnQueue.length === 0) {
        console.warn('[ExploreSpawnTiles] No spawn tiles found.');
        // If no spawn tiles, wait a bit and let optionsGeneration decide
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true; // Plan finished (unsuccessfully finding spawn tiles)
      }

      // Keep moving from spawn-tile to spawn-tile continuously
      while (!this.stopped) { // Use !this.stopped to allow external stopping
        const { x: tx, y: ty } = this._spawnQueue[this._currentIndex];

        //console.log(`[ExploreSpawnTiles] Targeting spawn tile (${tx},${ty}). Current index: ${this._currentIndex}`);

        // Check if we are already at the target spawn tile
        if (Math.round(me.x) === tx && Math.round(me.y) === ty) {
          //console.log(`[ExploreSpawnTiles] Already at spawn tile (${tx},${ty}).`);
          // At the tile, let optionsGeneration check for parcels/delivery
          optionsGeneration();
          // Move to the next spawn tile in the sequence
          this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;
          // Small delay to prevent tight loop if optionsGeneration doesn't move the agent immediately
          await new Promise(r => setTimeout(r, 50));
          continue; // Continue to the next iteration of the while loop
        }

        // Not at the target yet, try to move there
        //console.log(`[ExploreSpawnTiles] Moving to spawn tile (${tx},${ty}).`);
        try {
          // Use subIntention to execute the go_to plan
          await this.subIntention(['go_to', tx, ty]);
          //console.log(`[ExploreSpawnTiles] Reached spawn tile (${tx},${ty}).`);

          // Reached the tile, let optionsGeneration check for parcels/delivery
          optionsGeneration();

        } catch (err) {
            console.warn(`[ExploreSpawnTiles] Failed to reach (${tx},${ty}):`, err);

            // Mark this tile as temporarily blocked or skip it in the rotation
            this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;

            // await new Promise(r => setTimeout(r, 200)); // prevent tight retry loop
            optionsGeneration();

        }

        // Always advance to the next spawn tile after attempting to reach the current one
        // This ensures continuous cycling through spawn tiles
        this._currentIndex = (this._currentIndex + 1) % this._spawnQueue.length;

        // Small delay before the next movement attempt to avoid high CPU usage
        await new Promise(r => setTimeout(r, 100));
      }
      console.log('[ExploreSpawnTiles] Plan stopped.');
      return true; // Plan finished (due to being stopped externally)
    }
}


class SmartExplore extends Plan {
    static isApplicableTo(a) { return a === 'explore'; } // Note: Both SmartExplore and ExploreSpawnTiles use 'explore'. You might need a way to choose between them.

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
            //console.log(`[SmartExplore] Stepping ${best.dir} to (${best.x},${best.y})`);
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
            console.log(`[SmartExplore] No neighbor left, A* to frontier (${target.x},${target.y})`);
            await this.subIntention(['go_to', target.x, target.y]);
            recordVisit(me.x, me.y);
            optionsGeneration();
            return true;
        }

        // se anche la frontiera è esaurita attendo e rigenero
        console.warn("[SmartExplore] Bloccato. Attendo 500ms.");
        await new Promise(r => setTimeout(r, 500));
        optionsGeneration();
        return true;
    }
}


export { Plan, GoPickUp, GoDeliver, AStarMove, RandomMove, SmartExplore, ExploreSpawnTiles, PutDown, visitedTiles };
