import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { log } from "console";
import EventEmitter from "events";


// modify this code in a way that if there are no parcels to pickup (no events sensed) and the agent is carrying some parcels, the only action that the agent has to do is to deliver parcels to the delivery zone nearest

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
const DELIVERY_ZONE_THRESHOLD = 10; // Set this as the distance threshold for being "near" a delivery zone

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
const sensingEmitter = new EventEmitter();


// Update parcels based on sensing events
client.onParcelsSensing((perceived_parcels) => {
    let new_parcel_sensed = false;

    for (const p of perceived_parcels) {
        if (!parcels.has(p.id)) {
            new_parcel_sensed = true;
        }
        parcels.set(p.id, p);
        if (p.carriedBy === me.id) {
            me.carrying.set(p.id, p);
        }
    }

    // Remove parcels that are no longer sensed
    for (const [id, p] of parcels.entries()) {
        const stillVisible = perceived_parcels.find((q) => q.id === id);
        if (!stillVisible && p.carriedBy === me.id) {
            parcels.delete(id);
            me.carrying.delete(id);
        }
    }

    // Emit event only if a new parcel was sensed or existing parcel changed
    if (new_parcel_sensed) sensingEmitter.emit("new_parcel");
});


/**
 * Options generation and filtering function
 */

// Global store for option metadata
const optionsWithMetadata = new Map();
function optionsGeneration() {
    let carriedQty = me.carrying.size;
    let carriedReward = Array.from(me.carrying.values()).reduce((acc, parcel) => acc + parcel.reward, 0);
    const options = [];

    // Check for nearby delivery zone
    const deliveryTile = nearestDelivery(me);
    const distanceToDelivery = distance(me, deliveryTile);
    let deliveryUtility = 0;

    // If the agent is carrying parcels and there's a nearby delivery zone
    if (carriedReward > 0) {
        //console.log('DeliveryTile:', deliveryTile);
        //console.log('Distance to delivery:', distanceToDelivery);

        // Calculate utility for delivery, prioritizing if the agent is close to the delivery zone
        if (distanceToDelivery < DELIVERY_ZONE_THRESHOLD) {
            // Prioritize delivery if within threshold, set utility to a high value
            deliveryUtility = 10000; // Make it high to prioritize delivery
            //console.log('Delivery option is prioritized due to proximity');
        } else {
            // Calculate utility when the agent is not close
            deliveryUtility = carriedReward - carriedQty * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * distanceToDelivery;
        }

        const deliveryOption = ['go_deliver'];
        deliveryOption._meta = { utility: deliveryUtility };
        optionsWithMetadata.set(deliveryOption.join(','), deliveryOption._meta);
        options.push(deliveryOption);
    }

    if (carriedReward <= 0 || parcels.size > 0) {
        for (const parcel of parcels.values()) {
            if (!parcel.carriedBy) {
                const opt = ['go_pick_up', parcel.x, parcel.y, parcel.id, parcel.reward];
                const utility = carriedReward + parcel.reward - (carriedQty + 1) * MOVEMENT_DURATION / PARCEL_DECADING_INTERVAL * (distance({x: parcel.x, y: parcel.y}, me) + distance({x: parcel.x, y: parcel.y}, deliveryTile));
                opt._meta = { utility };
                optionsWithMetadata.set(opt.join(','), opt._meta);
                options.push(opt);
            }
        }
    }

    // Check if no options are available (i.e., agent has nothing to do)
    if (options.length === 0) {
        const randomMoveOption = ['random_move'];
        randomMoveOption._meta = { utility: 0 }; // You can set utility to 0 since it's a fallback option
        optionsWithMetadata.set(randomMoveOption.join(','), randomMoveOption._meta);
        options.push(randomMoveOption);
    }

    // Sort the options based on utility, with delivery prioritized if applicable
    options.sort((a, b) => b._meta.utility - a._meta.utility);

    console.log('options sorted', options.map(o => `${o[0]} (U=${o._meta.utility.toFixed(2)})`));

    for (const opt of options) {
        myAgent.push(opt);
        //console.log('pushed option', ...opt);
    }
}


/**
 * Generate options only when a relevant event occurs
 */
// Event-Driven Update for Pickup Utility
sensingEmitter.on('new_parcel', () => {
    console.log('New parcel sensed, recalculating options...');
    optionsGeneration();
});
//client.onAgentsSensing(optionsGeneration);
client.onYou(optionsGeneration);

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
            if (this.intention_queue.length > 0) {
                const intention = this.intention_queue[0];
                //console.log('Intention queue:', this.intention_queue.map(i => i.predicate));
                
                // Check if the current intention is still valid
                let id = intention.predicate[2];
                let parcel = parcels.get(id);
                if (parcel && parcel.carriedBy) {
                    //console.log('Skipping intention, parcel no longer valid');
                    continue;
                }

                // Execute the intention
                await intention.achieve().catch((error) => {
                    //console.log('Failed intention:', ...intention.predicate, 'Error:', error);
                });

                // Remove executed intention from the queue
                this.intention_queue.shift();
            }

            await new Promise((resolve) => setImmediate(resolve)); // Loop with delay
        }
    }
}

class IntentionRevisionReplace extends IntentionRevision {

    async push ( predicate ) {
        const key = predicate.join(',');
        const newMeta = optionsWithMetadata.get(key);
        const newUtility = newMeta?.utility ?? 0;

        const current = this.intention_queue[0];

        if (current) {
            const currKey = current.predicate.join(',');
            const currentMeta = optionsWithMetadata.get(currKey);
            const currUtility = currentMeta?.utility ?? 0;

            if (currKey === key) {
                //console.log('Intention already being pursued:', predicate);
                return;
            }

            if (newUtility <= currUtility) {
                //console.log('New intention has lower utility. Ignoring:', predicate);
                return;
            }

            console.log('Replacing current intention with higher utility one');
            current.stop();
            this.intention_queue.shift();
        }

        console.log('IntentionRevisionReplace.push', predicate, `(U=${newUtility.toFixed(2)})`);
        const intention = new Intention(this, predicate);
        intention.utility = newUtility;
        this.intention_queue.unshift(intention); // use unshift to prioritize
    }
}


/**
 * Start intention revision loop
 */
const myAgent = new IntentionRevisionReplace();
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
                    optionsGeneration();
                }
            }

        }

        // if stopped then quit
        if ( this.stopped ){
            optionsGeneration();
            throw [ 'stopped intention', ...this.predicate ];
        }
        // no plans have been found to satisfy the intention
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

    static isApplicableTo ( go_deliver ) {
        return go_deliver == 'go_deliver';
    }

    async execute ( go_deliver ) {

        let deliveryTile = nearestDelivery( me );

        await this.subIntention( ['go_to', deliveryTile.x, deliveryTile.y] );
        if ( this.stopped ) throw ['stopped']; // if stopped then quit

        await client.emitPutdown()
        if ( this.stopped ) throw ['stopped']; // if stopped then quit

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
                // this.log('stucked');
                throw 'stucked';
            } else if ( me.x == x && me.y == y ) {
                // this.log('target reached');
            }
            
        }

        return true;

    }
}

class RandomMove extends Plan {

    static isApplicableTo () {
        // RandomMove is always applicable, it doesn't depend on any specific condition
        return true;
    }

    async execute () {
        while (true) {

            if (this.stopped) throw ['stopped']; // if stopped then quit

            // Generate a random direction
            const directions = ['up', 'down', 'left', 'right'];
            const randomDirection = directions[Math.floor(Math.random() * directions.length)];

            let moveResult;

            // Move in the randomly selected direction
            switch (randomDirection) {
                case 'up':
                    moveResult = await client.emitMove('up');
                    break;
                case 'down':
                    moveResult = await client.emitMove('down');
                    break;
                case 'left':
                    moveResult = await client.emitMove('left');
                    break;
                case 'right':
                    moveResult = await client.emitMove('right');
                    break;
                default:
                    break;
            }

            // If the move was successful, update agent's position
            if (moveResult) {
                me.x = moveResult.x;
                me.y = moveResult.y;
            }

            // Log for debugging
            console.log(`Moved randomly: ${randomDirection}`);

            // Small delay to avoid continuous rapid movement
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between moves

            if (this.stopped) throw ['stopped']; // if stopped then quit
        }

        return true;
    }
}

// plan classes are added to plan library 
planLibrary.push( GoPickUp )
planLibrary.push( GoDeliver )
planLibrary.push( BlindMove )
planLibrary.push( RandomMove )

