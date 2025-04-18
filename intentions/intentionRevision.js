import { Intention } from './intention.js';
import { me } from '../beliefs/me.js'; // Correct import for 'me'

export class IntentionRevision {
    intention_queue = [];

    async loop() {
        while (true) {
            if (this.intention_queue.length > 0) {
                const intention = this.intention_queue[0];

                const result = await intention.achieve().catch(err => {
                    this.remove(intention.predicate);
                });

                if (result === true) {
                    if (intention.predicate[0] === "go_pick_up") {
                        me.parcelsInMind.push(intention.predicate[3]); // Use 'me' here
                    } else if (intention.predicate[0] === "go_put_down") {
                        for (let parcel of me.parcelsInMind) { // Use 'me' here
                            me.parcels = me.parcels.filter(p => p.id !== parcel.id); // Use 'me' here
                        }
                        me.parcelsInMind = []; // Use 'me' here
                    }
                }

                this.remove(intention.predicate);
            }

            await new Promise(res => setImmediate(res));
        }
    }

    async push(predicate) {
        const last = this.intention_queue[0];
        let updated = false;

        for (let i = 0; i < this.intention_queue.length; i++) {
            if (this._createString(predicate) === this._createString(this.intention_queue[i].predicate)) {
                this.intention_queue[i].predicate[4] = predicate[4]; // update utility
                updated = true;
            }
        }

        if (!updated) {
            const newIntention = new Intention(this, predicate);
            this.intention_queue.push(newIntention);
        }

        this.intention_queue = this._sortByUtility(this.intention_queue);

        if (this._shouldSwitch(last)) {
            console.log("[INFO] Switching intention:", this._createString(last.predicate), "→", this._createString(this.intention_queue[0].predicate));
            last.stop();
        }
    }

    remove(predicate) {
        const str = this._createString(predicate);
        const idx = this.intention_queue.findIndex(i => this._createString(i.predicate) === str);
        if (idx !== -1) this.intention_queue.splice(idx, 1);
    }

    _createString(predicate) {
        return predicate[0] === "go_pick_up" ? predicate[0] + predicate[3]?.id : predicate[0];
    }

    _shouldSwitch(last) {
        return last && this._createString(last.predicate) !== this._createString(this.intention_queue[0].predicate);
    }

    _sortByUtility(queue) {
        return queue.sort((a, b) => b.predicate[4] - a.predicate[4]); // Descending utility
    }

    printQueue(zone = "") {
        console.log(`\n[${zone}] Current Intention Queue:`);
        this.intention_queue.forEach((i, idx) =>
            console.log(`\t[${idx}] ${i.predicate[0]} | Parcel: ${i.predicate[3]?.id} | Utility: ${i.predicate[4]}`)
        );
    }
}
