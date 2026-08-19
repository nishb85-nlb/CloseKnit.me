// Thin data-access layer over Firestore — every other module reads/writes
// data through here rather than importing the Firestore SDK directly.
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  getDocs, writeBatch, serverTimestamp
} from "firebase/firestore";
import { db } from "./client.js";
import { FAMILY_PATH } from "../config/env.js";

export const col = (name) => collection(db, FAMILY_PATH, name);
export const docRef = (name, id) => doc(col(name), id);
export const newDocRef = (name) => doc(col(name));

export function addItem(name, data) {
  return addDoc(col(name), data);
}

export function updateItem(name, id, data) {
  return updateDoc(docRef(name, id), data);
}

export function deleteItem(name, id) {
  return deleteDoc(docRef(name, id));
}

export function watchCollection(name, onChange, onError) {
  return onSnapshot(col(name), (snap) => {
    onChange(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function getAllItems(name) {
  const snap = await getDocs(col(name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteAllItems(name) {
  const snap = await getDocs(col(name));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

export function newBatch() {
  return writeBatch(db);
}

export { serverTimestamp };
