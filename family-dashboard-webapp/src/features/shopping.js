import { state, memberById } from "../state/store.js";
import { addItem, updateItem, deleteItem, serverTimestamp } from "../firebase/collections.js";
import { escapeHtml, initials } from "../utils/format.js";

export function renderShopping() {
  const container = document.getElementById('shoppingList');
  container.innerHTML = '';
  if (state.shopping.length === 0) {
    container.innerHTML = '<div class="empty">Shopping list is empty — add something above.</div>';
    return;
  }
  const sorted = [...state.shopping].sort((a, b) => (a.done === b.done) ? 0 : (a.done ? 1 : -1));
  sorted.forEach(item => {
    const m = memberById(item.assignee);
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.innerHTML = `
      <input type="checkbox" ${item.done ? 'checked' : ''}>
      <div class="task-main">
        <div class="task-title ${item.done ? 'done' : ''}">${escapeHtml(item.text)}</div>
        <div class="task-meta">
          ${m ? `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>` : ''}
        </div>
        ${item.notes ? `<div class="task-notes">${escapeHtml(item.notes)}</div>` : ''}
      </div>
      <button class="btn small danger">✕</button>
    `;
    li.querySelector('input').addEventListener('change', e => {
      updateItem('shopping', item.id, { done: e.target.checked });
    });
    li.querySelector('button').addEventListener('click', () => {
      deleteItem('shopping', item.id);
    });
    container.appendChild(li);
  });
}

export function initShopping() {
  document.getElementById('addShoppingBtn').addEventListener('click', () => {
    const input = document.getElementById('shoppingText');
    const text = input.value.trim();
    if (!text) return;
    const assignee = document.getElementById('shoppingAssignee').value;
    const notes = document.getElementById('shoppingNotes').value.trim();
    addItem('shopping', { text, assignee, notes, done: false, createdAt: serverTimestamp() });
    input.value = '';
    document.getElementById('shoppingNotes').value = '';
  });
  document.getElementById('shoppingText').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addShoppingBtn').click();
  });
  document.getElementById('clearShoppingBtn').addEventListener('click', async () => {
    const done = state.shopping.filter(s => s.done);
    await Promise.all(done.map(s => deleteItem('shopping', s.id)));
  });
}
