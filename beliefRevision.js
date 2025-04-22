import { client } from './deliveroo/client.js';

/**
 * Belief revision
 */

/**
 * @type { {id:string, name:string, x:number, y:number, score:number} }
 */
const me = {id: null, name: null, x: null, y: null, score: null, carrying: []};

// Register informations on my agent
client.onYou( ({id, name, x, y, score, carrying}) => { 
    me.id = id;
    me.name = name;
    me.x = x;
    me.y = y;
    me.score = score;
    me.carrying = carrying || [];
});


/**
 * @type { Map< string, {id: string, carriedBy?: string, x:number, y:number, reward:number} > }
 */
const parcels = new Map();

client.onParcelsSensing( async ( pp ) => { // Add or aupdates each parcel "p" in Map parcels using its id as key
    for (const p of pp) {
        parcels.set( p.id, p);
    }
    for ( const p of parcels.values() ) { // Remove parcels that are not in the new list (are not sensed anymore)
        if ( pp.map( p => p.id ).find( id => id == p.id ) == undefined ) {
            parcels.delete( p.id );
        }
    }
} )

export { me, parcels };
