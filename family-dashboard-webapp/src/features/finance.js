import { state } from "../state/store.js";
import { addItem, deleteItem, serverTimestamp } from "../supabase/collections.js";
import { fmtDateNice, todayStr } from "../utils/dates.js";
import { escapeHtml, initials, fmtMoney } from "../utils/format.js";

// Tracks whether the "Log a payment" form is currently editing an existing
// payment entry (holds its doc id) or logging a new one (null).
let editingPaymentId = null;

export function renderFinance() {
  const wrap = document.getElementById('financeWrap');
  wrap.innerHTML = '';
  if (state.members.length === 0) {
    wrap.innerHTML = '<div class="empty">Add a family member first, then track their balances here.</div>';
    return;
  }
  state.members.forEach(m => {
    const debts = state.debts.filter(d => d.memberId === m.id);
    const payments = [...state.payments.filter(p => p.memberId === m.id)].sort((a, b) => {
      const dc = (a.date || '').localeCompare(b.date || '');
      if (dc !== 0) return dc;
      const at = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : 0;
      const bt = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : 0;
      return at - bt;
    });
    if (debts.length === 0 && payments.length === 0) return; // nothing logged for this member yet

    const debtTotal = debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);
    const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const current = debtTotal - paidTotal;

    const card = document.createElement('div');
    card.className = 'fin-card';
    let html = `
      <div class="fin-card-head">
        <span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>
        <span class="fin-amt ${current > 0 ? 'fin-neg' : 'fin-pos'}" style="font-size:1rem;">${fmtMoney(current)} outstanding</span>
      </div>
    `;
    if (debts.length) {
      html += `<div class="fin-sub">Accounts</div>`;
      debts.forEach(d => {
        html += `
          <div class="fin-line">
            <div class="fin-line-main">
              <span class="fin-line-title">${escapeHtml(d.creditor)}</span>
              ${d.note ? `<span class="fin-line-note">${escapeHtml(d.note)}</span>` : ''}
            </div>
            <div class="fin-line-right">
              <span class="fin-amt">${fmtMoney(d.balance)}</span>
              <button class="btn small danger" data-action="delDebt" data-id="${d.id}">✕</button>
            </div>
          </div>
        `;
      });
      html += `<div class="fin-line fin-total-line"><span>Total balance</span><span class="fin-amt">${fmtMoney(debtTotal)}</span></div>`;
    }
    if (payments.length) {
      html += `<div class="fin-sub">Payment history</div>`;
      let running = debtTotal;
      payments.forEach(p => {
        running -= (Number(p.amount) || 0);
        html += `
          <div class="fin-line" ${p.id === editingPaymentId ? 'style="box-shadow:inset 0 0 0 2px var(--c-finance);"' : ''}>
            <div class="fin-line-main">
              <span class="fin-line-title">${fmtDateNice(p.date)}</span>
              <span class="fin-line-note">${escapeHtml(p.method || '')}${p.comment ? ` — ${escapeHtml(p.comment)}` : ''}</span>
            </div>
            <div class="fin-line-right">
              <span class="fin-amt fin-neg">-${fmtMoney(p.amount)}</span>
              <span class="fin-running">${fmtMoney(running)}</span>
              <button class="btn small" data-action="editPayment" data-id="${p.id}">✎</button>
              <button class="btn small danger" data-action="delPayment" data-id="${p.id}">✕</button>
            </div>
          </div>
        `;
      });
    }
    card.innerHTML = html;
    card.querySelectorAll('[data-action="delDebt"]').forEach(btn => {
      btn.addEventListener('click', () => deleteItem('debts', btn.dataset.id));
    });
    card.querySelectorAll('[data-action="delPayment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.id === editingPaymentId) cancelPaymentEdit();
        deleteItem('payments', btn.dataset.id);
      });
    });
    card.querySelectorAll('[data-action="editPayment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = state.payments.find(x => x.id === btn.dataset.id);
        if (p) startEditPayment(p);
      });
    });
    wrap.appendChild(card);
  });
  if (!wrap.children.length) {
    wrap.innerHTML = '<div class="empty">No balances logged yet — add one above.</div>';
  }
}

function startEditPayment(p) {
  editingPaymentId = p.id;
  document.getElementById('paymentMember').value = p.memberId || '';
  document.getElementById('paymentDate').value = p.date || '';
  document.getElementById('paymentAmount').value = (p.amount != null) ? p.amount : '';
  document.getElementById('paymentMethod').value = p.method || 'Bank Transfer';
  document.getElementById('paymentComment').value = p.comment || '';
  document.getElementById('addPaymentBtn').textContent = 'Save changes';
  document.getElementById('cancelPaymentEditBtn').style.display = '';
  document.getElementById('paymentMember').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderFinance();
}

function cancelPaymentEdit() {
  editingPaymentId = null;
  document.getElementById('paymentDate').value = '';
  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentComment').value = '';
  document.getElementById('addPaymentBtn').textContent = 'Log payment';
  document.getElementById('cancelPaymentEditBtn').style.display = 'none';
  renderFinance();
}

export function initFinance() {
  document.getElementById('cancelPaymentEditBtn').addEventListener('click', cancelPaymentEdit);

  document.getElementById('addDebtBtn').addEventListener('click', () => {
    const memberId = document.getElementById('debtMember').value;
    const creditor = document.getElementById('debtCreditor').value.trim();
    const balance = parseFloat(document.getElementById('debtBalance').value);
    const note = document.getElementById('debtNote').value.trim();
    if (!memberId || !creditor || isNaN(balance)) return;
    addItem('debts', { memberId, creditor, balance, note, createdAt: serverTimestamp() });
    document.getElementById('debtCreditor').value = '';
    document.getElementById('debtBalance').value = '';
    document.getElementById('debtNote').value = '';
  });

  document.getElementById('addPaymentBtn').addEventListener('click', () => {
    const memberId = document.getElementById('paymentMember').value;
    const date = document.getElementById('paymentDate').value || todayStr();
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const method = document.getElementById('paymentMethod').value;
    const comment = document.getElementById('paymentComment').value.trim();
    if (!memberId || isNaN(amount)) return;
    addItem('payments', { memberId, date, amount, method, comment, createdAt: serverTimestamp() });
    document.getElementById('paymentDate').value = '';
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentComment').value = '';
  });
}
