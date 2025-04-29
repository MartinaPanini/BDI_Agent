import { AGENTS_OBSERVATION_DISTANCE } from './config.js';
import {me} from './agentState.js';
import { optionsGeneration } from './optionsGeneration.js';
import { distance } from './helpers.js';
import EventEmitter from 'events';
import { client } from './config.js';

// Shared state declarations
export const parcels = new Map();
export const otherAgents = new Map();
export const blockedParcels = new Set();
export const visitedTiles = new Map();
export const sensingEmitter = new EventEmitter();
export const optionsWithMetadata = new Map(); 
export function setupSensingHandlers() {
    client.onParcelsSensing((perceived) => {
        let newParcel = false;
        perceived.forEach(p => {
            const d = distance(me, p);
            if (!parcels.has(p.id) && d <= AGENTS_OBSERVATION_DISTANCE) {
                newParcel = true;
                parcels.set(p.id, p);
            }
            if (p.carriedBy === me.id) me.carrying.set(p.id, p);
        });

        for (const [id, p] of parcels) {
            if (!perceived.find(q => q.id === id) && p.carriedBy === me.id) {
                parcels.delete(id);
                me.carrying.delete(id);
            }
        }

        if (newParcel) sensingEmitter.emit("new_parcel");
    });

    client.onAgentsSensing((agents) => {
        otherAgents.clear();
        for (const agent of agents) {
            if (agent.id !== me.id) {
                const d = distance(me, agent);
                if (d <= AGENTS_OBSERVATION_DISTANCE) {
                    otherAgents.set(agent.id, agent);
                }
            }
        }
    });
}