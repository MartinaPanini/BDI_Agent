import { shout, listen } from "./communication.js";
import { me, parcels } from "./sensing.js";

// Periodically assign pickup tasks
setInterval(() => {
  for (const [id, parcel] of parcels) {
    shout("pickup-task", { parcelId: id });
  }
}, 3000);
