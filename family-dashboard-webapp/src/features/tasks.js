import { state, memberById } from "../state/store.js";
import { addItem, updateItem, deleteItem, serverTimestamp } from "../firebase/collections.js";
import { todayStr, fmtDateNice } from "../utils/dates.js";
import { escapeHtml, initials } from "../utils/format.js";

// 'all' | 'overdue' | 'today' — set when jumping in from an Overview stat tile.
let taskStatusFilter = 'all';
const TASK_STATUS_LABELS = { overdue: 'Overdue', today: 'Due today' };

export function setTaskStatusFilter(filter) {
  taskStatusFilter = filter;
}

export function resetTaskStatusFilter() {
  taskStatusFilter = 'all';
}

function dueBadge(due) {
  if (!due) return '';
  if (due < todayStr()) return '<span class="due-badge due-overdue">Overdue</span>';
  if (due === todayStr()) return '<span class="due-badge due-today">Due today</span>';
  return `<span class="due-badge due-upcoming">${fmtDateNice(due)}</span>`;
}

// Shared by the Tasks view and the Overview "due today & overdue" card.
export function renderTaskList(container, tasks, opts) {
  opts = opts || {};
  container.innerHTML = '';
  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty">Nothing here yet.</div>';
    return;
  }
  tasks.forEach(t => {
    const m = memberById(t.assignee);
    const li = document.createElement('li');
    li.className = 'task-item';
    li.innerHTML = `
      <input type="checkbox" ${t.done ? 'checked' : ''}>
      <div class="task-main">
        <div class="task-title ${t.done ? 'done' : ''}">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${m ? `<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>` : ''}
          ${!t.done ? dueBadge(t.due) : `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.78rem; color:var(--good); font-weight:600;">
              ✓ Done by
              <select class="completedBySelect" style="padding:1px 4px; font-size:0.78rem; border-radius:5px;">
                <option value="">someone</option>
                ${state.members.map(mem => `<option value="${mem.id}" ${t.completedBy === mem.id ? 'selected' : ''}>${escapeHtml(mem.name)}</option>`).join('')}
              </select>
            </span>
          `}
        </div>
        ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ''}
      </div>
      ${opts.removable !== false ? '<button class="btn small danger" title="Delete">✕</button>' : ''}
    `;
    li.querySelector('input[type=checkbox]').addEventListener('change', e => {
      const done = e.target.checked;
      const completedBy = done ? (t.completedBy || t.assignee || '') : '';
      updateItem('tasks', t.id, { done, completedBy });
    });
    const completedSelect = li.querySelector('.completedBySelect');
    if (completedSelect) {
      completedSelect.addEventListener('change', e => {
        updateItem('tasks', t.id, { completedBy: e.target.value });
      });
    }
    const delBtn = li.querySelector('button.danger');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        deleteItem('tasks', t.id);
      });
    }
    container.appendChild(li);
  });
}

function renderTaskStatusBanner() {
  const banner = document.getElementById('taskStatusBanner');
  if (!banner) return;
  if (taskStatusFilter === 'all') {
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  banner.style.display = 'flex';
  banner.innerHTML = `Showing: <strong>${TASK_STATUS_LABELS[taskStatusFilter] || taskStatusFilter}</strong> <button class="btn small" id="clearTaskStatusFilter">Show all</button>`;
  document.getElementById('clearTaskStatusFilter').addEventListener('click', () => {
    resetTaskStatusFilter();
    renderTasks();
  });
}

export function renderTasks() {
  const filter = document.getElementById('taskFilter').value || 'all';
  let list = [...state.tasks];
  if (filter !== 'all') list = list.filter(t => t.assignee === filter);
  if (taskStatusFilter === 'overdue') list = list.filter(t => !t.done && t.due && t.due < todayStr());
  else if (taskStatusFilter === 'today') list = list.filter(t => !t.done && t.due === todayStr());
  list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.due || '9999').localeCompare(b.due || '9999');
  });
  renderTaskList(document.getElementById('taskList'), list);
  renderTaskStatusBanner();
}

export function initTasks() {
  document.getElementById('taskFilter').addEventListener('change', renderTasks);

  document.getElementById('addTaskBtn').addEventListener('click', () => {
    const title = document.getElementById('taskTitle').value.trim();
    if (!title) return;
    const assignee = document.getElementById('taskAssignee').value;
    const due = document.getElementById('taskDue').value;
    const notes = document.getElementById('taskNotes').value.trim();
    addItem('tasks', { title, assignee, due, notes, done: false, completedBy: '', createdAt: serverTimestamp() });
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDue').value = '';
    document.getElementById('taskNotes').value = '';
  });
  document.getElementById('taskTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addTaskBtn').click();
  });
}
