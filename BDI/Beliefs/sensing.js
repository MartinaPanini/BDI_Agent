import {client} from "../deliveroo/client.js";
import {distance} from "../utils.js";
import { sharePerception } from "../Communication/communication.js";
import { teamAgentId } from "../main.js";

// Variable to store perception distances (set from config)
let AGENTS_OBSERVATION_DISTANCE;
// Load perception range configuration from the server
client.onConfig(config => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
});

// Object representing the current agent ("me")
const me = { id: null, name: null, x: null, y: null, score: null, carrying: new Map(), role:null };
// Update 'me' object when agent information is received
client.onYou(({ id, name, x, y, score }) => {
    Object.assign(me, { id, name, x, y, score });
});

// Object representing the teammate (only used in multi-agent mode)
const ally = { id: null, name: null, x: null, y: null, score: null, carrying: new Map(), currentAction: null, targetParcelId: null, role: null };


// Map to track all known parcels (id → parcel object)
const parcels = new Map();
// Set to track parcels that are blocked or inaccessible
const blockedParcels = new Set();
/**
 * Called when new parcel information is perceived.
 * Adds newly seen parcels to the map if within observation distance,
 * updates carried parcels, and shares new perceptions.
 */
client.onParcelsSensing((perceived) => {
  let newParcel = false;
  perceived.forEach(p => {
      const d = distance(me, p); 
      if (!parcels.has(p.id) && d <= AGENTS_OBSERVATION_DISTANCE) {  
        newParcel = true;
        parcels.set(p.id, p);
    
        sharePerception(teamAgentId);
      }
      if (p.carriedBy === me.id) me.carrying.set(p.id, p);
  });
  // Remove parcels that are no longer perceived or carried
  for (const [id, p] of parcels) {
      if (!perceived.find(q => q.id === id) && p.carriedBy === me.id) {
          parcels.delete(id);
          me.carrying.delete(id);
      }
  }
});

// Map of other agents (id → agent object)
let otherAgents = new Map();
/**
 * Called when other agents are perceived.
 * Updates the map of other agents within observation range and shares info.
 */
client.onAgentsSensing((agents) => {
  otherAgents.clear();
  for (const agent of agents) {
    if (agent.id !== me.id) { 
        const d = distance(me, agent);  
        // Only track agents within observation range
        if (d <= AGENTS_OBSERVATION_DISTANCE) {
            otherAgents.set(agent.id, agent); 
            sharePerception(teamAgentId);
        }
    }
  }
});

export { me, ally, parcels, otherAgents, blockedParcels };