// Wires the synced collections to the state store, and seeds starter data
// the very first time the family's Firestore database is empty.
import { watchCollection, getAllItems, newBatch, newDocRef } from "./collections.js";
import { setCollection } from "../state/store.js";
import { session } from "../state/session.js";
import { PALETTE } from "../config/env.js";

const SYNCED_COLLECTIONS = ['members', 'tasks', 'events', 'grocery', 'shopping', 'holidays', 'wishlist'];

let unsubscribers = [];
let seedChecked = false;

function watch(name) {
  const unsub = watchCollection(name, (items) => setCollection(name, items), (err) => {
    console.error('Sync error on', name, err);
  });
  unsubscribers.push(unsub);
}

export function startSync() {
  stopSync();
  SYNCED_COLLECTIONS.forEach(watch);
  if (session.canSeeFinance) {
    watch('debts');
    watch('payments');
  } else {
    setCollection('debts', []);
    setCollection('payments', []);
  }
  if (session.canSeeExpenses) {
    watch('expenses');
  } else {
    setCollection('expenses', []);
  }
  if (!seedChecked) {
    seedChecked = true;
    seedIfEmpty();
  }
}

export function stopSync() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
}

// One-off seed of starter members + the Google Calendar snapshot imported on 2026-08-14,
// so the first person to sign in gets the same starting point the standalone version had.
async function seedIfEmpty() {
  try {
    const existing = await getAllItems('members');
    if (existing.length) return;

    const batch = newBatch();
    const starters = [
      { name: "Nish", color: PALETTE[0] },
      { name: "Sangi", color: PALETTE[1] },
      { name: "Hazel", color: PALETTE[2] },
      { name: "Rolo", color: PALETTE[3] }
    ];
    const memberRefs = {};
    starters.forEach(m => {
      const ref = newDocRef('members');
      batch.set(ref, m);
      memberRefs[m.name] = ref.id;
    });

    const importedEvents = [
      { date: '2026-08-01', time: '17:00', title: 'Charlotte/Toby', memberId: '' },
      { date: '2026-08-03', time: '11:15', title: 'Peel 11.15 to 12.15', memberId: '' },
      { date: '2026-08-03', time: '16:45', title: 'Rolo health check', memberId: memberRefs.Rolo },
      { date: '2026-08-04', time: '13:00', title: 'Movie - Hazel & Torpey', memberId: memberRefs.Hazel },
      { date: '2026-08-06', time: '08:00', title: 'Adit bday', memberId: '' },
      { date: '2026-08-11', time: '16:00', title: 'Kedi painting', memberId: '' },
      { date: '2026-08-12', time: '18:00', title: 'Dinner', memberId: '' },
      { date: '2026-08-13', time: '08:00', title: "Sangi going into fortnums", memberId: memberRefs.Sangi },
      { date: '2026-08-14', time: '17:00', title: 'Movie with Cristina', memberId: '' },
      { date: '2026-08-15', time: '08:00', title: 'Beach day', memberId: '' },
      { date: '2026-08-18', time: '09:00', title: 'Krish & Darien wedding day', memberId: '' },
      { date: '2026-08-22', time: '', title: 'Twikemham', memberId: '' },
      { date: '2026-08-23', time: '20:45', title: 'Sangi & Hazel - India', memberId: '' },
      { date: '2026-08-25', time: '11:00', title: 'Rolo Tablet', memberId: memberRefs.Rolo },
      { date: '2026-08-28', time: '', title: 'Berlin - Tough Mudder (multi-day, starts)', memberId: '' },
      { date: '2026-08-28', time: '09:30', title: 'Rolo Trim', memberId: memberRefs.Rolo },
      { date: '2026-09-01', time: '16:30', title: 'Rolo Vaccination', memberId: memberRefs.Rolo },
      { date: '2026-09-05', time: '08:00', title: 'Rolo - Bi yearly tablet (tapeworm)', memberId: memberRefs.Rolo },
      { date: '2026-09-05', time: '21:00', title: 'De worming - Rolo', memberId: memberRefs.Rolo },
      { date: '2026-09-06', time: '12:30', title: "BBQ @ John & Shobana's", memberId: '' },
      { date: '2026-09-07', time: '', title: '1st Day SWPS', memberId: '' },
      { date: '2026-09-13', time: '', title: 'Sangi Thames Walk', memberId: memberRefs.Sangi },
      { date: '2026-09-20', time: '09:00', title: 'Jon & Shobana Windsor', memberId: '' },
      { date: '2026-09-25', time: '08:00', title: "National Daughter's Day", memberId: '' },
      { date: '2026-09-25', time: '11:00', title: 'Rolo Tablet', memberId: memberRefs.Rolo },
      { date: '2026-10-05', time: '21:00', title: 'De worming - Rolo', memberId: memberRefs.Rolo },
      { date: '2026-10-09', time: '09:30', title: 'Rolo Trim', memberId: memberRefs.Rolo },
      { date: '2026-10-19', time: '', title: 'SWPS Half Term (multi-day, starts)', memberId: '' },
      { date: '2026-10-23', time: '', title: 'Sangeetha 40th', memberId: memberRefs.Sangi },
      { date: '2026-10-25', time: '11:00', title: 'Rolo Tablet', memberId: memberRefs.Rolo },
      { date: '2026-11-05', time: '21:00', title: 'De worming - Rolo', memberId: memberRefs.Rolo },
      { date: '2026-11-08', time: '20:45', title: 'Sangi & Hazel - India', memberId: '' }
    ];
    importedEvents.forEach(ev => {
      const ref = newDocRef('events');
      batch.set(ref, ev);
    });

    await batch.commit();
  } catch (err) {
    console.error('Seed failed', err);
  }
}
