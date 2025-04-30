import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import * as pddlClient from "@unitn-asa/pddl-client";

import config from "./config.js"; // adjust the path if needed

const SERVER_URL = config.host;
const TOKEN = config.token;  

// Make sure these are defined in the environment or before import
export const client = new DeliverooApi(SERVER_URL, TOKEN);

export let AGENTS_OBSERVATION_DISTANCE;
export let MOVEMENT_DURATION;
export let PARCEL_DECADING_INTERVAL;

client.onConfig(cfg => {
  AGENTS_OBSERVATION_DISTANCE = cfg.AGENTS_OBSERVATION_DISTANCE;
  MOVEMENT_DURATION = cfg.MOVEMENT_DURATION;

  // Convert string interval like "1s" to milliseconds
  PARCEL_DECADING_INTERVAL = cfg.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1e6;
});
