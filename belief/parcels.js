import EventEmitter from "events";
import { client } from "../client.js";
import { me } from "./me.js";

export const parcels = new Map(); // id -> parcel data
export const sensingEmitter = new EventEmitter();

client.onParcelsSensing((list) => {
  const seenNow = new Set();
  let newParcelDetected = false;

  // Track what I'm carrying
  me.carrying.clear();

  for (const p of list) {
    seenNow.add(p.id);

    // I'm carrying this one
    if (p.carriedBy === me.id) {
      me.carrying.set(p.id, p);
    }

    // Check if it's a new parcel
    if (!parcels.has(p.id)) {
      newParcelDetected = true;
    }

    // Update or add the parcel
    parcels.set(p.id, p);
  }

  // Remove stale parcels (not in sensing and not carried)
  for (const [id, parcel] of parcels.entries()) {
    const isBeingCarried = parcel.carriedBy !== null;
    const isVisible = seenNow.has(id);

    // Only remove if it's not carried and wasn't just sensed
    if (!isVisible && !isBeingCarried) {
      parcels.delete(id);
    }
  }

  if (newParcelDetected) {
    sensingEmitter.emit("new_parcel");
  }
});
