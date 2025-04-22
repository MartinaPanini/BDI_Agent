import depthSearch from './depth_search_daemon.js';
import { parcels, me } from './beliefRevision.js';

import { Intention } from './intention.js';
import { distance } from './utils.js';

/**
 * Intention revision loop
 */
export class IntentionRevision {

    #intention_queue = [];
    get intention_queue () {
        return this.#intention_queue;
    }

    async loop () {
        while (true) {
            if (this.intention_queue.length > 0) {
                console.log('intentionRevision.loop', this.intention_queue.map(i => i.predicate));

                const intention = this.intention_queue[0];
                const [type, x, y, id] = intention.predicate;

                // Validità dinamica
                if (type === 'go_pick_up') {
                    const p = parcels.get(id);
                    if (!p || p.carriedBy) {
                        console.log('Skipping intention because no more valid', intention.predicate);
                        this.intention_queue.shift();
                        continue;
                    }
                }

                await intention.achieve().catch(error => {
                    console.log('Failed intention', ...intention.predicate, 'with error:', error);
                });

                this.intention_queue.shift();
            }

            await new Promise(res => setImmediate(res));
        }
    }

    log(...args) {
        console.log(...args);
    }
}

export class IntentionRevisionRevise extends IntentionRevision {

    async push(predicate) {
        console.log('Revising intention queue. Received', ...predicate);

        const [type, x, y, id] = predicate;
        let utility = -Infinity;

        if (type === 'go_pick_up') {
            const p = parcels.get(id);
            if (!p || p.carriedBy) return;

            const plan = depthSearch({ x: me.x, y: me.y }, { x: p.x, y: p.y });
            const cost = plan.length;
            utility = p.reward - cost;
        } 
        else if (type === 'go_deliver') {
            if (me.carrying.length === 0) return;

            const someThreshold = 2;
            const isCrowded = agents.some(agent => distance({ x, y }, agent) < someThreshold);
            if (isCrowded) {
                console.log('Skipping go_deliver: zone too crowded');
                return;
            }

            const plan = depthSearch({ x: me.x, y: me.y }, { x, y });
            const cost = plan.length;
            const minReward = Math.min(...me.carrying.map(p => p.reward));
            utility = minReward - cost;
        }

        const newIntention = new Intention(this, predicate);
        newIntention.utility = utility;

        const alreadyInQueue = this.intention_queue.find(
            i => i.predicate.join(' ') === predicate.join(' ')
        );

        if (!alreadyInQueue) {
            this.intention_queue.push(newIntention);
        } else {
            alreadyInQueue.utility = utility;
        }

        this.intention_queue.sort((a, b) => b.utility - a.utility);

        const current = this.intention_queue[0];
        if (current !== newIntention && current.utility < newIntention.utility) {
            current.stop();
        }
    }
}

export const myAgent = new IntentionRevisionRevise();
myAgent.loop();
