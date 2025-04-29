import { Plan } from './basePlan.js';
import { map } from './mapManager.js';
import { me } from './agentState.js';

export class AStarMove extends Plan {
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

export  class SmartExplore extends Plan {
    static isApplicableTo(a) { return a === 'explore'; }

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