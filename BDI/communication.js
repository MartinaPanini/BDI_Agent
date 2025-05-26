import { client } from '../deliveroo/client.js';
import { me, parcels, otherAgents } from '../Beliefs/sensing.js';

export function sharePerception(teammateId) {
    const visibleParcels = [...parcels.values()].map(p => ({
        id: p.id, x: p.x, y: p.y
    }));
    const visibleAgents = [...otherAgents.values()].map(a => ({
        id: a.id, x: a.x, y: a.y, name: a.name
    }));

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