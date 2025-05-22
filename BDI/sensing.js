import {client} from "./client.js";
import {distance} from "./utils.js";
import { sharePerception } from "./communication.js";
import { teamAgentId } from "./main.js";

let AGENTS_OBSERVATION_DISTANCE;
let PARCEL_OBSERVATION_DISTANCE;
// Config loading
client.onConfig(config => {
    AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
    PARCEL_OBSERVATION_DISTANCE = config.PARCEL_OBSERVATION_DISTANCE;
});

// Me state
const me = { id: null, name: null, x: null, y: null, score: null, carrying: new Map() };
client.onYou(({ id, name, x, y, score }) => {
    Object.assign(me, { id, name, x, y, score });
});

const ally = { id: null, name: null, x: null, y: null, score: null, carrying: new Map(), currentAction: null, targetParcelId: null };

// Parcels
const parcels = new Map();
const blockedParcels = new Set();
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

  for (const [id, p] of parcels) {
      if (!perceived.find(q => q.id === id) && p.carriedBy === me.id) {
          parcels.delete(id);
          me.carrying.delete(id);
      }
  }
});

let otherAgents = new Map();
client.onAgentsSensing((agents) => {
  otherAgents.clear();
  for (const agent of agents) {
    if (agent.id !== me.id) { 
        const d = distance(me, agent);
        if (d <= AGENTS_OBSERVATION_DISTANCE) {
            otherAgents.set(agent.id, agent); 
            sharePerception(teamAgentId);
        }
    }
  }
});

export { me, ally, parcels, otherAgents, blockedParcels };