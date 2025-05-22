import { onlineSolver, PddlProblem } from "@unitn-asa/pddl-client";
import { readFile, positionsEqual } from "./utils.js";
import { Plan } from './plan.js';
import { me, parcels } from './sensing.js';
import { updateBeliefset, map } from "./map.js";
import { client } from "./client.js";

let domain = await readFile("./domain.pddl");

export class PddlMove extends Plan {

    static isApplicableTo(go_to, x, y) {
        return go_to === 'go_to';
    }

    async execute(go_to, x, y) {
        console.log(`[PddlMove] Starting plan to (${x}, ${y})`);

        if (typeof me.x !== 'number' || typeof me.y !== 'number') {
            console.error('[PddlMove] Agent position is undefined:', me);
            throw ['stopped'];
        }

        const goal = `at t${x}_${y}`;
        updateBeliefset();
        const init = map.myBeliefSet.toPddlString() + ` (at t${me.x}_${me.y})`;

        const pddlProblem = new PddlProblem(
            'deliveroo',
            map.myBeliefSet.objects.join(' '),
            init,
            goal
        );

        const problem = pddlProblem.toPddlString();
        let plan = await onlineSolver(domain, problem);

        let path = this.#extractPathFromPlan(plan);

        while (true) {
            if (this.stopped) throw ['stopped'];

            if (me.x === x && me.y === y) {
                //console.log('Target reached');
                return true;
            }

            if (path.length === 0) {
                console.warn('[PddlMove] Path exhausted but target not reached — replanning...');
                updateBeliefset();
                const newInit = map.myBeliefSet.toPddlString() + ` (at t${me.x}_${me.y})`;
                const newProblem = new PddlProblem(
                    'deliveroo',
                    map.myBeliefSet.objects.join(' '),
                    newInit,
                    `at t${x}_${y}`
                );
                const newPlan = await onlineSolver(domain, newProblem.toPddlString());
                path = this.#extractPathFromPlan(newPlan);

                if (path.length === 0) {
                    console.error('[PddlMove] Replanned path still empty — cannot proceed');
                    throw ['stopped'];
                }
            }

            const coordinate = path.shift();
            if (!coordinate) continue;

            // Opportunistic pickup
            for (const par of parcels.values()) {
                if (par.x === me.x && par.y === me.y && !me.carrying.has(par.id)) {
                    const success = await client.emitPickup();
                    if (success) {
                        me.carrying.set(par.id, par);
                        parcels.delete(par.id);
                        //console.log(`[PddlMove] Picked up parcel ${par.id}`);
                    }
                }
            }

            // Attempt to move horizontally
            if (coordinate.x !== me.x) {
                let direction = coordinate.x > me.x ? 'right' : 'left';
                const result = await client.emitMove(direction);
                if (result) {
                    me.x = result.x;
                    me.y = result.y;
                    continue;
                }
            }

            // Attempt to move vertically
            if (coordinate.y !== me.y) {
                let direction = coordinate.y > me.y ? 'up' : 'down';
                const result = await client.emitMove(direction);
                if (result) {
                    me.x = result.x;
                    me.y = result.y;
                    continue;
                }
            }

            console.log('[PddlMove] Move blocked — retrying in 300ms');
            await new Promise(r => setTimeout(r, 300));
        }
    }

    #extractPathFromPlan(plan) {
        if (!Array.isArray(plan)) {
            console.error('[PddlMove] Plan is invalid:', plan);
            throw ['stopped'];
        }

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
        return path;
    }
}