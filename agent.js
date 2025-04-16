import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import { v4 as uuidv4 } from 'uuid';
import { initializeBelief, updateMe, updateParcels } from "./beliefs";
import { IntentionRevisionQueue, IntentionRevisionReplace, IntentionRevisionPriority } from "./intentions";
import { generateOptions } from "./options";
import { setupPlans } from "./plans";
import { broadcastAgentStatus } from "../socket";

let client = null;
let myAgent = null;
let agentConfig = {
  token: process.env.DELIVEROO_TOKEN || "",
  serverUrl: process.env.DELIVEROO_SERVER || "https://deliveroojs25.azurewebsites.net/",
  intentionRevisionStrategy: "replace",
  agentName: "BDI Agent"
};

let agentStatus = {
  connected: false,
  running: false,
  config: agentConfig,
  agentInfo: {
    id: null,
    name: null,
    x: null,
    y: null,
    score: null
  }
};

export function updateAgentConfig(config) {
  agentConfig = {
    ...agentConfig,
    ...config
  };
  
  agentStatus.config = agentConfig;
  broadcastAgentStatus(agentStatus);
  
  return agentConfig;
}

export function getAgentStatus() {
  return agentStatus;
}

export async function startAgent() {
  if (agentStatus.running) {
    return { success: false, message: "Agent is already running" };
  }

  try {
    // Initialize the client
    client = new DeliverooApi(
      agentConfig.serverUrl,
      agentConfig.token
    );

    // Initialize belief system
    initializeBelief();

    // Initialize the right intention revision strategy
    switch (agentConfig.intentionRevisionStrategy) {
      case "queue":
        myAgent = new IntentionRevisionQueue();
        break;
      case "replace":
        myAgent = new IntentionRevisionReplace();
        break;
      case "priority":
        myAgent = new IntentionRevisionPriority();
        break;
      default:
        myAgent = new IntentionRevisionReplace();
    }

    // Initialize plans
    setupPlans();

    // Set up sensing handlers
    client.onYou((data) => {
      updateMe(data);
      agentStatus.agentInfo = data;
      broadcastAgentStatus(agentStatus);
      generateOptions(myAgent);
    });

    client.onParcelsSensing((parcels) => {
      updateParcels(parcels);
      generateOptions(myAgent);
    });

    client.onAgentsSensing(() => {
      generateOptions(myAgent);
    });

    // Start the intention revision loop
    myAgent.loop();
    
    // Set global agent for access without circular dependencies
    globalThis.BDI_AGENT = myAgent;

    // Update status
    agentStatus.connected = true;
    agentStatus.running = true;
    broadcastAgentStatus(agentStatus);

    return { success: true, message: "Agent started successfully" };
  } catch (error) {
    console.error("Failed to start agent:", error);
    return { success: false, message: "Failed to start agent: " + error.message };
  }
}

export async function stopAgent() {
  if (!agentStatus.running) {
    return { success: false, message: "Agent is not running" };
  }

  try {
    // Stop the intention revision loop if myAgent exists
    if (myAgent) {
      myAgent.stop();
    }

    // Clean up client if it exists
    if (client) {
      client = null;
    }
    
    // Clear global agent reference
    globalThis.BDI_AGENT = null;

    // Update status
    agentStatus.connected = false;
    agentStatus.running = false;
    broadcastAgentStatus(agentStatus);

    return { success: true, message: "Agent stopped successfully" };
  } catch (error) {
    console.error("Failed to stop agent:", error);
    return { success: false, message: "Failed to stop agent: " + error.message };
  }
}

export function getClient() {
  return client;
}

export function getAgent() {
  return myAgent;
}
