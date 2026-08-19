// Close Knit — app entry point. Wires up every feature module and re-renders
// the whole UI whenever the synced Firestore state changes.
import "./styles/main.css";

import { subscribe } from "./state/store.js";

import { initAuthUI } from "./features/authUI.js";
import { initTabs } from "./features/tabs.js";
import { initMembers, renderMembers } from "./features/members.js";
import { initTasks, renderTasks } from "./features/tasks.js";
import { initGrocery, renderGrocery } from "./features/grocery.js";
import { initShopping, renderShopping } from "./features/shopping.js";
import { initCalendar, renderCalendar } from "./features/calendar.js";
import { initFinance, renderFinance } from "./features/finance.js";
import { initHolidays, renderHolidays } from "./features/holidays.js";
import { initWishlist, renderWishlist } from "./features/wishlist.js";
import { renderOverview } from "./features/overview.js";
import { initImportExport } from "./features/importExport.js";

document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function renderAll() {
  renderMembers();
  renderTasks();
  renderGrocery();
  renderShopping();
  renderCalendar();
  renderFinance();
  renderHolidays();
  renderWishlist();
  renderOverview();
}

subscribe(renderAll);

initAuthUI();
initTabs();
initMembers();
initTasks();
initGrocery();
initShopping();
initCalendar();
initFinance();
initHolidays();
initWishlist();
initImportExport();
