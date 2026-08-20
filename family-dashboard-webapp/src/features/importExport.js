import { state } from "../state/store.js";
import { session } from "../state/session.js";
import { deleteAllItems, newBatch, docRef, newDocRef } from "../supabase/collections.js";
import { todayStr } from "../utils/dates.js";

export function initImportExport() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-dashboard-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!(data.members && data.tasks && data.events)) {
          alert("That file doesn't look like a family dashboard export.");
          return;
        }
        if (!confirm('This replaces the shared data for the whole family with the contents of this file. Continue?')) return;

        const collections = { members: data.members, tasks: data.tasks, events: data.events, grocery: data.grocery || [], shopping: data.shopping || [], holidays: data.holidays || [], wishlist: data.wishlist || [] };
        if (session.canSeeFinance) {
          // Only imported for Nish/Sangeetha — importing as anyone else would hit a
          // Firestore permissions error on these two collections and abort the whole import.
          collections.debts = data.debts || [];
          collections.payments = data.payments || [];
        }
        for (const name of Object.keys(collections)) {
          await deleteAllItems(name);
        }
        // Preserve original IDs so cross-references (assignee, memberId, completedBy) still resolve.
        for (const [name, items] of Object.entries(collections)) {
          const batch = newBatch();
          items.forEach(item => {
            const { id, ...rest } = item;
            // Supabase's bulk upsert fills any key missing from a row with SQL
            // NULL rather than the column's default, so a not-null column with
            // a default (events.repeat) needs the default applied explicitly
            // for older exports that never had this field.
            if (name === 'events' && rest.repeat === undefined) rest.repeat = 'none';
            const ref = id ? docRef(name, id) : newDocRef(name);
            batch.set(ref, rest);
          });
          await batch.commit();
        }
      } catch (err) {
        alert('Could not import that file: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}
