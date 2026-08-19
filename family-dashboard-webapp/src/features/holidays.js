import { state, memberById } from "../state/store.js";
import { addItem, updateItem, deleteItem, serverTimestamp } from "../firebase/collections.js";
import { fmtDateNiceYear, todayStr } from "../utils/dates.js";
import { escapeHtml, initials } from "../utils/format.js";

// Holiday "who's going" is a multi-select of member chips rather than a single dropdown —
// selection lives here (not in the DOM) so it survives the picker being rebuilt on every
// members-list change.
let holidaySelectedMembers = new Set();

// Tracks whether the "Plan a holiday" form is currently editing an existing
// entry (holds its doc id) or adding a new one (null).
let editingHolidayId = null;

// Also called from members.js's renderMemberSelects(), so the picker stays
// in sync whenever the family member list changes.
export function renderHolidayMemberPicker() {
  const wrap = document.getElementById('holidayMemberPicker');
  if (!wrap) return;
  // Drop any selected ids for members that no longer exist.
  holidaySelectedMembers.forEach(id => { if (!memberById(id)) holidaySelectedMembers.delete(id); });
  wrap.innerHTML = '';
  state.members.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-toggle' + (holidaySelectedMembers.has(m.id) ? ' active' : '');
    btn.style.borderColor = m.color;
    btn.style.background = holidaySelectedMembers.has(m.id) ? m.color : '#fff';
    btn.textContent = m.name;
    btn.addEventListener('click', () => {
      if (holidaySelectedMembers.has(m.id)) holidaySelectedMembers.delete(m.id);
      else holidaySelectedMembers.add(m.id);
      renderHolidayMemberPicker();
    });
    wrap.appendChild(btn);
  });
}

// A holiday's travellers: new docs store memberIds (array); tolerate the older
// single-memberId shape from before multi-select was added.
function holidayMemberIds(h) {
  if (Array.isArray(h.memberIds)) return h.memberIds;
  if (h.memberId) return [h.memberId];
  return [];
}

// Older holiday docs (created before the status field existed) have no
// `status` at all — treat those as "Planning" everywhere.
function holidayStatusClass(status) {
  switch (status) {
    case 'Confirmed': return 'status-confirmed';
    case 'Booked': return 'status-booked';
    case 'Pending Payment': return 'status-pendingpayment';
    default: return 'status-planning';
  }
}

export function renderHolidays() {
  const list = document.getElementById('holidayList');
  list.innerHTML = '';
  if (state.holidays.length === 0) {
    list.innerHTML = '<div class="empty">No holidays planned yet — add one above.</div>';
    return;
  }
  const todayISO = todayStr();
  // Always re-sorted by start date on every render, so a holiday added out of
  // order (or edited to a new date) immediately jumps to its correct place.
  const sorted = [...state.holidays].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  sorted.forEach(h => {
    const travellers = holidayMemberIds(h).map(memberById).filter(Boolean);
    const endISO = (h.endDate && h.endDate > h.startDate) ? h.endDate : h.startDate;
    const isPast = endISO < todayISO;
    const dateLabel = endISO !== h.startDate ? `${fmtDateNiceYear(h.startDate)} – ${fmtDateNiceYear(endISO)}` : fmtDateNiceYear(h.startDate);
    const travellerChips = travellers.length
      ? travellers.map(m => `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>`).join('')
      : '<span class="chip" style="--mc:#7d8597;">Whole family</span>';
    const li = document.createElement('li');
    li.className = 'task-item';
    li.style.alignItems = 'center';
    if (isPast) li.style.opacity = '0.55';
    if (h.id === editingHolidayId) li.style.boxShadow = 'inset 0 0 0 2px var(--c-holiday)';
    li.innerHTML = `
      <div class="task-main" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="task-title">${escapeHtml(h.destination)}</span>
        <span class="status-badge ${holidayStatusClass(h.status)}">${escapeHtml(h.status || 'Planning')}</span>
        <span class="due-badge due-upcoming">${dateLabel}</span>
        ${h.airline ? `<span class="airline-badge">✈️ ${escapeHtml(h.airline)}</span>` : ''}
        ${h.bookingRef ? `<span class="ref-badge">Ref: ${escapeHtml(h.bookingRef)}</span>` : ''}
        ${travellerChips}
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn small" data-action="edit" data-id="${h.id}">✎ Edit</button>
        <button class="btn small danger" data-action="delete" data-id="${h.id}">✕</button>
      </div>
    `;
    li.querySelector('[data-action="edit"]').addEventListener('click', () => {
      startEditHoliday(h);
    });
    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (h.id === editingHolidayId) cancelHolidayEdit();
      deleteItem('holidays', h.id);
    });
    list.appendChild(li);
  });
}

function startEditHoliday(h) {
  editingHolidayId = h.id;
  document.getElementById('holidayStart').value = h.startDate || '';
  document.getElementById('holidayEnd').value = (h.endDate && h.endDate !== h.startDate) ? h.endDate : '';
  document.getElementById('holidayDestination').value = h.destination || '';
  document.getElementById('holidayAirline').value = h.airline || '';
  document.getElementById('holidayBookingRef').value = h.bookingRef || '';
  document.getElementById('holidayStatus').value = h.status || 'Planning';
  holidaySelectedMembers = new Set(holidayMemberIds(h));
  renderHolidayMemberPicker();
  document.getElementById('addHolidayBtn').textContent = 'Save changes';
  document.getElementById('cancelHolidayEditBtn').style.display = '';
  document.getElementById('holidayDestination').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderHolidays();
}

function cancelHolidayEdit() {
  editingHolidayId = null;
  document.getElementById('holidayStart').value = '';
  document.getElementById('holidayEnd').value = '';
  document.getElementById('holidayDestination').value = '';
  document.getElementById('holidayAirline').value = '';
  document.getElementById('holidayBookingRef').value = '';
  document.getElementById('holidayStatus').value = 'Planning';
  holidaySelectedMembers = new Set();
  renderHolidayMemberPicker();
  document.getElementById('addHolidayBtn').textContent = 'Add holiday';
  document.getElementById('cancelHolidayEditBtn').style.display = 'none';
  renderHolidays();
}

export function initHolidays() {
  document.getElementById('cancelHolidayEditBtn').addEventListener('click', cancelHolidayEdit);

  document.getElementById('addHolidayBtn').addEventListener('click', () => {
    const startDate = document.getElementById('holidayStart').value;
    const endDateRaw = document.getElementById('holidayEnd').value;
    const destination = document.getElementById('holidayDestination').value.trim();
    const airline = document.getElementById('holidayAirline').value.trim();
    const bookingRef = document.getElementById('holidayBookingRef').value.trim();
    const status = document.getElementById('holidayStatus').value;
    const memberIds = Array.from(holidaySelectedMembers);
    if (!startDate || !destination) return;
    const endDate = (endDateRaw && endDateRaw >= startDate) ? endDateRaw : startDate;
    if (editingHolidayId) {
      updateItem('holidays', editingHolidayId, { startDate, endDate, destination, airline, bookingRef, status, memberIds });
      cancelHolidayEdit();
      return;
    }
    addItem('holidays', { startDate, endDate, destination, airline, bookingRef, status, memberIds, createdAt: serverTimestamp() });
    document.getElementById('holidayStart').value = '';
    document.getElementById('holidayEnd').value = '';
    document.getElementById('holidayDestination').value = '';
    document.getElementById('holidayAirline').value = '';
    document.getElementById('holidayBookingRef').value = '';
    document.getElementById('holidayStatus').value = 'Planning';
    holidaySelectedMembers = new Set();
    renderHolidayMemberPicker();
  });
}
