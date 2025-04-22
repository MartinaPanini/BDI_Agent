import { planLibrary } from './plan.js';
import { me } from './beliefRevision.js';
import { distance } from './utils.js';

/**
 * Intention
 */
export class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;

    // Used to stop the intention
    #stopped = false;
    get stopped () {
        return this.#stopped;
    }
    stop () {
        this.#stopped = true;
        if (this.#current_plan)
            this.#current_plan.stop();
    }

    // Reference to the intention revision system
    #parent;

    // Predicate: something like ['go_to', x, y] or ['pickup', parcel_id]
    #predicate;
    get predicate () {
        return this.#predicate;
    }

    // Flag to prevent re-execution
    #started = false;

    // ✅ NEW: Utility for ordering
    utility = 0; // Default value, can be set from outside

    constructor(parent, predicate) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log(...args) {
        if (this.#parent && this.#parent.log)
            this.#parent.log('\t', ...args);
        else
            console.log(...args);
    }

    /**
     * Using the plan library to achieve an intention
     */
    async achieve() {
        if (this.#started)
            return this;
        this.#started = true;

        for (const planClass of planLibrary) {
            if (this.stopped) throw ['stopped intention', ...this.predicate];

            if (planClass.isApplicableTo(...this.predicate)) {
                this.#current_plan = new planClass(this.#parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                try {
                    const plan_res = await this.#current_plan.execute(...this.predicate);
                    this.log('succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res);
                    return plan_res;
                } catch (error) {
                    this.log('failed intention', ...this.predicate, 'with plan', planClass.name, 'with error:', error);
                }
            }
        }

        if (this.stopped) throw ['stopped intention', ...this.predicate];
        throw ['no plan satisfied the intention', ...this.predicate];
    }

}
