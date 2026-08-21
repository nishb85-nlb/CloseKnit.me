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

// Item — the type of purchase. A few raw dropdown values share one chart
// bucket (the cleaning/pet services below all count as "Services" here) —
// keeps the chart's colour count at the dataviz skill's 7-8 ceiling while
// the dropdown and the expense list still show exactly which service it was.
const ITEM_BUCKETS = [
  { key: 'Grocery', color: '#2a9d8f' },
  { key: 'Household Bill', color: '#4361ee' },
  { key: 'Entertainment', color: '#d6336c' },
  { key: 'Travel', color: '#c9971b' },
  { key: 'School', color: '#7209b7' },
  { key: 'Renovation', color: '#2b9348' },
  { key: 'Services', color: '#118ab2' },
  { key: 'Other', color: '#9aa4b2' },
];

const ITEM_TO_BUCKET = {
  'House Cleaner': 'Services',
  'Window Cleaner': 'Services',
  'Pet Sitter': 'Services',
};

function itemBucketOf(item) {
  return ITEM_TO_BUCKET[item] || item;
}

let spendCursor = new Date();
spendCursor.setDate(1);

function monthKeyOf(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : '';
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Standard bills recur indefinitely from their first date, same day-of-month
// each time (clamped for shorter months — the 31st becomes the 28th/30th)
// — no separate "until" date, since a recurring bill just continues until
// deleted. Like calendar.js's recurring events, this is a *virtual*
// occurrence computed for whichever month is being viewed, not a duplicated
// row, so there's still exactly one real record (and one id) per bill.
function recurringOccurrenceIn(e, year, month) {
  const start = new Date(e.date + 'T00:00:00');
  const startKey = start.getFullYear() * 12 + start.getMonth();
  const targetKey = year * 12 + month;
  if (targetKey < startKey) return null; // hasn't started yet
  const day = Math.min(start.getDate(), daysInMonth(year, month));
  const occDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { ...e, date: occDate };
}

function itemsForMonth(year, month) {
  const monthKey = year + '-' + String(month + 1).padStart(2, '0');
  const oneOff = state.expenses.filter(e => !e.recurring && monthKeyOf(e.date) === monthKey);
  const recurring = state.expenses
    .filter(e => e.recurring)
    .map(e => recurringOccurrenceIn(e, year, month))
    .filter(Boolean);
  return [...oneOff, ...recurring];
}

// Fixed order every time for both — this is identity (which bucket), not a
// ranking, so it stays put rather than reshuffling as amounts change.
function bucketRows(items, buckets, field, mapper = (v) => v) {
  const totals = {};
  buckets.forEach(b => { totals[b.key] = 0; });
  items.forEach(e => {
    const key = mapper(e[field]);
    if (totals[key] === undefined) totals[key] = 0;
    totals[key] += Number(e.amount) || 0;
  });
  return buckets.map(b => ({ label: b.key, amount: totals[b.key] || 0, color: b.color }));
}

// Who paid this month (the expenseMember field is "Paid by"), using each
// member's own existing colour (already used for their avatar/chips
// elsewhere) so the person and the bar are visually the same thing
// everywhere in the app. Unlike categories this genuinely is a magnitude
// ranking ("who paid the most"), so it's sorted descending rather than
// held to a fixed order.
// Hazel and Rolo are never the one paying (Nish/Sangi pay for everything in
// this household) — they'd only ever show up here as a permanent £0.00 bar,
// so they're excluded from this specific chart even though they're regular
// family members everywhere else (Paid by dropdown included).
const NEVER_PAYERS = new Set(['Hazel', 'Rolo']);

function personRows(items) {
  const totals = {};
  let sharedAmount = 0;
  items.forEach(e => {
    if (e.memberId) totals[e.memberId] = (totals[e.memberId] || 0) + (Number(e.amount) || 0);
    else sharedAmount += Number(e.amount) || 0;
  });
  const rows = state.members
    .filter(m => !NEVER_PAYERS.has(m.name))
    .map(m => ({ label: m.name, amount: totals[m.id] || 0, color: m.color }));
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

  const today = new Date();
  const items = itemsForMonth(today.getFullYear(), today.getMonth());
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

  const items = itemsForMonth(spendCursor.getFullYear(), spendCursor.getMonth());
  const total = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalEl = document.getElementById('spendMonthTotal');
  if (totalEl) totalEl.textContent = fmtMoney(total);

  renderBarChart('spendCategoryChart', bucketRows(items, CATEGORIES, 'category'));
  renderBarChart('spendItemChart', bucketRows(items, ITEM_BUCKETS, 'item', itemBucketOf));

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
    const recurringBadge = e.recurring ? '<span class="due-badge due-upcoming" title="Repeats every month">↻ Monthly</span>' : '';
    li.innerHTML = `
      <div class="task-main">
        <div class="task-title">${escapeHtml(titleParts)}${e.note ? ' — ' + escapeHtml(e.note) : ''}</div>
        <div class="task-meta">
          <span class="due-badge due-upcoming">${fmtDateNice(e.date)}</span>
          ${recurringBadge}
          ${m ? `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>` : ''}
        </div>
      </div>
      <span class="fin-amt" style="margin-right:8px;">${fmtMoney(e.amount)}</span>
      <button class="btn small danger" title="Delete">✕</button>
    `;
    li.querySelector('button.danger').addEventListener('click', () => {
      if (e.recurring && !confirm('This bill repeats monthly. Delete the whole series?')) return;
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
    const recurring = document.getElementById('expenseRecurring').checked;
    if (!category || isNaN(amount)) return;
    addItem('expenses', { category, item, amount, date, memberId, note, recurring, createdAt: serverTimestamp() });
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDate').value = '';
    document.getElementById('expenseNote').value = '';
    document.getElementById('expenseRecurring').checked = false;
  });
}
