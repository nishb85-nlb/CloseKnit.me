import { state, memberById } from "../state/store.js";
import { session } from "../state/session.js";
import { addItem, deleteItem, serverTimestamp } from "../supabase/collections.js";
import { todayStr, fmtDateNice } from "../utils/dates.js";
import { escapeHtml, initials, fmtMoney } from "../utils/format.js";

// Categorical colours validated with the dataviz skill's six-check palette
// validator (fixed hue order — never cycled). "Other" is deliberately a
// de-emphasis neutral, not a fourth validated hue, matching the "fold the
// tail into Other" guidance for a small fixed category set.
const CATEGORIES = [
  { key: 'Grocery', color: '#2a9d8f' },
  { key: 'Household', color: '#4361ee' },
  { key: 'Entertainment', color: '#d6336c' },
  { key: 'Other', color: '#9aa4b2' },
];

let spendCursor = new Date();
spendCursor.setDate(1);

function monthKeyOf(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : '';
}

function categoryTotals(items) {
  const totals = {};
  CATEGORIES.forEach(c => { totals[c.key] = 0; });
  items.forEach(e => {
    if (totals[e.category] === undefined) totals[e.category] = 0;
    totals[e.category] += Number(e.amount) || 0;
  });
  return totals;
}

// Shared bar-chart renderer — used for both the full Spending tab (any
// month, via spendCursor) and the compact read-only card on Overview
// (always the current month). One bar per category, direct-labelled at
// the tip; no legend needed since each bar already carries its own label.
function renderChartInto(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totals = categoryTotals(items);
  const max = Math.max(1, ...CATEGORIES.map(c => totals[c.key] || 0));
  el.innerHTML = CATEGORIES.map(c => {
    const amt = totals[c.key] || 0;
    const pct = Math.round((amt / max) * 100);
    return `
      <div class="spend-bar-row">
        <div class="spend-bar-label">${escapeHtml(c.key)}</div>
        <div class="spend-bar-track">
          <div class="spend-bar-fill" style="width:${pct}%; background:${c.color};"></div>
        </div>
        <div class="spend-bar-value">${fmtMoney(amt)}</div>
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

  renderChartInto('overviewSpendChart', items);
}

function renderSpendingTab() {
  const monthLabelEl = document.getElementById('spendMonthLabel');
  if (monthLabelEl) monthLabelEl.textContent = spendCursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const monthKey = spendCursor.getFullYear() + '-' + String(spendCursor.getMonth() + 1).padStart(2, '0');
  const items = state.expenses.filter(e => monthKeyOf(e.date) === monthKey);
  const total = items.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const totalEl = document.getElementById('spendMonthTotal');
  if (totalEl) totalEl.textContent = fmtMoney(total);

  renderChartInto('spendChart', items);

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
    li.innerHTML = `
      <div class="task-main">
        <div class="task-title">${escapeHtml(e.category)}${e.note ? ' — ' + escapeHtml(e.note) : ''}</div>
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
    const category = document.getElementById('expenseCategory').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value || todayStr();
    const memberId = document.getElementById('expenseMember').value;
    const note = document.getElementById('expenseNote').value.trim();
    if (!category || isNaN(amount)) return;
    addItem('expenses', { category, amount, date, memberId, note, createdAt: serverTimestamp() });
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDate').value = '';
    document.getElementById('expenseNote').value = '';
  });
}
