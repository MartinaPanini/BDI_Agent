// main.js

import { client} from './deliveroo/client.js';
import { me, parcels } from './beliefRevision.js';
import { optionsGeneration } from './options.js';
import { Intention } from './intention.js';
import { IntentionRevision } from './intentionRevision.js';
import './plan.js'; // per registrare i piani nella planLibrary
import './beliefRevision.js'; // per aggiornare credenze da percezioni

// Se hai bisogno di inizializzare la mappa o daemon, importali:
import './map.js';
import './depth_search_daemon.js';

// ==============================
// Inizializzazione agente
// ==============================

const myAgent = new IntentionRevision(); // o new MyAgent se hai una classe personalizzata

globalThis.myAgent = myAgent; // Per permettere a options.js di accedere

// ==============================
// Eventi di percezione
// ==============================
client.onParcelsSensing(optionsGeneration);
client.onAgentsSensing(optionsGeneration);
client.onYou(optionsGeneration);

// ==============================
// Loop periodico (fallback / safety)
// ==============================
setInterval(() => {
    if (me.id && myAgent.intentions.length === 0) {
        optionsGeneration();
    }
}, 2000);

// ==============================
// Log di partenza
// ==============================
console.log('🚀 Agente Deliveroo avviato!');
