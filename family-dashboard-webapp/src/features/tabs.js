import { renderOverview } from "./overview.js";
import { renderCalendar } from "./calendar.js";
import { renderTasks, setTaskStatusFilter, resetTaskStatusFilter } from "./tasks.js";

export function goToTab(view) {
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const btn = document.querySelector(`nav.tabs button[data-view="${view}"]`);
  if (btn) btn.classList.add('active');
  const viewEl = document.getElementById('view-' + view);
  if (viewEl) viewEl.classList.add('active');
  if (view === 'overview') renderOverview();
  if (view === 'calendar') renderCalendar();
  if (view === 'tasks') { resetTaskStatusFilter(); renderTasks(); }
}

function handleStatAction(action) {
  if (!action) return;
  const [type, target] = action.split(':');
  if (type === 'tab') {
    goToTab(target);
  } else if (type === 'tasks') {
    goToTab('tasks'); // resets the task status filter to 'all' via goToTab above
    setTaskStatusFilter(target); // 'overdue' | 'today'
    renderTasks();
  }
}

export function initTabs() {
  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => goToTab(btn.dataset.view));
  });

  document.getElementById('statGrid').addEventListener('click', e => {
    const tile = e.target.closest('.stat');
    if (tile) handleStatAction(tile.dataset.action);
  });
  document.getElementById('statGrid').addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tile = e.target.closest('.stat');
    if (!tile) return;
    e.preventDefault();
    handleStatAction(tile.dataset.action);
  });
}
