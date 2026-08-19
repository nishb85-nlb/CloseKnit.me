import { state, memberById } from "../state/store.js";
import { addItem, updateItem, deleteItem, serverTimestamp } from "../firebase/collections.js";
import { escapeHtml, initials } from "../utils/format.js";

let editingWishId = null;

// Only ever render a link badge for http(s) URLs — guards against a stray
// javascript: URI (typed or pasted) ever ending up as a clickable href.
function safeWishLink(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (e) { }
  return '';
}

export function renderWishlist() {
  const list = document.getElementById('wishListEl');
  list.innerHTML = '';
  if (state.wishlist.length === 0) {
    list.innerHTML = '<div class="empty">No wishes added yet — add one above.</div>';
    return;
  }
  const sorted = [...state.wishlist].sort((a, b) => {
    const an = memberById(a.memberId) ? memberById(a.memberId).name : '';
    const bn = memberById(b.memberId) ? memberById(b.memberId).name : '';
    return an.localeCompare(bn);
  });
  sorted.forEach(w => {
    const m = memberById(w.memberId);
    const link = safeWishLink(w.link);
    const li = document.createElement('li');
    li.className = 'task-item';
    li.style.alignItems = 'center';
    if (w.id === editingWishId) li.style.boxShadow = 'inset 0 0 0 2px var(--c-wishlist)';
    li.innerHTML = `
      <div class="task-main" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        ${m ? `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>` : ''}
        <span class="task-title">${escapeHtml(w.item)}</span>
        ${link ? `<a class="ref-badge" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View product ↗</a>` : ''}
        ${w.notes ? `<span style="color:var(--ink-soft); font-size:0.8rem;">${escapeHtml(w.notes)}</span>` : ''}
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn small" data-action="editWish" data-id="${w.id}">✎ Edit</button>
        <button class="btn small danger" data-action="delWish" data-id="${w.id}">✕</button>
      </div>
    `;
    li.querySelector('[data-action="editWish"]').addEventListener('click', () => {
      startEditWish(w);
    });
    li.querySelector('[data-action="delWish"]').addEventListener('click', () => {
      if (w.id === editingWishId) cancelWishEdit();
      deleteItem('wishlist', w.id);
    });
    list.appendChild(li);
  });
}

function startEditWish(w) {
  editingWishId = w.id;
  document.getElementById('wishMember').value = w.memberId || '';
  document.getElementById('wishItem').value = w.item || '';
  document.getElementById('wishLink').value = w.link || '';
  document.getElementById('wishNotes').value = w.notes || '';
  document.getElementById('addWishBtn').textContent = 'Save changes';
  document.getElementById('cancelWishEditBtn').style.display = '';
  document.getElementById('wishItem').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderWishlist();
}

function cancelWishEdit() {
  editingWishId = null;
  document.getElementById('wishItem').value = '';
  document.getElementById('wishLink').value = '';
  document.getElementById('wishNotes').value = '';
  document.getElementById('addWishBtn').textContent = 'Add wish';
  document.getElementById('cancelWishEditBtn').style.display = 'none';
  renderWishlist();
}

export function initWishlist() {
  document.getElementById('cancelWishEditBtn').addEventListener('click', cancelWishEdit);

  document.getElementById('addWishBtn').addEventListener('click', () => {
    const memberId = document.getElementById('wishMember').value;
    const item = document.getElementById('wishItem').value.trim();
    const link = document.getElementById('wishLink').value.trim();
    const notes = document.getElementById('wishNotes').value.trim();
    if (!memberId || !item) return;
    if (editingWishId) {
      updateItem('wishlist', editingWishId, { memberId, item, link, notes });
      cancelWishEdit();
      return;
    }
    addItem('wishlist', { memberId, item, link, notes, createdAt: serverTimestamp() });
    document.getElementById('wishItem').value = '';
    document.getElementById('wishLink').value = '';
    document.getElementById('wishNotes').value = '';
  });
}
