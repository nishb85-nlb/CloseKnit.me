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

  // On mobile, sections behind the "More" sheet don't get their own bottom-bar
  // slot — light up the More button instead so something is always highlighted.
  const moreBtn = document.getElementById('navMoreBtn');
  if (moreBtn) moreBtn.classList.toggle('active', !!(btn && btn.classList.contains('tab-secondary')));

  if (view === 'overview') renderOverview();
  if (view === 'calendar') renderCalendar();
  if (view === 'tasks') { resetTaskStatusFilter(); renderTasks(); }
}

// Populates the "More" sheet from the nav's own tab-secondary buttons, so
// there's one source of truth for which sections exist and their labels.
function initMoreSheet() {
  const moreBtn = document.getElementById('navMoreBtn');
  const dialog = document.getElementById('moreNavDialog');
  const list = document.getElementById('moreNavList');
  const closeBtn = document.getElementById('closeMoreNavDialog');
  if (!moreBtn || !dialog || !list || !closeBtn) return;

  document.querySelectorAll('nav.tabs button.tab-secondary').forEach(srcBtn => {
    const view = srcBtn.dataset.view;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'more-nav-item';
    item.innerHTML = srcBtn.innerHTML;
    item.addEventListener('click', () => {
      dialog.close();
      goToTab(view);
    });
    list.appendChild(item);
  });

  moreBtn.addEventListener('click', () => dialog.showModal());
  closeBtn.addEventListener('click', () => dialog.close());
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
  document.querySelectorAll('nav.tabs button:not(.tab-more)').forEach(btn => {
    btn.addEventListener('click', () => goToTab(btn.dataset.view));
  });
  initMoreSheet();

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
