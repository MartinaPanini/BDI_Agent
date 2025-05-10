import { listen, say } from "./communication.js";
import { me } from "./sensing.js";

listen("pickup-task", (fromId, fromName, msg) => {
  console.log(`Received task to pick up parcel ${msg.parcelId}`);
  // You can add acceptance logic and coordinate pickup
});
