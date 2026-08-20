// Thin data-access layer over Supabase — every other module reads/writes
// data through here rather than importing the Supabase client directly.
// Postgres columns are snake_case; this layer converts to/from the camelCase
// shape the rest of the app already expects, so no feature file needed to change.
import { supabase } from "./client.js";

function camelToSnake(key) {
  return key.replace(/[A-Z]/g, l => '_' + l.toLowerCase());
}
function snakeToCamel(key) {
  return key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

// '' -> null going into Postgres (empty string isn't valid for date/text-FK
// columns); null -> '' coming back out, so the rest of the app keeps seeing
// the same falsy values it always has (arrays become [] instead).
// Firestore Timestamp objects ({seconds, nanoseconds}) show up in old export
// JSON (e.g. createdAt) — Postgres timestamptz columns can't accept those
// directly, so convert to an ISO string here rather than at every call site.
function isFirestoreTimestamp(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && typeof v.seconds === 'number';
}
function toSnake(obj) {
  const out = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (isFirestoreTimestamp(v)) v = new Date(v.seconds * 1000).toISOString();
    out[camelToSnake(k)] = (v === '') ? null : v;
  });
  return out;
}
function toCamel(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    const key = snakeToCamel(k);
    out[key] = (v === null) ? (Array.isArray(row[k]) ? [] : '') : v;
  });
  return out;
}

export function docRef(name, id) {
  return { table: name, id };
}
export function newDocRef(name) {
  return { table: name, id: crypto.randomUUID() };
}

export async function addItem(name, data) {
  const { error } = await supabase.from(name).insert(toSnake(data));
  if (error) throw error;
}

export async function updateItem(name, id, data) {
  const { error } = await supabase.from(name).update(toSnake(data)).eq('id', id);
  if (error) throw error;
}

export async function deleteItem(name, id) {
  const { error } = await supabase.from(name).delete().eq('id', id);
  if (error) throw error;
}

export function watchCollection(name, onChange, onError) {
  let live = true;
  async function refresh() {
    try {
      const items = await getAllItems(name);
      if (live) onChange(items);
    } catch (err) {
      if (live && onError) onError(err);
    }
  }
  refresh();
  const channel = supabase
    .channel(`public:${name}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: name }, refresh)
    .subscribe();
  return () => {
    live = false;
    supabase.removeChannel(channel);
  };
}

export async function getAllItems(name) {
  const { data, error } = await supabase.from(name).select('*');
  if (error) throw error;
  return data.map(toCamel);
}

export async function deleteAllItems(name) {
  const { data, error } = await supabase.from(name).select('id');
  if (error) throw error;
  if (!data.length) return;
  const { error: delErr } = await supabase.from(name).delete().in('id', data.map(r => r.id));
  if (delErr) throw delErr;
}

// A tiny batch shim so importExport.js and the starter-data seed can write
// many docs (with explicit, pre-chosen IDs) in one go, same shape as the old
// Firestore writeBatch()/newDocRef().
export function newBatch() {
  const ops = [];
  return {
    set(ref, data) {
      ops.push({ table: ref.table, row: { id: ref.id, ...toSnake(data) } });
    },
    async commit() {
      const byTable = {};
      ops.forEach(op => { (byTable[op.table] ||= []).push(op.row); });
      for (const [table, rows] of Object.entries(byTable)) {
        const { error } = await supabase.from(table).upsert(rows);
        if (error) throw error;
      }
    }
  };
}

// No-op — created_at is set by the table's default now(), the same effect
// serverTimestamp() had. Kept so calling code needs no changes.
export function serverTimestamp() {
  return undefined;
}
