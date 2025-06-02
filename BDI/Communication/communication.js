import { client } from '../deliveroo/client.js';
import { me, parcels, otherAgents } from '../Beliefs/sensing.js';

/**
 * Shares the agent's current perception (visible parcels and agents)
 * with a teammate agent, identified by `teammateId`.
 *
 * @param {string} teammateId 
 */
export function sharePerception(teammateId) {
    // Extract visible parcel data (id and coordinates only)
    const visibleParcels = [...parcels.values()].map(p => ({
        id: p.id,
        x: p.x,
        y: p.y
    }));

    // Extract visible agent data (id, name, and coordinates)
    const visibleAgents = [...otherAgents.values()].map(a => ({
        id: a.id,
        x: a.x,
        y: a.y,
        name: a.name
    }));

    // Construct the perception message to be sent
    const message = {
        type: 'perception-update',
        from: me.id,               
        name: me.name,            
        x: me.x,                  
        y: me.y,                   
        parcels: visibleParcels,   
        agents: visibleAgents      
    };

    client.emitSay(teammateId, message);
}