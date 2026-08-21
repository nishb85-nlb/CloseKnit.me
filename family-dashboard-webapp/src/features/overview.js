import { state, memberById } from "../state/store.js";
import { todayStr, fmtDateNice } from "../utils/dates.js";
import { escapeHtml, initials } from "../utils/format.js";
import { renderTaskList } from "./tasks.js";

export function renderOverview() {
  const openTasks = state.tasks.filter(t => !t.done);
  const overdue = openTasks.filter(t => t.due && t.due < todayStr());
  const dueToday = openTasks.filter(t => t.due === todayStr());
  const groceryOpen = state.grocery.filter(g => !g.done);
  const shoppingOpen = state.shopping.filter(s => !s.done);
  const upcoming7 = (() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    return state.events.filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      const endISO = (e.endDate && e.endDate > e.date) ? e.endDate : e.date;
      const endD = new Date(endISO + 'T00:00:00');
      return endD >= start && d <= end;
    }).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  })();
  const nextHoliday = (() => {
    const todayISO = todayStr();
    const upcoming = state.holidays.filter(h => {
      const endISO = (h.endDate && h.endDate > h.startDate) ? h.endDate : h.startDate;
      return endISO >= todayISO;
    }).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
    return upcoming[0] || null;
  })();
  let holidayNum = '', holidayIsAway = false;
  if (nextHoliday) {
    const todayISO = todayStr();
    if (nextHoliday.startDate <= todayISO) {
      holidayNum = 'Away'; holidayIsAway = true;
    } else {
      const days = Math.round((new Date(nextHoliday.startDate + 'T00:00:00') - new Date(todayISO + 'T00:00:00')) / 86400000);
      holidayNum = days + (days === 1 ? ' day' : ' days');
    }
  }

  const statGrid = document.getElementById('statGrid');
  statGrid.innerHTML = `
    <div class="stat stat-tasks" data-action="tab:tasks" tabindex="0" role="button" aria-label="Go to open tasks"><div class="stat-top"><span class="icon">📋</span><span class="num">${openTasks.length}</span></div><div class="label">Open tasks</div></div>
    <div class="stat stat-overdue" data-action="tasks:overdue" tabindex="0" role="button" aria-label="Go to overdue tasks"><div class="stat-top"><span class="icon">⚠️</span><span class="num" style="color:${overdue.length ? 'var(--bad)' : 'inherit'}">${overdue.length}</span></div><div class="label">Overdue</div></div>
    <div class="stat stat-today" data-action="tasks:today" tabindex="0" role="button" aria-label="Go to tasks due today"><div class="stat-top"><span class="icon">⏰</span><span class="num" style="color:${dueToday.length ? 'var(--warn)' : 'inherit'}">${dueToday.length}</span></div><div class="label">Due today</div></div>
    <div class="stat stat-grocery" data-action="tab:grocery" tabindex="0" role="button" aria-label="Go to grocery list"><div class="stat-top"><span class="icon">🛒</span><span class="num">${groceryOpen.length}</span></div><div class="label">Grocery left</div></div>
    <div class="stat stat-shopping" data-action="tab:shopping" tabindex="0" role="button" aria-label="Go to shopping list"><div class="stat-top"><span class="icon">🛍️</span><span class="num">${shoppingOpen.length}</span></div><div class="label">Shopping left</div></div>
    <div class="stat stat-members" data-action="tab:members" tabindex="0" role="button" aria-label="Go to family members"><div class="stat-top"><span class="icon">👪</span><span class="num">${state.members.length}</span></div><div class="label">Family members</div></div>
    ${nextHoliday ? `<div class="stat stat-holiday" data-action="tab:holiday" tabindex="0" role="button" aria-label="Go to holidays"><div class="stat-top"><span class="icon">✈️</span><span class="num" style="font-size:${holidayIsAway ? '1.05rem' : '1.2rem'};">${holidayNum}</span></div><div class="label">${escapeHtml(nextHoliday.destination)}</div></div>` : ''}
  `;

  renderTaskList(document.getElementById('overviewTaskList'), [...overdue, ...dueToday], { removable: false });

  const evList = document.getElementById('overviewEventList');
  evList.innerHTML = '';
  if (upcoming7.length === 0) {
    evList.innerHTML = '<div class="empty">No events in the next 7 days.</div>';
  } else {
    upcoming7.forEach(e => {
      const m = memberById(e.memberId);
      const li = document.createElement('li');
      li.className = 'task-item';
      const isSpan = e.endDate && e.endDate > e.date;
      const dateLabel = isSpan ? `${fmtDateNice(e.date)} – ${fmtDateNice(e.endDate)}` : `${fmtDateNice(e.date)}${e.time ? ' · ' + e.time : ''}`;
      li.innerHTML = `
        <div class="task-main">
          <div class="task-title">${escapeHtml(e.title)}</div>
          <div class="task-meta">
            <span class="due-badge due-upcoming">${dateLabel}</span>
            ${m ? `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>` : ''}
          </div>
        </div>
      `;
      evList.appendChild(li);
    });
  }
}
