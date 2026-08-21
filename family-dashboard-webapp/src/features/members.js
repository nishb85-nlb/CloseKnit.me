import { state } from "../state/store.js";
import { addItem, updateItem, deleteItem } from "../supabase/collections.js";
import { escapeHtml, initials } from "../utils/format.js";
import { PALETTE } from "../config/env.js";
import { renderHolidayMemberPicker } from "./holidays.js";

const MEMBER_SELECT_IDS = ['taskAssignee', 'eventMember', 'shoppingAssignee', 'debtMember', 'paymentMember', 'wishMember', 'expenseMember'];

function renderMemberSelects() {
  MEMBER_SELECT_IDS.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = (sel.id === 'eventMember') ? '<option value="">Whole family</option>'
      : (sel.id === 'shoppingAssignee') ? '<option value="">Anyone</option>'
      : (sel.id === 'expenseMember') ? '<option value="">Shared</option>' : '';
    state.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      sel.appendChild(opt);
    });
    if (cur) sel.value = cur;
  });
  renderHolidayMemberPicker();

  const filter = document.getElementById('taskFilter');
  const curF = filter.value;
  filter.innerHTML = '<option value="all">Everyone</option>';
  state.members.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.name;
    filter.appendChild(opt);
  });
  if (curF) filter.value = curF;
}

export function renderMembers() {
  const wrap = document.getElementById('memberListWrap');
  wrap.innerHTML = '';
  if (state.members.length === 0) {
    wrap.innerHTML = '<div class="empty">No family members yet — add one above.</div>';
  }
  state.members.forEach(m => {
    const row = document.createElement('div');
    row.className = 'member-row';
    const openTasks = state.tasks.filter(t => t.assignee === m.id && !t.done).length;
    row.innerHTML = `
      <div class="member-left">
        <div class="avatar" style="background:${m.color}">${initials(m.name)}</div>
        <div>
          <div style="font-weight:600;">${escapeHtml(m.name)}</div>
          <div style="font-size:0.78rem; color:var(--ink-soft);">${openTasks} open task${openTasks === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div class="member-right">
        <input type="color" class="member-color-input" value="${m.color}" data-id="${m.id}" title="Change ${escapeHtml(m.name)}'s colour">
        <button class="btn small danger" data-id="${m.id}">Remove</button>
      </div>
    `;
    row.querySelector('.member-color-input').addEventListener('change', (e) => {
      updateItem('members', m.id, { color: e.target.value });
    });
    row.querySelector('button.danger').addEventListener('click', () => {
      deleteItem('members', m.id);
    });
    wrap.appendChild(row);
  });
  renderMemberSelects();
}

export function initMembers() {
  document.getElementById('addMemberBtn').addEventListener('click', () => {
    const input = document.getElementById('memberName');
    const name = input.value.trim();
    if (!name) return;
    const color = PALETTE[state.members.length % PALETTE.length];
    addItem('members', { name, color });
    input.value = '';
  });
}
