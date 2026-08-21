import { state, memberById } from "../state/store.js";
import { session } from "../state/session.js";
import { addItem, deleteItem, serverTimestamp } from "../supabase/collections.js";
import { todayStr, fmtDateNice } from "../utils/dates.js";
import { escapeHtml, initials, fmtMoney } from "../utils/format.js";

// Two independent breakdowns per expense, each with its own colour set
// (both validated with the dataviz skill's six-check palette validator —
// fixed hue order, never cycled). "Other" is always a de-emphasis neutral,
// not a validated hue, per the "fold the tail into Other" guidance.

// Category — who/what the spend is for.
const CATEGORIES = [
  { key: 'Household', color: '#c9971b' },
  { key: 'Hazel', color: '#e63946' },
  { key: 'Rolo', color: '#7209b7' },
  { key: 'Other', color: '#9aa4b2' },
];

// Item — the type of purchase.
const ITEMS = [
  { key: 'Grocery', color: '#2a9d8f' },
  { key: 'Household Bill', color: '#4361ee' },
  { key: 'Entertainment', color: '#d6336c' },
  { key: 'Travel', color: '#c9971b' },
  { key: 'School', color: '#7209b7' },
  { key: 'Other', color: '#9aa4b2' },
];

let spendCursor = new Date();
spendCursor.setDate(1);

function monthKeyOf(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : '';
}

// Fixed order every time for both — this is identity (which bucket), not a
// ranking, so it stays put rather than reshuffling as amounts change.
function bucketRows(items, buckets, field) {
  const totals = {};
  buckets.forEach(b => { totals[b.key] = 0; });
  items.forEach(e => {
    if (totals[e[field]] === undefined) totals[e[field]] = 0;
    totals[e[field]] += Number(e.amount) || 0;
  });
  return buckets.map(b => ({ label: b.key, amount: totals[b.key] || 0, color: b.color }));
}

// Who paid this month (the expenseMember field is "Paid by"), using each
// member's own existing colour (already used for their avatar/chips
// elsewhere) so the person and the bar are visually the same thing
// everywhere in the app. Unlike categories this genuinely is a magnitude
// ranking ("who paid the most"), so it's sorted descending rather than
// held to a fixed order.
function personRows(items) {
  const totals = {};
  let sharedAmount = 0;
  items.forEach(e => {
    if (e.memberId) totals[e.memberId] = (totals[e.memberId] || 0) + (Number(e.amount) || 0);
    else sharedAmount += Number(e.amount) || 0;
  });
  const rows = state.members.map(m => ({ label: m.name, amount: totals[m.id] || 0, color: m.color }));
  if (sharedAmount > 0) rows.push({ label: 'Shared', amount: sharedAmount, color: '#9aa4b2' });
  return rows.sort((a, b) => b.amount - a.amount);
}

// Shared bar-chart renderer — one bar per row, direct-labelled at the tip;
// no legend needed since each bar already carries its own label.
function renderBarChart(containerId, rows) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(1, ...rows.map(r => r.amount));
  el.innerHTML = rows.map(r => {
    const pct = Math.round((r.amount / max) * 100);
    return `
      <div class="spend-bar-row">
        <div class="spend-bar-label">${escapeHtml(r.label)}</div>
        <div class="spend-bar-track">
          <div class="spend-bar-fill" style="width:${pct}%; background:${r.color};"></div>
        </div>
        <div class="spend-bar-value">${fmtMoney(r.amount)}</div>
      </div>
    `;
  }).join('');
}

function renderOverviewCard() {
  const card = document.getElementById('overviewSpendCard');
  if (!card) return;
  const show = session.canSeeExpenses && state.expenses.length > 0;
  card.style.display = show ? '' : 'none';
  if (!show) return;

  const monthKey = todayStr().slice(0, 7);
  const items = state.expenses.filter(e => monthKeyOf(e.date) === monthKey);
  const total = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalEl = document.getElementById('overviewSpendTotal');
  if (totalEl) totalEl.textContent = fmtMoney(total);

  // The dashboard glance leads with Category (who/what it's for) since
  // that's the dimension this household cares about seeing at a glance.
  renderBarChart('overviewSpendChart', bucketRows(items, CATEGORIES, 'category'));
}

function renderSpendingTab() {
  const monthLabelEl = document.getElementById('spendMonthLabel');
  if (monthLabelEl) monthLabelEl.textContent = spendCursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const monthKey = spendCursor.getFullYear() + '-' + String(spendCursor.getMonth() + 1).padStart(2, '0');
  const items = state.expenses.filter(e => monthKeyOf(e.date) === monthKey);
  const total = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalEl = document.getElementById('spendMonthTotal');
  if (totalEl) totalEl.textContent = fmtMoney(total);

  renderBarChart('spendCategoryChart', bucketRows(items, CATEGORIES, 'category'));
  renderBarChart('spendItemChart', bucketRows(items, ITEMS, 'item'));

  const personEl = document.getElementById('spendPersonChart');
  if (personEl) {
    const rows = personRows(items);
    personEl.innerHTML = rows.length
      ? ''
      : '<div class="empty">Add a family member to see a per-person breakdown.</div>';
    if (rows.length) renderBarChart('spendPersonChart', rows);
  }

  const listEl = document.getElementById('spendList');
  if (!listEl) return;
  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty">No spending logged for this month yet.</div>';
    return;
  }
  const sorted = [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  listEl.innerHTML = '';
  sorted.forEach(e => {
    const m = memberById(e.memberId);
    const li = document.createElement('li');
    li.className = 'task-item';
    const titleParts = [e.category, e.item].filter(Boolean).join(' — ');
    li.innerHTML = `
      <div class="task-main">
        <div class="task-title">${escapeHtml(titleParts)}${e.note ? ' — ' + escapeHtml(e.note) : ''}</div>
        <div class="task-meta">
          <span class="due-badge due-upcoming">${fmtDateNice(e.date)}</span>
          ${m ? `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>` : ''}
        </div>
      </div>
      <span class="fin-amt" style="margin-right:8px;">${fmtMoney(e.amount)}</span>
      <button class="btn small danger" title="Delete">✕</button>
    `;
    li.querySelector('button.danger').addEventListener('click', () => {
      deleteItem('expenses', e.id);
    });
    listEl.appendChild(li);
  });
}

export function renderSpending() {
  renderOverviewCard();
  renderSpendingTab();
}

function goPrevSpendMonth() { spendCursor.setMonth(spendCursor.getMonth() - 1); renderSpendingTab(); }
function goNextSpendMonth() { spendCursor.setMonth(spendCursor.getMonth() + 1); renderSpendingTab(); }

export function initSpending() {
  document.getElementById('prevSpendMonth').addEventListener('click', goPrevSpendMonth);
  document.getElementById('nextSpendMonth').addEventListener('click', goNextSpendMonth);

  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    const date = document.getElementById('expenseDate').value || todayStr();
    const category = document.getElementById('expenseCategory').value;
    const item = document.getElementById('expenseItem').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const memberId = document.getElementById('expenseMember').value;
    const note = document.getElementById('expenseNote').value.trim();
    if (!category || isNaN(amount)) return;
    addItem('expenses', { category, item, amount, date, memberId, note, createdAt: serverTimestamp() });
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDate').value = '';
    document.getElementById('expenseNote').value = '';
  });
}
