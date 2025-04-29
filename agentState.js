export const me = { 
    id: null, 
    name: null, 
    x: null, 
    y: null, 
    score: null, 
    carrying: new Map() 
};

export function updateAgentState({ id, name, x, y, score }) {
    Object.assign(me, { id, name, x, y, score });
}