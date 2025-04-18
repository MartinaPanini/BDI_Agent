import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";

export const client = new DeliverooApi(SERVER_URL, TOKEN);

export let AGENTS_OBSERVATION_DISTANCE;
export let MOVEMENT_DURATION;
export let PARCEL_DECADING_INTERVAL;

client.onConfig(cfg => {
  AGENTS_OBSERVATION_DISTANCE = cfg.AGENTS_OBSERVATION_DISTANCE;
  MOVEMENT_DURATION = cfg.MOVEMENT_DURATION;
  PARCEL_DECADING_INTERVAL = cfg.PARCEL_DECADING_INTERVAL === '1s' ? 1000 : 1e6;
});
