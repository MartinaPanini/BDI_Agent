import { onlineSolver, PddlProblem } from "@unitn-asa/pddl-client";
import { readFile, positionsEqual } from "./utils.js";
import { Plan } from './plan.js';
import { me, parcels } from './sensing.js';
import { updateBeliefset, map } from "./map.js";
import { client } from "./client.js";

let domain = await readFile("./domain.pddl");

export class PddlMove extends Plan {

    static isApplicableTo(go_to, x, y) {
        return go_to == 'go_to';
    }

    async execute(go_to, x, y) {
        console.log(`[PddlMove] Starting plan to (${x}, ${y})`);
    
        if (typeof me.x !== 'number' || typeof me.y !== 'number') {
            console.error('[PddlMove] Agent position is undefined:', me);
            throw ['stopped'];
        }
    
        const goal = 'at t' + x + '_' + y;
        updateBeliefset();
    
        const init = map.myBeliefSet.toPddlString() + ' ' + `(at t${me.x}_${me.y})`;
    
        const pddlProblem = new PddlProblem(
            'deliveroo',
            map.myBeliefSet.objects.join(' '),
            init,
            goal
        );
    
        const problem = pddlProblem.toPddlString();
        const plan = await onlineSolver(domain, problem);
    
        if (!Array.isArray(plan)) {
            console.error('[PddlMove] Plan is invalid:', plan);
            throw ['stopped'];
        }
    
        // Parse the plan
        const path = [];
        for (const action of plan) {
            if (!action.args || action.args.length < 2) continue;
    
            const end = action.args[1].split('_');
            const px = parseInt(end[0].substring(1));
            const py = parseInt(end[1]);
    
            if (!isNaN(px) && !isNaN(py)) {
                path.push({ x: px, y: py });
            }
        }
    
        const deliveriesOnPath = [];
        const parcelsOnPath = [];
    
        for (let del of map.tiles.values()) {
            for (let p of path) {
                if (del.x === p.x && del.y === p.y) {
                    deliveriesOnPath.push(del);
                }
            }
        }
    
        for (let par of parcels) {
            for (let p of path) {
                if (par.x === p.x && par.y === p.y && (p.x !== x || p.y !== y)) {
                    parcelsOnPath.push(par);
                }
            }
        }
    
        // Start moving
        while (me.x !== x || me.y !== y) {
            const my_position = { x: me.x, y: me.y };
    
            if (deliveriesOnPath.some(del => positionsEqual(del, my_position))) {
                if (this.stopped) throw ['stopped'];
                await client.emitPutdown();
                if (this.stopped) throw ['stopped'];
            }
    
            if (parcelsOnPath.some(par => positionsEqual(par, my_position))) {
                if (this.stopped) throw ['stopped'];
                await client.emitPickup();
                if (this.stopped) throw ['stopped'];
    
                parcelsOnPath.forEach(par => {
                    if (par.x === me.x && par.y === me.y) {
                        me.carrying.push(par.id);
                    }
                });
    
                if (this.stopped) throw ['stopped'];
            }
    
            const coordinate = path.shift();
            if (!coordinate) {
                console.error('[PddlMove] No more steps in path, but target not reached');
                throw ['stopped'];
            }
    
            if (coordinate.x === me.x && coordinate.y === me.y) continue;
    
            let status_x = false;
            let status_y = false;
    
            if (coordinate.x > me.x)
                status_x = await client.emitMove('right');
            else if (coordinate.x < me.x)
                status_x = await client.emitMove('left');
    
            if (status_x) {
                me.x = status_x.x;
                me.y = status_x.y;
            }
    
            if (this.stopped) throw ['stopped'];
    
            if (coordinate.y > me.y)
                status_y = await client.emitMove('up');
            else if (coordinate.y < me.y)
                status_y = await client.emitMove('down');
    
            if (status_y) {
                me.x = status_y.x;
                me.y = status_y.y;
            }
    
            if (!status_x && !status_y) {
                console.log('Stucked');
                await new Promise(r => setTimeout(r, 500));
            } else if (me.x === x && me.y === y) {
                console.log('Target reached');
            }
        }
    
        return true;
    }    
}


