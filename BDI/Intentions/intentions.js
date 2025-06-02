import { optionsWithMetadata, optionsGeneration } from "./options.js";
import { blockedParcels} from "../Beliefs/sensing.js";
import { planLibrary } from "../main.js";

// Base class that manages a queue of intentions.
class IntentionRevision {
    #intention_queue = [];
    get intention_queue() { return this.#intention_queue; }

    /**
     * Main loop continuously processing intentions.
     * Waits for intention achievement or failure before moving on.
     */
    async loop() {
        while (true) {
            if (this.intention_queue.length > 0) {
                const intention = this.intention_queue[0];
    
                try {
                    await intention.achieve();
                    console.log('[Intention loop] Completed intention:', intention.predicate);
                    this.intention_queue.shift();
                } catch (err) {
                    //console.error('[Intention loop] Failed intention:', intention.predicate, 'Error:', err);
                    this.intention_queue.shift();
    
                    const failedKey = intention.predicate.join(',');
                    if (optionsWithMetadata.has(failedKey)) {
                        //console.log(`[Intention loop] Removing failed option: ${failedKey}`);
                        optionsWithMetadata.delete(failedKey);
                    }
                    if (intention.predicate[0] === 'go_pick_up') {
                        const parcelId = intention.predicate[3];
                        if (parcelId) {
                            blockedParcels.add(parcelId);
                        }
                    }   
                    optionsGeneration();
                }
            }
            await new Promise(r => setImmediate(r));
        }
    } 
}

/**
 * Derived class that extends IntentionRevision.
 * It adds logic to replace the current intention if a new one with higher utility arrives.
 */
class IntentionRevisionReplace extends IntentionRevision {
    async push(predicate) {
        const key = predicate.join(',');
        const newMeta = optionsWithMetadata.get(key) ?? { utility: 0 };
        const newU = newMeta.utility;
        const current = this.intention_queue[0];

        if (!current) {
            const intent = new Intention(this, predicate);
            intent.utility = newU;
            this.intention_queue.unshift(intent);
            return;
        }
        const curKey = current.predicate.join(',');
        const curMeta = optionsWithMetadata.get(curKey) ?? { utility: 0 };
        const curU = curMeta.utility;
        const shouldReplace =
            curKey === 'smart_explore' ||
            key !== curKey && newU > curU;

        if (!shouldReplace) return;

        current.stop();
        this.intention_queue.shift();

        const intent = new Intention(this, predicate);
        intent.utility = newU;
        this.intention_queue.unshift(intent);
    }
}

/**
 * Represents a single intention with a predicate to achieve.
 * Attempts to execute the intention using applicable plans from the plan library.
 */
class Intention {
    #predicate; #parent; #current_plan; #started = false; #stopped = false;
    constructor(parent, predicate) { this.#parent = parent; this.#predicate = predicate; }
    get predicate() { return this.#predicate; }
    get stopped() { return this.#stopped; }
    stop() { this.#stopped = true; if (this.#current_plan) this.#current_plan.stop(); }

     /**
     * Attempts to achieve the intention by executing an applicable plan.
     * 
     * Iterates over all plans in the plan library and picks the first applicable one.
     * Throws error if no plan matches or if stopped before completion.
     */
    async achieve() {
        if (this.#started) return this;
        this.#started = true;
        for (const PlanClass of planLibrary) {
            if (this.stopped) throw ['stopped', ...this.predicate];
            if (PlanClass.isApplicableTo(...this.predicate)) {
                this.#current_plan = new PlanClass(this.#parent);
                try { return await this.#current_plan.execute(...this.predicate); }
                catch (e) { optionsGeneration(); throw e; }
            }
        }
        if (this.stopped) throw ['stopped', ...this.predicate];
        throw ['no plan for', ...this.predicate];
    }
}

export { IntentionRevisionReplace, Intention, IntentionRevision };