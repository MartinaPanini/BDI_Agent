import { DeliverooApi } from "@unitn-asa/deliveroo-js-client";
import EventEmitter from "events";
import depth_search_daemon from "./depth_search_daemon.js"; // Assuming this module exists for depth search

// Initialize the Deliveroo API client and the belief model
const client = new DeliverooApi(/* Your API URL */);
const depth_search = depth_search_daemon(client);

const me = {
  id: undefined,
  name: undefined,
  x: undefined,
  y: undefined,
  score: undefined,
  carrying: new Map(),
};
client.onYou(({ id, name, x, y, score }) => {
  me.id = id;
  me.name = name;
  me.x = x;
  me.y = y;
  me.score = score;
});

const parcels = new Map();
const sensingEmitter = new EventEmitter();
client.onParcelsSensing(async (perceived_parcels) => {
  // Handle parcel perception and update beliefs
  let new_parcel_sensed = false;
  for (const p of perceived_parcels) {
    if (!parcels.has(p.id)) new_parcel_sensed = true;
    parcels.set(p.id, p);
    if (p.carriedBy == me.id) {
      me.carrying.set(p.id, p);
    }
  }
  for (const [id, p] of parcels.entries()) {
    if (!perceived_parcels.find((p) => p.id == id)) {
      parcels.delete(id);
      me.carrying.delete(id);
    }
  }
  if (new_parcel_sensed) sensingEmitter.emit("new_parcel");
});

// Handle agent configuration
var AGENTS_OBSERVATION_DISTANCE;
var MOVEMENT_DURATION;
var PARCEL_DECADING_INTERVAL;
client.onConfig((config) => {
  AGENTS_OBSERVATION_DISTANCE = config.AGENTS_OBSERVATION_DISTANCE;
  MOVEMENT_DURATION = config.MOVEMENT_DURATION;
  PARCEL_DECADING_INTERVAL = config.PARCEL_DECADING_INTERVAL == "1s" ? 1000 : 1000000;
});

// Handle map setup
const map = {
  width: undefined,
  height: undefined,
  tiles: new Map(),
  add: function (tile) {
    const { x, y } = tile;
    return this.tiles.set(x + 1000 * y, tile);
  },
  xy: function (x, y) {
    return this.tiles.get(x + 1000 * y);
  }
};
client.onMap((width, height, tiles) => {
  map.width = width;
  map.height = height;
  for (const t of tiles) {
    map.add(t);
  }
});

// Start handling parcels, agents, etc.
