export class MockClient {
    constructor() {
        this.callbacks = {};
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event](data);
        }
    }

    simulate() {
        // Simulate parcel detection, agent movement, etc.
    }
}
