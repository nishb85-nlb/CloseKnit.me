// Central app state + a tiny pub-sub so feature modules can re-render
// whenever any collection changes, without importing each other directly.
const EMPTY_STATE = {
  members: [], tasks: [], events: [], grocery: [], shopping: [],
  debts: [], payments: [], holidays: [], wishlist: []
};

export const state = { ...EMPTY_STATE };

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach(fn => fn());
}

export function setCollection(key, items) {
  state[key] = items;
  notify();
}

// Signed-out reset — no re-render needed, the app root is hidden at this point.
export function resetState() {
  Object.keys(EMPTY_STATE).forEach(key => { state[key] = []; });
}

export function memberById(id) {
  return state.members.find(m => m.id === id);
}
