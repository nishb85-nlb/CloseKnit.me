import { state, memberById } from "../state/store.js";
import { addItem, deleteItem } from "../supabase/collections.js";
import { todayStr, fmtDateNice, isoDate } from "../utils/dates.js";
import { escapeHtml } from "../utils/format.js";

const REPEAT_LABELS = { daily: 'Repeats daily', weekly: 'Repeats weekly', fortnightly: 'Repeats fortnightly', monthly: 'Repeats monthly', yearly: 'Repeats yearly' };
const CAL_TARGETS = [
  { gridId: 'calGrid', labelId: 'monthLabel' },
  { gridId: 'calGridOv', labelId: 'monthLabelOv' }
];

let calCursor = new Date();
calCursor.setDate(1);
let selectedCalDate = null;

// Expands a (possibly recurring, possibly multi-day) event into its occurrences that fall within [rangeStartISO, rangeEndISO].
function expandEvent(ev, rangeStartISO, rangeEndISO) {
  if (!ev.repeat || ev.repeat === 'none') {
    const endISO = (ev.endDate && ev.endDate > ev.date) ? ev.endDate : ev.date;
    if (endISO < rangeStartISO || ev.date > rangeEndISO) return [];
    const isSpan = endISO !== ev.date;
    if (!isSpan) {
      return (ev.date >= rangeStartISO && ev.date <= rangeEndISO) ? [{ ...ev, occDate: ev.date, isSpan: false }] : [];
    }
    const out = [];
    let cur = new Date(ev.date + 'T00:00:00');
    const last = new Date(endISO + 'T00:00:00');
    const rangeStart = new Date(rangeStartISO + 'T00:00:00');
    const rangeEnd = new Date(rangeEndISO + 'T00:00:00');
    let safety = 0;
    while (cur <= last && safety < 400) {
      if (cur >= rangeStart && cur <= rangeEnd) {
        const occISO = isoDate(cur);
        out.push({ ...ev, occDate: occISO, isSpan: true, isSpanStart: occISO === ev.date, isSpanEnd: occISO === endISO });
      }
      cur.setDate(cur.getDate() + 1);
      safety++;
    }
    return out;
  }
  const out = [];
  let cur = new Date(ev.date + 'T00:00:00');
  const rangeStart = new Date(rangeStartISO + 'T00:00:00');
  const rangeEnd = new Date(rangeEndISO + 'T00:00:00');
  const until = ev.repeatUntil ? new Date(ev.repeatUntil + 'T00:00:00') : null;
  const hardCap = new Date(cur); hardCap.setFullYear(hardCap.getFullYear() + 2);
  let safety = 0;
  while (cur <= rangeEnd && cur <= hardCap && safety < 1500) {
    if (until && cur > until) break;
    if (cur >= rangeStart) out.push({ ...ev, occDate: isoDate(cur) });
    const n = new Date(cur);
    if (ev.repeat === 'daily') n.setDate(n.getDate() + 1);
    else if (ev.repeat === 'weekly') n.setDate(n.getDate() + 7);
    else if (ev.repeat === 'fortnightly') n.setDate(n.getDate() + 14);
    else if (ev.repeat === 'monthly') n.setMonth(n.getMonth() + 1);
    else if (ev.repeat === 'yearly') n.setFullYear(n.getFullYear() + 1);
    else break;
    cur = n;
    safety++;
  }
  return out;
}

// Exported for overview.js's "next 7 days" list — it works from raw state.events
// directly rather than needing expansion, but shares the module for cohesion.
export function expandEventsInRange(rangeStartISO, rangeEndISO) {
  return state.events.flatMap(ev => expandEvent(ev, rangeStartISO, rangeEndISO));
}

function renderCalendarInto(gridId, labelId) {
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  const labelEl = document.getElementById(labelId);
  if (labelEl) labelEl.textContent = calCursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstOfMonth = new Date(year, month, 1);
  let startOffset = firstOfMonth.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const gridStart = new Date(year, month, 1 - startOffset);
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate() + 41);
  const expanded = expandEventsInRange(isoDate(gridStart), isoDate(gridEnd));

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const iso = isoDate(cellDate);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (cellDate.getMonth() !== month) cell.classList.add('other-month');
    if (iso === todayStr()) cell.classList.add('today');
    const dayEvents = expanded.filter(e => e.occDate === iso).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    cell.innerHTML = `<div class="daynum">${cellDate.getDate()}</div>` +
      dayEvents.map(e => {
        const m = memberById(e.memberId);
        const bg = m ? m.color : '#7d8597';
        const rpt = (e.repeat && e.repeat !== 'none') ? '↻ ' : '';
        let spanClass = '', spanIcon = '', label;
        if (e.isSpan) {
          spanClass = e.isSpanStart ? '' : (e.isSpanEnd ? ' cal-span-end' : ' cal-span-mid');
          spanIcon = e.isSpanStart ? '▶ ' : (e.isSpanEnd ? '◀ ' : '─ ');
          label = e.isSpanStart ? `${e.time ? e.time + ' ' : ''}${escapeHtml(e.title)}` : escapeHtml(e.title);
        } else {
          label = `${e.time ? e.time + ' ' : ''}${escapeHtml(e.title)}`;
        }
        const titleAttr = escapeHtml(e.title) + (e.repeat && e.repeat !== 'none' ? ' (' + REPEAT_LABELS[e.repeat] + ')' : '') + (e.isSpan ? ` (${fmtDateNice(e.date)} – ${fmtDateNice(e.endDate)})` : '');
        return `<div class="cal-event${spanClass}" style="background:${bg}" title="${titleAttr}">${rpt}${spanIcon}${label}</div>`;
      }).join('');
    cell.addEventListener('click', () => openEventDialog(iso));
    grid.appendChild(cell);
  }
}

export function renderCalendar() {
  CAL_TARGETS.forEach(t => renderCalendarInto(t.gridId, t.labelId));
}

function goPrevMonth() { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); }
function goNextMonth() { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); }

function openEventDialog(iso) {
  selectedCalDate = iso;
  document.getElementById('eventDialogDate').textContent = fmtDateNice(iso);
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventTime').value = '';
  document.getElementById('eventMember').value = '';
  document.getElementById('eventEndDate').value = '';
  document.getElementById('eventRepeat').value = 'none';
  document.getElementById('eventRepeatUntil').value = '';
  document.getElementById('eventRepeatUntilWrap').style.display = 'none';
  renderExistingEvents();
  document.getElementById('eventDialog').showModal();
}

function renderExistingEvents() {
  const wrap = document.getElementById('existingEvents');
  const evs = expandEventsInRange(selectedCalDate, selectedCalDate);
  if (evs.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div class="field"><label>Existing events</label></div>' +
    evs.map(e => {
      const m = memberById(e.memberId);
      const isRecurring = e.repeat && e.repeat !== 'none';
      const isSpan = e.endDate && e.endDate > e.date;
      const spanNote = isSpan ? ` (${fmtDateNice(e.date)} – ${fmtDateNice(e.endDate)})` : '';
      return `<div class="row" style="justify-content:space-between; padding:4px 0;">
        <span class="chip" style="--mc:${m ? m.color : '#7d8597'}">${isRecurring ? '↻ ' : ''}${e.time ? e.time + ' · ' : ''}${escapeHtml(e.title)}${spanNote}</span>
        <button class="btn small danger" data-id="${e.id}" data-recurring="${isRecurring ? '1' : '0'}">✕</button>
      </div>`;
    }).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.recurring === '1' && !confirm('This event repeats. Delete the whole series?')) return;
      deleteItem('events', btn.dataset.id);
    });
  });
}

export function initCalendar() {
  document.getElementById('closeEventDialog').addEventListener('click', () => document.getElementById('eventDialog').close());
  document.getElementById('closeEventDialog2').addEventListener('click', () => document.getElementById('eventDialog').close());

  document.getElementById('eventRepeat').addEventListener('change', e => {
    document.getElementById('eventRepeatUntilWrap').style.display = e.target.value === 'none' ? 'none' : 'flex';
  });

  document.getElementById('prevMonth').addEventListener('click', goPrevMonth);
  document.getElementById('nextMonth').addEventListener('click', goNextMonth);
  document.getElementById('prevMonthOv').addEventListener('click', goPrevMonth);
  document.getElementById('nextMonthOv').addEventListener('click', goNextMonth);

  document.getElementById('saveEventBtn').addEventListener('click', () => {
    const title = document.getElementById('eventTitle').value.trim();
    if (!title) return;
    const time = document.getElementById('eventTime').value;
    const memberId = document.getElementById('eventMember').value;
    const repeat = document.getElementById('eventRepeat').value;
    const repeatUntil = repeat === 'none' ? '' : document.getElementById('eventRepeatUntil').value;
    const rawEndDate = document.getElementById('eventEndDate').value;
    const endDate = (repeat === 'none' && rawEndDate && rawEndDate > selectedCalDate) ? rawEndDate : '';
    addItem('events', { date: selectedCalDate, endDate, title, time, memberId, repeat, repeatUntil });
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventTime').value = '';
    document.getElementById('eventEndDate').value = '';
    document.getElementById('eventRepeat').value = 'none';
    document.getElementById('eventRepeatUntil').value = '';
    document.getElementById('eventRepeatUntilWrap').style.display = 'none';
  });
}
