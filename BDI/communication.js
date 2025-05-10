import { client } from "./client.js";
import { me } from "./sensing.js";

const MSG_PREFIX = "comm";
const listeners = new Map();
const knownAgents = new Map();
let myRole = null;

client.onMsg(MSG_PREFIX, (id, name, msg) => {
  if (msg.role) knownAgents.set(id, msg.role); // track known roles

  if (msg.type && listeners.has(msg.type)) {
    listeners.get(msg.type).forEach(callback => callback(id, name, msg));
  }
});

export function say(toId, type, content) {
  client.say(MSG_PREFIX, toId, { type, from: me.id, role: myRole, ...content });
}

export function shout(type, content) {
  client.shout(MSG_PREFIX, { type, from: me.id, role: myRole, ...content });
}

export function ask(toId, type, content) {
  return new Promise(resolve => {
    const responseType = `${type}_reply_${Date.now()}`;
    listenOnce(responseType, (_, __, msg) => resolve(msg));
    say(toId, type, { ...content, replyTo: responseType });
  });
}

export function reply(toId, replyTo, content) {
  say(toId, replyTo, content);
}

export function listen(type, callback) {
  if (!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(callback);
}

export function listenOnce(type, callback) {
  const wrapper = (id, name, msg) => {
    callback(id, name, msg);
    removeListener(type, wrapper);
  };
  listen(type, wrapper);
}

function removeListener(type, callback) {
  const list = listeners.get(type);
  if (!list) return;
  const i = list.indexOf(callback);
  if (i !== -1) list.splice(i, 1);
}

export function setRole(role) {
  myRole = role;
  setInterval(() => shout("role-announcement", {}), 5000); // passive broadcast
}

export function getRole(agentId) {
  return knownAgents.get(agentId);
}
