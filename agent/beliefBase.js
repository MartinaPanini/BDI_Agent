export class BeliefBase {
    constructor() {
        this.beliefs = new Map();
    }

    add(key, value) {
        this.beliefs.set(key, value);
    }

    get(key) {
        return this.beliefs.get(key);
    }

    remove(key) {
        this.beliefs.delete(key);
    }

    has(key) {
        return this.beliefs.has(key);
    }
}
