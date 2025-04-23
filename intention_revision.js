import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

const client = new DeliverooApi(
    'https://deliveroojs2.rtibdi.disi.unitn.it/',
    // Token for testing
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjQxYzdhYiIsIm5hbWUiOiJ0ZXN0Iiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NDUzMDY1ODJ9.474kBOhupyTQ3GflIZVjm6xwYMTSPKzrTm1wBWnhHyA'
)

function distance( {x:x1, y:y1}, {x:x2, y:y2}) {
    const dx = Math.abs( Math.round(x1) - Math.round(x2) )
    const dy = Math.abs( Math.round(y1) - Math.round(y2) )
    return dx + dy;
}

var AGENTS_OBSERVATION_DISTANCE
var MOVEMENT_DURATION
var PARCEL_DECADING_INTERVAL

client.onConfig( (config) => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    MOVEMENT_DURATION = config.MOVEMENT_DURATION;
    PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL == '1s' ? 1000 : 1000000;
} );

const map = {
    width:undefined,
    height:undefined,
    tiles: new Map(),
    add: function ( tile ) {
        const {x, y} = tile;
        return this.tiles.set( x+1000*y, tile );
    },
    xy: function (x, y) {
        return this.tiles.get( x+1000*y )
    }
};
client.onMap( (width, height, tiles) => {
    map.width = width;
    map.height = height;
    for (const t of tiles) {
        map.add( t );
    }
} )
client.onTile( (x, y, delivery) => {
    map.add( {x, y, delivery} );
} )

function nearestDelivery({x, y}) {
    return Array.from( map.tiles.values() ).filter( ({type}) => type==2 ).sort( (a,b) => distance(a,{x, y})-distance(b,{x, y}) )[0]
}

/**
 * Belief revision
 */

/**
 * @type { {id:string, name:string, x:number, y:number, score:number} }
 */
const me = {id: null, name: null, x: null, y: null, score: null, carrying: new Map()};

client.onYou( ( {id, name, x, y, score} ) => {
    me.id = id
    me.name = name
    me.x = x
    me.y = y
    me.score = score
} )

/**
 * @type { Map< string, {id: string, carriedBy?: string, x:number, y:number, reward:number} > }
 */
const parcels = new Map();

client.onParcelsSensing( async ( pp ) => {
    for (const p of pp) {
        parcels.set( p.id, p);
    }
    for ( const p of parcels.values() ) {
        if ( pp.map( p => p.id ).find( id => id == p.id ) == undefined ) {
            parcels.delete( p.id );
        }
    }
} )



/**
 * Options generation and filtering function
 */
function optionsGeneration () {

    // TODO revisit beliefset revision so to trigger option generation only in the case a new parcel is observed

    /**
     * Options generation
     */
        const options = [];
    
        // Check the number of parcels and the decay intervals
        const parcelsToDeliver = Array.from(parcels.values()).filter(p => p.carriedBy === me.id);
        if (parcelsToDeliver.length > 10 || parcelsToDeliver.some(p => p.reward < 10)) {
            // Find nearest delivery zone if conditions are met
            const nearestDeliveryZone = nearestDelivery(me);
            if (nearestDeliveryZone) {
                options.push(['go_deliver', nearestDeliveryZone.x, nearestDeliveryZone.y, parcelsToDeliver[0].id]); // Deliver the first parcel
            }
        }
    
        // Check for other 'go_pick_up' options if parcels are not exceeding the limit
        if (parcelsToDeliver.length <= 10) {
            for (const parcel of parcels.values()) {
                if (!parcel.carriedBy) {
                    options.push(['go_pick_up', parcel.x, parcel.y, parcel.id]);
                }
            }
        }
    
        // Options filtering - choose best one based on distance
        let best_option;
        let nearest = Number.MAX_VALUE;
        for (const option of options) {
            if (option[0] === 'go_pick_up') {
                let [go_pick_up, x, y, id] = option;
                let current_d = distance({ x, y }, me);
                if (current_d < nearest) {
                    best_option = option;
                    nearest = current_d;
                }
            }
        }
    
        // Select the best option
        if (best_option) {
            myAgent.push(best_option);
        }
    }

/**
 * Generate options at every sensing event
 */
client.onParcelsSensing( optionsGeneration )
client.onAgentsSensing( optionsGeneration )
client.onYou( optionsGeneration )

/**
 * Intention revision loop
 */
class IntentionRevision {

    #intention_queue = new Array();
    get intention_queue () {
        return this.#intention_queue;
    }

    async loop ( ) {
        while ( true ) {
            // Consumes intention_queue if not empty
            if ( this.intention_queue.length > 0 ) {
                console.log( 'intentionRevision.loop', this.intention_queue.map(i=>i.predicate) );
            
                // Current intention
                const intention = this.intention_queue[0];
                
                // Is queued intention still valid? Do I still want to achieve it?
                // TODO this hard-coded implementation is an example
                let id = intention.predicate[2]
                let p = parcels.get(id)
                if ( p && p.carriedBy ) {
                    console.log( 'Skipping intention because no more valid', intention.predicate )
                    continue;
                }

                // Start achieving intention
                await intention.achieve()
                // Catch eventual error and continue
                .catch( error => {
                    // console.log( 'Failed intention', ...intention.predicate, 'with error:', ...error )
                } );

                // Remove from the queue
                this.intention_queue.shift();
            }
            // Postpone next iteration at setImmediate
            await new Promise( res => setImmediate( res ) );
        }
    }

    // async push ( predicate ) { }

    log ( ...args ) {
        console.log( ...args )
    }

}

class IntentionRevisionRevise extends IntentionRevision {

    async push (predicate) {
        console.log('Revising intention queue. Received', ...predicate);

        const [type, x, y, id] = predicate;
        const parcel = parcels.get(id);
        if (!parcel || parcel.carriedBy) {
            console.log('Skipping invalid or taken parcel:', id);
            return;
        }

        // Utility calculation
        var distanceToParcel = distance(me, parcel);
        var movementTime = distanceToParcel * MOVEMENT_DURATION; // Time to move to the parcel
        var decayPenalty = parcel.reward / (PARCEL_DECADING_INTERVAL / 1000); // Simple model of decay impact
        var agentProximityPenalty = 0;

        // Check for nearby agents to penalize
        for (let [agentId, agent] of parcels) {
            if (agentId !== me.id && distance(me, agent) <= AGENTS_OBSERVATION_DISTANCE) {
                agentProximityPenalty += 1; // Increase penalty for nearby agents
            }
        }

        // Combine factors into utility calculation
        const newUtility = parcel.reward - distanceToParcel - agentProximityPenalty - decayPenalty;

        // Check if intention is already in queue
        const alreadyQueued = this.intention_queue.find(i => i.predicate.join(' ') === predicate.join(' '));
        if (alreadyQueued) {
            console.log('Intention already in queue:', predicate);
            return;
        }

        // Compare with the current intention
        const current = this.intention_queue[0];
        if (current) {
            const [currType, currX, currY, currId] = current.predicate;
            const currParcel = parcels.get(currId);
            if (!currParcel || currParcel.carriedBy) {
                console.log('Current intention is no longer valid. Replacing.');
                current.stop();
                this.intention_queue.shift();
            } else {
                const currDistance = distance(me, currParcel);
                const currentUtility = currParcel.reward - currDistance - (0 /* No nearby agents */) - (currParcel.reward / (PARCEL_DECADING_INTERVAL / 1000));

                if (newUtility <= currentUtility) {
                    console.log('New intention utility is lower or equal. Ignoring:', predicate);
                    return;
                }

                console.log('Better utility found. Replacing current intention.');
                current.stop();
                this.intention_queue.shift();
            }
        }

        // Add new intention with better utility
        const intention = new Intention(this, predicate);
        intention.utility = newUtility;
        this.intention_queue.unshift(intention);
    }
}


/**
 * Start intention revision loop
 */
const myAgent = new IntentionRevisionRevise();
myAgent.loop();



/**
 * Intention
 */
class Intention {

    // Plan currently used for achieving the intention 
    #current_plan;
    
    // This is used to stop the intention
    #stopped = false;
    get stopped () {
        return this.#stopped;
    }
    stop () {
        // this.log( 'stop intention', ...this.#predicate );
        this.#stopped = true;
        if ( this.#current_plan)
            this.#current_plan.stop();
    }

    /**
     * #parent refers to caller
     */
    #parent;

    /**
     * @type { any[] } predicate is in the form ['go_to', x, y]
     */
    get predicate () {
        return this.#predicate;
    }
    /**
     * @type { any[] } predicate is in the form ['go_to', x, y]
     */
    #predicate;

    constructor ( parent, predicate ) {
        this.#parent = parent;
        this.#predicate = predicate;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    #started = false;
    /**
     * Using the plan library to achieve an intention
     */
    async achieve () {
        // Cannot start twice
        if ( this.#started)
            return this;
        else
            this.#started = true;

        // Trying all plans in the library
        for (const planClass of planLibrary) {

            // if stopped then quit
            if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

            // if plan is 'statically' applicable
            if ( planClass.isApplicableTo( ...this.predicate ) ) {
                // plan is instantiated
                this.#current_plan = new planClass(this.#parent);
                this.log('achieving intention', ...this.predicate, 'with plan', planClass.name);
                // and plan is executed and result returned
                try {
                    const plan_res = await this.#current_plan.execute( ...this.predicate );
                    this.log( 'succesful intention', ...this.predicate, 'with plan', planClass.name, 'with result:', plan_res );
                    return plan_res
                // or errors are caught so to continue with next plan
                } catch (error) {
                    this.log( 'failed intention', ...this.predicate,'with plan', planClass.name, 'with error:', error );
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ) throw [ 'stopped intention', ...this.predicate ];

        // no plans have been found to satisfy the intention
        // this.log( 'no plan satisfied the intention ', ...this.predicate );
        throw ['no plan satisfied the intention ', ...this.predicate ]
    }

}

/**
 * Plan library
 */
const planLibrary = [];

class Plan {

    // This is used to stop the plan
    #stopped = false;
    stop () {
        // this.log( 'stop plan' );
        this.#stopped = true;
        for ( const i of this.#sub_intentions ) {
            i.stop();
        }
    }
    get stopped () {
        return this.#stopped;
    }

    /**
     * #parent refers to caller
     */
    #parent;

    constructor ( parent ) {
        this.#parent = parent;
    }

    log ( ...args ) {
        if ( this.#parent && this.#parent.log )
            this.#parent.log( '\t', ...args )
        else
            console.log( ...args )
    }

    // this is an array of sub intention. Multiple ones could eventually being achieved in parallel.
    #sub_intentions = [];

    async subIntention ( predicate ) {
        const sub_intention = new Intention( this, predicate );
        this.#sub_intentions.push( sub_intention );
        return sub_intention.achieve();
    }

}

class GoPickUp extends Plan {

    static isApplicableTo ( go_pick_up, x, y, id ) {
        return go_pick_up == 'go_pick_up';
    }

    async execute ( go_pick_up, x, y ) {
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await this.subIntention( ['go_to', x, y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        await client.emitPickup()
        if ( this.stopped ) throw ['stopped']; // if stopped then quit
        return true;
    }

}

class GoDeliver extends Plan {

    static isApplicableTo (go_deliver, x, y, id) {
        return go_deliver == 'go_deliver'; // Check if the action is go_deliver
    }

    async execute (go_deliver, x, y, id) {
        if (this.stopped) throw ['stopped']; // If stopped, quit immediately

        const parcel = parcels.get(id);
        if (!parcel || !parcel.carriedBy || parcel.carriedBy !== me.id) {
            console.log('No parcel to deliver or the agent is not carrying the correct parcel');
            return false;
        }

        // Step 1: Move to the delivery location (x, y)
        await this.subIntention(['go_to', x, y]);
        if (this.stopped) throw ['stopped']; // If stopped, quit immediately

        // Step 2: Deliver the parcel
        await client.emitDeliver(id); // This will emit the delivery event for the parcel
        if (this.stopped) throw ['stopped']; // If stopped, quit immediately

        // Step 3: Confirm delivery
        console.log(`Parcel ${id} delivered successfully to (${x}, ${y})`);

        return true;
    }
}


class BlindMove extends Plan {

    static isApplicableTo ( go_to, x, y ) {
        return go_to == 'go_to';
    }

    async execute ( go_to, x, y ) {

        while ( me.x != x || me.y != y ) {

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            let moved_horizontally;
            let moved_vertically;
            
            // this.log('me', me, 'xy', x, y);

            if ( x > me.x )
                moved_horizontally = await client.emitMove('right')
                // status_x = await this.subIntention( 'go_to', {x: me.x+1, y: me.y} );
            else if ( x < me.x )
                moved_horizontally = await client.emitMove('left')
                // status_x = await this.subIntention( 'go_to', {x: me.x-1, y: me.y} );

            if (moved_horizontally) {
                me.x = moved_horizontally.x;
                me.y = moved_horizontally.y;
            }

            if ( this.stopped ) throw ['stopped']; // if stopped then quit

            if ( y > me.y )
                moved_vertically = await client.emitMove('up')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y+1} );
            else if ( y < me.y )
                moved_vertically = await client.emitMove('down')
                // status_x = await this.subIntention( 'go_to', {x: me.x, y: me.y-1} );

            if (moved_vertically) {
                me.x = moved_vertically.x;
                me.y = moved_vertically.y;
            }
            
            if ( ! moved_horizontally && ! moved_vertically) {
                this.log('stucked');
                throw 'stucked';
            } else if ( me.x == x && me.y == y ) {
                // this.log('target reached');
            }
            
        }

        return true;

    }
}

// plan classes are added to plan library 
planLibrary.push( GoPickUp )
planLibrary.push( BlindMove )
planLibrary.push( GoDeliver )
