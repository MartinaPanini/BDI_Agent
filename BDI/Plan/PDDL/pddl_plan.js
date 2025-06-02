import { onlineSolver, PddlProblem } from "@unitn-asa/pddl-client";
import { readFile, positionsEqual } from "../../utils.js";
import { Plan } from '../plan.js';
import { me, parcels } from '../../Beliefs/sensing.js';
import { updateBeliefset, map } from "../../Beliefs/map.js";
import { client } from "../../deliveroo/client.js";

let domain = await readFile("./Plan/PDDL/domain.pddl"); // Load the PDDL domain definition file asynchronously

/**
 * PddlMove class extends Plan and represents a movement plan using PDDL planning.
 * It moves the agent from its current position to a target coordinate (x, y)
 * by generating and executing a sequence of moves derived from an online PDDL solver.
 */
export class PddlMove extends Plan {

    /**
     * Static method to check if this plan is applicable.
     * @param {string} go_to - The action predicate
     * @param {number} x - Target x coordinate
     * @param {number} y - Target y coordinate
     * @returns {boolean} True if the predicate is 'go_to', meaning this plan applies.
     */
    static isApplicableTo(go_to, x, y) {
        return go_to === 'go_to';
    }

    /**
     * Executes the movement plan towards target (x, y).
     * Uses PDDL online solver to plan the path, then moves step-by-step.
     * Also attempts to pick up any parcel on the current tile if not already carried.
     * If path is exhausted before reaching target, replans dynamically.
     * @param {string} go_to - The action predicate (should be 'go_to')
     * @param {number} x - Target x coordinate
     * @param {number} y - Target y coordinate
     * @returns {Promise<boolean>} Resolves true if target reached successfully.
     */
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
            for (const par of parcels.values()) {
                if (par.x === me.x && par.y === me.y && !me.carrying.has(par.id)) {
                    const success = await client.emitPickup();
                    if (success) {
                        me.carrying.set(par.id, par);
                        parcels.delete(par.id);
                    }
                }
            }
            if (coordinate.x !== me.x) {
                let direction = coordinate.x > me.x ? 'right' : 'left';
                const result = await client.emitMove(direction);
                if (result) {
                    me.x = result.x;
                    me.y = result.y;
                    continue;
                }
            }
            if (coordinate.y !== me.y) {
                let direction = coordinate.y > me.y ? 'up' : 'down';
                const result = await client.emitMove(direction);
                if (result) {
                    me.x = result.x;
                    me.y = result.y;
                    continue;
                }
            }
            await new Promise(r => setTimeout(r, 300));
        }
    }

     /**
     * Private helper to extract a list of coordinates from a PDDL plan.
     * Parses each action to extract target tile positions.
     * @param {Array} plan - Array of actions returned by the PDDL solver
     * @returns {Array} List of coordinate objects with x and y properties
     */
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