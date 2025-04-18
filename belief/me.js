export const me = { id: null, name: null, x: null, y: null, score: null, carrying: new Map() };

client.onYou(data => {
  Object.assign(me, data);
});
