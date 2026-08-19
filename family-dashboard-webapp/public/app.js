// Close Knit — Firebase-backed app logic.
// Auth: Google Sign-In, restricted to window.ALLOWED_EMAILS (see firebase-config.js).
// Data: Firestore, collections under families/main/*, kept in sync live via onSnapshot.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot,
  getDocs, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseApp = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();
const ALLOWED_EMAILS = window.ALLOWED_EMAILS || [];

// Finance tab (debts/payments) is restricted to these two — must match firestore.rules' isFinanceMember().
const FINANCE_EMAILS = ['nishb85@gmail.com', 'sannish16@gmail.com'];
let canSeeFinance = false;

const FAMILY_PATH = "families/main";
const col = (name) => collection(db, FAMILY_PATH, name);

const PALETTE = ["#3a6ea5","#e07a5f","#2a9d8f","#9c6644","#6a4c93","#e0b000","#2b9348","#c9184a"];

let state = { members: [], tasks: [], events: [], grocery: [], shopping: [], debts: [], payments: [], holidays: [], wishlist: [] };
let unsubscribers = [];
let seedChecked = false;

let calCursor = new Date();
calCursor.setDate(1);
let selectedCalDate = null;

let taskStatusFilter = 'all'; // 'all' | 'overdue' | 'today' — set when jumping in from an Overview stat tile

// ---------- Small helpers ----------
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtDateNice(iso){
  if(!iso) return '';
  const d = new Date(iso+'T00:00:00');
  return d.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'});
}
function fmtDateNiceYear(iso){
  if(!iso) return '';
  const d = new Date(iso+'T00:00:00');
  return fmtDateNice(iso) + ' ' + d.getFullYear();
}
function memberById(id){ return state.members.find(m=>m.id===id); }
function initials(name){
  return name.trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

// ---------- Auth ----------
const authOverlay = document.getElementById('authOverlay');
const appRoot = document.getElementById('appRoot');
const authError = document.getElementById('authError');

document.getElementById('googleSignInBtn').addEventListener('click', async ()=>{
  authError.classList.remove('show');
  try{
    await signInWithPopup(auth, provider);
  }catch(err){
    authError.textContent = 'Sign-in failed: ' + err.message;
    authError.classList.add('show');
  }
});

document.getElementById('emailToggleBtn').addEventListener('click', ()=>{
  document.getElementById('emailSignInForm').classList.toggle('show');
});

document.getElementById('emailSignInForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  authError.classList.remove('show');
  const email = document.getElementById('signInEmail').value.trim();
  const password = document.getElementById('signInPassword').value;
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(err){
    authError.textContent = 'Sign-in failed: ' + err.message;
    authError.classList.add('show');
  }
});

document.getElementById('signOutBtn').addEventListener('click', ()=>{
  signOut(auth);
});

onAuthStateChanged(auth, async (user)=>{
  if(user && ALLOWED_EMAILS.length && !ALLOWED_EMAILS.includes(user.email)){
    authError.textContent = `${user.email} isn't on the family list for this dashboard. Ask whoever set this up to add you.`;
    authError.classList.add('show');
    await signOut(auth);
    return;
  }
  if(user){
    authOverlay.style.display = 'none';
    appRoot.style.display = 'block';
    document.getElementById('userPhoto').src = user.photoURL || '';
    document.getElementById('userName').textContent = user.displayName || user.email;
    canSeeFinance = FINANCE_EMAILS.includes(user.email);
    const financeTabBtn = document.querySelector('nav.tabs button[data-view="finance"]');
    if(financeTabBtn) financeTabBtn.style.display = canSeeFinance ? '' : 'none';
    if(!canSeeFinance){
      // In case it was left open from a previous (finance-enabled) session on a shared device.
      const financeView = document.getElementById('view-finance');
      if(financeView && financeView.classList.contains('active')) goToTab('overview');
    }
    startSync();
  } else {
    authOverlay.style.display = 'flex';
    appRoot.style.display = 'none';
    stopSync();
    canSeeFinance = false;
    state = { members: [], tasks: [], events: [], grocery: [], shopping: [], debts: [], payments: [], holidays: [], wishlist: [] };
  }
});

// ---------- Firestore sync ----------
function watch(name, stateKey){
  const unsub = onSnapshot(col(name), (snap)=>{
    state[stateKey] = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderAll();
  }, (err)=>{
    console.error('Sync error on', name, err);
  });
  unsubscribers.push(unsub);
}

async function startSync(){
  stopSync();
  watch('members', 'members');
  watch('tasks', 'tasks');
  watch('events', 'events');
  watch('grocery', 'grocery');
  watch('shopping', 'shopping');
  watch('holidays', 'holidays');
  watch('wishlist', 'wishlist');
  if(canSeeFinance){
    watch('debts', 'debts');
    watch('payments', 'payments');
  } else {
    state.debts = [];
    state.payments = [];
  }
  if(!seedChecked){
    seedChecked = true;
    seedIfEmpty();
  }
}
function stopSync(){
  unsubscribers.forEach(u=>u());
  unsubscribers = [];
}

// One-off seed of starter members + the Google Calendar snapshot imported on 2026-08-14,
// so the first person to sign in gets the same starting point the standalone version had.
async function seedIfEmpty(){
  try{
    const existing = await getDocs(col('members'));
    if(!existing.empty) return;

    const batch = writeBatch(db);
    const starters = [
      {name:"Nish", color:PALETTE[0]},
      {name:"Sangi", color:PALETTE[1]},
      {name:"Hazel", color:PALETTE[2]},
      {name:"Rolo", color:PALETTE[3]}
    ];
    const memberRefs = {};
    starters.forEach(m=>{
      const ref = doc(col('members'));
      batch.set(ref, m);
      memberRefs[m.name] = ref.id;
    });

    const importedEvents = [
      {date:'2026-08-01', time:'17:00', title:'Charlotte/Toby', memberId:''},
      {date:'2026-08-03', time:'11:15', title:'Peel 11.15 to 12.15', memberId:''},
      {date:'2026-08-03', time:'16:45', title:'Rolo health check', memberId: memberRefs.Rolo},
      {date:'2026-08-04', time:'13:00', title:'Movie - Hazel & Torpey', memberId: memberRefs.Hazel},
      {date:'2026-08-06', time:'08:00', title:'Adit bday', memberId:''},
      {date:'2026-08-11', time:'16:00', title:'Kedi painting', memberId:''},
      {date:'2026-08-12', time:'18:00', title:'Dinner', memberId:''},
      {date:'2026-08-13', time:'08:00', title:"Sangi going into fortnums", memberId: memberRefs.Sangi},
      {date:'2026-08-14', time:'17:00', title:'Movie with Cristina', memberId:''},
      {date:'2026-08-15', time:'08:00', title:'Beach day', memberId:''},
      {date:'2026-08-18', time:'09:00', title:'Krish & Darien wedding day', memberId:''},
      {date:'2026-08-22', time:'', title:'Twikemham', memberId:''},
      {date:'2026-08-23', time:'20:45', title:'Sangi & Hazel - India', memberId:''},
      {date:'2026-08-25', time:'11:00', title:'Rolo Tablet', memberId: memberRefs.Rolo},
      {date:'2026-08-28', time:'', title:'Berlin - Tough Mudder (multi-day, starts)', memberId:''},
      {date:'2026-08-28', time:'09:30', title:'Rolo Trim', memberId: memberRefs.Rolo},
      {date:'2026-09-01', time:'16:30', title:'Rolo Vaccination', memberId: memberRefs.Rolo},
      {date:'2026-09-05', time:'08:00', title:'Rolo - Bi yearly tablet (tapeworm)', memberId: memberRefs.Rolo},
      {date:'2026-09-05', time:'21:00', title:'De worming - Rolo', memberId: memberRefs.Rolo},
      {date:'2026-09-06', time:'12:30', title:"BBQ @ John & Shobana's", memberId:''},
      {date:'2026-09-07', time:'', title:'1st Day SWPS', memberId:''},
      {date:'2026-09-13', time:'', title:'Sangi Thames Walk', memberId: memberRefs.Sangi},
      {date:'2026-09-20', time:'09:00', title:'Jon & Shobana Windsor', memberId:''},
      {date:'2026-09-25', time:'08:00', title:"National Daughter's Day", memberId:''},
      {date:'2026-09-25', time:'11:00', title:'Rolo Tablet', memberId: memberRefs.Rolo},
      {date:'2026-10-05', time:'21:00', title:'De worming - Rolo', memberId: memberRefs.Rolo},
      {date:'2026-10-09', time:'09:30', title:'Rolo Trim', memberId: memberRefs.Rolo},
      {date:'2026-10-19', time:'', title:'SWPS Half Term (multi-day, starts)', memberId:''},
      {date:'2026-10-23', time:'', title:'Sangeetha 40th', memberId: memberRefs.Sangi},
      {date:'2026-10-25', time:'11:00', title:'Rolo Tablet', memberId: memberRefs.Rolo},
      {date:'2026-11-05', time:'21:00', title:'De worming - Rolo', memberId: memberRefs.Rolo},
      {date:'2026-11-08', time:'20:45', title:'Sangi & Hazel - India', memberId:''}
    ];
    importedEvents.forEach(ev=>{
      const ref = doc(col('events'));
      batch.set(ref, ev);
    });

    await batch.commit();
  }catch(err){
    console.error('Seed failed', err);
  }
}

// ---------- Tabs ----------
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-'+btn.dataset.view).classList.add('active');
    if(btn.dataset.view==='overview') renderOverview();
    if(btn.dataset.view==='calendar') renderCalendar();
    if(btn.dataset.view==='tasks'){ taskStatusFilter = 'all'; renderTasks(); }
  });
});

// ---------- Overview stat tiles: click-through navigation ----------
function goToTab(view){
  const btn = document.querySelector(`nav.tabs button[data-view="${view}"]`);
  if(btn) btn.click();
}
function handleStatAction(action){
  if(!action) return;
  const [type, target] = action.split(':');
  if(type==='tab'){
    goToTab(target);
  } else if(type==='tasks'){
    goToTab('tasks'); // resets taskStatusFilter to 'all' via the nav listener above
    taskStatusFilter = target; // 'overdue' | 'today'
    renderTasks();
  }
}
document.getElementById('statGrid').addEventListener('click', e=>{
  const tile = e.target.closest('.stat');
  if(tile) handleStatAction(tile.dataset.action);
});
document.getElementById('statGrid').addEventListener('keydown', e=>{
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const tile = e.target.closest('.stat');
  if(!tile) return;
  e.preventDefault();
  handleStatAction(tile.dataset.action);
});

// ---------- Members ----------
function renderMemberSelects(){
  const selects = [document.getElementById('taskAssignee'), document.getElementById('eventMember'), document.getElementById('shoppingAssignee'), document.getElementById('debtMember'), document.getElementById('paymentMember'), document.getElementById('wishMember')];
  selects.forEach(sel=>{
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = (sel.id==='eventMember') ? '<option value="">Whole family</option>'
      : (sel.id==='shoppingAssignee') ? '<option value="">Anyone</option>' : '';
    state.members.forEach(m=>{
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name;
      sel.appendChild(opt);
    });
    if(cur) sel.value = cur;
  });
  renderHolidayMemberPicker();

  const filter = document.getElementById('taskFilter');
  const curF = filter.value;
  filter.innerHTML = '<option value="all">Everyone</option>';
  state.members.forEach(m=>{
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.name;
    filter.appendChild(opt);
  });
  if(curF) filter.value = curF;
}

function renderMembers(){
  const wrap = document.getElementById('memberListWrap');
  wrap.innerHTML = '';
  if(state.members.length===0){
    wrap.innerHTML = '<div class="empty">No family members yet — add one above.</div>';
  }
  state.members.forEach(m=>{
    const row = document.createElement('div');
    row.className = 'member-row';
    const openTasks = state.tasks.filter(t=>t.assignee===m.id && !t.done).length;
    row.innerHTML = `
      <div class="member-left">
        <div class="avatar" style="background:${m.color}">${initials(m.name)}</div>
        <div>
          <div style="font-weight:600;">${escapeHtml(m.name)}</div>
          <div style="font-size:0.78rem; color:var(--ink-soft);">${openTasks} open task${openTasks===1?'':'s'}</div>
        </div>
      </div>
      <div class="member-right">
        <input type="color" class="member-color-input" value="${m.color}" data-id="${m.id}" title="Change ${escapeHtml(m.name)}'s colour">
        <button class="btn small danger" data-id="${m.id}">Remove</button>
      </div>
    `;
    row.querySelector('.member-color-input').addEventListener('change', (e)=>{
      updateDoc(doc(col('members'), m.id), {color: e.target.value});
    });
    row.querySelector('button.danger').addEventListener('click', ()=>{
      deleteDoc(doc(col('members'), m.id));
    });
    wrap.appendChild(row);
  });
  renderMemberSelects();
}

document.getElementById('addMemberBtn').addEventListener('click', ()=>{
  const input = document.getElementById('memberName');
  const name = input.value.trim();
  if(!name) return;
  const color = PALETTE[state.members.length % PALETTE.length];
  addDoc(col('members'), {name, color});
  input.value = '';
});

// ---------- Tasks ----------
function dueBadge(due){
  if(!due) return '';
  if(due < todayStr()) return '<span class="due-badge due-overdue">Overdue</span>';
  if(due === todayStr()) return '<span class="due-badge due-today">Due today</span>';
  return `<span class="due-badge due-upcoming">${fmtDateNice(due)}</span>`;
}

function renderTaskList(container, tasks, opts){
  opts = opts || {};
  container.innerHTML = '';
  if(tasks.length===0){
    container.innerHTML = '<div class="empty">Nothing here yet.</div>';
    return;
  }
  tasks.forEach(t=>{
    const m = memberById(t.assignee);
    const li = document.createElement('li');
    li.className = 'task-item';
    li.innerHTML = `
      <input type="checkbox" ${t.done?'checked':''}>
      <div class="task-main">
        <div class="task-title ${t.done?'done':''}">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${m?`<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>`:''}
          ${!t.done ? dueBadge(t.due) : `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.78rem; color:var(--good); font-weight:600;">
              ✓ Done by
              <select class="completedBySelect" style="padding:1px 4px; font-size:0.78rem; border-radius:5px;">
                <option value="">someone</option>
                ${state.members.map(mem=>`<option value="${mem.id}" ${t.completedBy===mem.id?'selected':''}>${escapeHtml(mem.name)}</option>`).join('')}
              </select>
            </span>
          `}
        </div>
        ${t.notes?`<div class="task-notes">${escapeHtml(t.notes)}</div>`:''}
      </div>
      ${opts.removable !== false ? '<button class="btn small danger" title="Delete">✕</button>' : ''}
    `;
    li.querySelector('input[type=checkbox]').addEventListener('change', e=>{
      const done = e.target.checked;
      const completedBy = done ? (t.completedBy || t.assignee || '') : '';
      updateDoc(doc(col('tasks'), t.id), {done, completedBy});
    });
    const completedSelect = li.querySelector('.completedBySelect');
    if(completedSelect){
      completedSelect.addEventListener('change', e=>{
        updateDoc(doc(col('tasks'), t.id), {completedBy: e.target.value});
      });
    }
    const delBtn = li.querySelector('button.danger');
    if(delBtn){
      delBtn.addEventListener('click', ()=>{
        deleteDoc(doc(col('tasks'), t.id));
      });
    }
    container.appendChild(li);
  });
}

const TASK_STATUS_LABELS = {overdue:'Overdue', today:'Due today'};

function renderTaskStatusBanner(){
  const banner = document.getElementById('taskStatusBanner');
  if(!banner) return;
  if(taskStatusFilter === 'all'){
    banner.style.display = 'none';
    banner.innerHTML = '';
    return;
  }
  banner.style.display = 'flex';
  banner.innerHTML = `Showing: <strong>${TASK_STATUS_LABELS[taskStatusFilter] || taskStatusFilter}</strong> <button class="btn small" id="clearTaskStatusFilter">Show all</button>`;
  document.getElementById('clearTaskStatusFilter').addEventListener('click', ()=>{
    taskStatusFilter = 'all';
    renderTasks();
  });
}

function renderTasks(){
  const filter = document.getElementById('taskFilter').value || 'all';
  let list = [...state.tasks];
  if(filter !== 'all') list = list.filter(t=>t.assignee===filter);
  if(taskStatusFilter === 'overdue') list = list.filter(t=>!t.done && t.due && t.due < todayStr());
  else if(taskStatusFilter === 'today') list = list.filter(t=>!t.done && t.due === todayStr());
  list.sort((a,b)=>{
    if(a.done !== b.done) return a.done ? 1 : -1;
    return (a.due||'9999').localeCompare(b.due||'9999');
  });
  renderTaskList(document.getElementById('taskList'), list);
  renderTaskStatusBanner();
}
document.getElementById('taskFilter').addEventListener('change', renderTasks);

document.getElementById('addTaskBtn').addEventListener('click', ()=>{
  const title = document.getElementById('taskTitle').value.trim();
  if(!title) return;
  const assignee = document.getElementById('taskAssignee').value;
  const due = document.getElementById('taskDue').value;
  const notes = document.getElementById('taskNotes').value.trim();
  addDoc(col('tasks'), {title, assignee, due, notes, done:false, completedBy:'', createdAt: serverTimestamp()});
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDue').value = '';
  document.getElementById('taskNotes').value = '';
});
document.getElementById('taskTitle').addEventListener('keydown', e=>{
  if(e.key==='Enter') document.getElementById('addTaskBtn').click();
});

// ---------- Grocery ----------
const GROCERY_CATEGORY_ORDER = ["Fruit & Veg","Dairy & Eggs","Meat & Fish","Bakery","Frozen","Pantry & Tins","Household","Other"];
function renderGrocery(){
  const wrap = document.getElementById('groceryListWrap');
  wrap.innerHTML = '';
  if(state.grocery.length===0){
    wrap.innerHTML = '<div class="empty">Grocery list is empty — add something above.</div>';
    return;
  }
  GROCERY_CATEGORY_ORDER.forEach(cat=>{
    const items = state.grocery.filter(g=>g.category===cat);
    if(items.length===0) return;
    const section = document.createElement('div');
    section.style.marginBottom = '14px';
    const openCount = items.filter(g=>!g.done).length;
    section.innerHTML = `<div style="font-weight:700; font-size:0.8rem; color:var(--c-grocery); margin-bottom:4px;">${cat} <span style="color:var(--ink-soft); font-weight:400;">(${openCount} left)</span></div>`;
    const ul = document.createElement('ul');
    ul.className = 'todo-list';
    items.sort((a,b)=> (a.done===b.done)?0:(a.done?1:-1)).forEach(item=>{
      const li = document.createElement('li');
      li.className = 'todo-item';
      li.innerHTML = `
        <input type="checkbox" ${item.done?'checked':''}>
        <div class="task-main">
          <div class="task-title ${item.done?'done':''}">${escapeHtml(item.text)}${item.qty?` <span style="color:var(--ink-soft); font-weight:400;">(${escapeHtml(item.qty)})</span>`:''}</div>
        </div>
        <button class="btn small danger">✕</button>
      `;
      li.querySelector('input').addEventListener('change', e=>{
        updateDoc(doc(col('grocery'), item.id), {done: e.target.checked});
      });
      li.querySelector('button').addEventListener('click', ()=>{
        deleteDoc(doc(col('grocery'), item.id));
      });
      ul.appendChild(li);
    });
    section.appendChild(ul);
    wrap.appendChild(section);
  });
}
document.getElementById('addGroceryBtn').addEventListener('click', ()=>{
  const input = document.getElementById('groceryText');
  const text = input.value.trim();
  if(!text) return;
  const qty = document.getElementById('groceryQty').value.trim();
  const category = document.getElementById('groceryCategory').value;
  addDoc(col('grocery'), {text, qty, category, done:false, createdAt: serverTimestamp()});
  input.value = '';
  document.getElementById('groceryQty').value = '';
});
document.getElementById('groceryText').addEventListener('keydown', e=>{
  if(e.key==='Enter') document.getElementById('addGroceryBtn').click();
});
document.getElementById('clearGroceryBtn').addEventListener('click', async ()=>{
  const done = state.grocery.filter(g=>g.done);
  await Promise.all(done.map(g=>deleteDoc(doc(col('grocery'), g.id))));
});

// ---------- Shopping List ----------
function renderShopping(){
  const container = document.getElementById('shoppingList');
  container.innerHTML = '';
  if(state.shopping.length===0){
    container.innerHTML = '<div class="empty">Shopping list is empty — add something above.</div>';
    return;
  }
  const sorted = [...state.shopping].sort((a,b)=> (a.done===b.done)?0:(a.done?1:-1));
  sorted.forEach(item=>{
    const m = memberById(item.assignee);
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.innerHTML = `
      <input type="checkbox" ${item.done?'checked':''}>
      <div class="task-main">
        <div class="task-title ${item.done?'done':''}">${escapeHtml(item.text)}</div>
        <div class="task-meta">
          ${m?`<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>`:''}
        </div>
        ${item.notes?`<div class="task-notes">${escapeHtml(item.notes)}</div>`:''}
      </div>
      <button class="btn small danger">✕</button>
    `;
    li.querySelector('input').addEventListener('change', e=>{
      updateDoc(doc(col('shopping'), item.id), {done: e.target.checked});
    });
    li.querySelector('button').addEventListener('click', ()=>{
      deleteDoc(doc(col('shopping'), item.id));
    });
    container.appendChild(li);
  });
}
document.getElementById('addShoppingBtn').addEventListener('click', ()=>{
  const input = document.getElementById('shoppingText');
  const text = input.value.trim();
  if(!text) return;
  const assignee = document.getElementById('shoppingAssignee').value;
  const notes = document.getElementById('shoppingNotes').value.trim();
  addDoc(col('shopping'), {text, assignee, notes, done:false, createdAt: serverTimestamp()});
  input.value = '';
  document.getElementById('shoppingNotes').value = '';
});
document.getElementById('shoppingText').addEventListener('keydown', e=>{
  if(e.key==='Enter') document.getElementById('addShoppingBtn').click();
});
document.getElementById('clearShoppingBtn').addEventListener('click', async ()=>{
  const done = state.shopping.filter(s=>s.done);
  await Promise.all(done.map(s=>deleteDoc(doc(col('shopping'), s.id))));
});

// ---------- Calendar ----------
const dialog = document.getElementById('eventDialog');
document.getElementById('closeEventDialog').addEventListener('click', ()=>dialog.close());
document.getElementById('closeEventDialog2').addEventListener('click', ()=>dialog.close());

const REPEAT_LABELS = {daily:'Repeats daily', weekly:'Repeats weekly', fortnightly:'Repeats fortnightly', monthly:'Repeats monthly', yearly:'Repeats yearly'};

document.getElementById('eventRepeat').addEventListener('change', e=>{
  document.getElementById('eventRepeatUntilWrap').style.display = e.target.value==='none' ? 'none' : 'flex';
});

function isoDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

// Expands a (possibly recurring, possibly multi-day) event into its occurrences that fall within [rangeStartISO, rangeEndISO].
function expandEvent(ev, rangeStartISO, rangeEndISO){
  if(!ev.repeat || ev.repeat === 'none'){
    const endISO = (ev.endDate && ev.endDate > ev.date) ? ev.endDate : ev.date;
    if(endISO < rangeStartISO || ev.date > rangeEndISO) return [];
    const isSpan = endISO !== ev.date;
    if(!isSpan){
      return (ev.date >= rangeStartISO && ev.date <= rangeEndISO) ? [{...ev, occDate: ev.date, isSpan:false}] : [];
    }
    const out = [];
    let cur = new Date(ev.date+'T00:00:00');
    const last = new Date(endISO+'T00:00:00');
    const rangeStart = new Date(rangeStartISO+'T00:00:00');
    const rangeEnd = new Date(rangeEndISO+'T00:00:00');
    let safety = 0;
    while(cur <= last && safety < 400){
      if(cur >= rangeStart && cur <= rangeEnd){
        const occISO = isoDate(cur);
        out.push({...ev, occDate: occISO, isSpan:true, isSpanStart: occISO===ev.date, isSpanEnd: occISO===endISO});
      }
      cur.setDate(cur.getDate()+1);
      safety++;
    }
    return out;
  }
  const out = [];
  let cur = new Date(ev.date+'T00:00:00');
  const rangeStart = new Date(rangeStartISO+'T00:00:00');
  const rangeEnd = new Date(rangeEndISO+'T00:00:00');
  const until = ev.repeatUntil ? new Date(ev.repeatUntil+'T00:00:00') : null;
  const hardCap = new Date(cur); hardCap.setFullYear(hardCap.getFullYear()+2);
  let safety = 0;
  while(cur <= rangeEnd && cur <= hardCap && safety < 1500){
    if(until && cur > until) break;
    if(cur >= rangeStart) out.push({...ev, occDate: isoDate(cur)});
    const n = new Date(cur);
    if(ev.repeat==='daily') n.setDate(n.getDate()+1);
    else if(ev.repeat==='weekly') n.setDate(n.getDate()+7);
    else if(ev.repeat==='fortnightly') n.setDate(n.getDate()+14);
    else if(ev.repeat==='monthly') n.setMonth(n.getMonth()+1);
    else if(ev.repeat==='yearly') n.setFullYear(n.getFullYear()+1);
    else break;
    cur = n;
    safety++;
  }
  return out;
}

function expandEventsInRange(rangeStartISO, rangeEndISO){
  return state.events.flatMap(ev => expandEvent(ev, rangeStartISO, rangeEndISO));
}

const CAL_TARGETS = [
  {gridId:'calGrid', labelId:'monthLabel'},
  {gridId:'calGridOv', labelId:'monthLabelOv'}
];

function renderCalendarInto(gridId, labelId){
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  const labelEl = document.getElementById(labelId);
  if(labelEl) labelEl.textContent = calCursor.toLocaleDateString('en-GB', {month:'long', year:'numeric'});

  const grid = document.getElementById(gridId);
  if(!grid) return;
  grid.innerHTML = '';
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d=>{
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstOfMonth = new Date(year, month, 1);
  let startOffset = firstOfMonth.getDay() - 1;
  if(startOffset < 0) startOffset = 6;
  const gridStart = new Date(year, month, 1 - startOffset);
  const gridEnd = new Date(gridStart); gridEnd.setDate(gridStart.getDate()+41);
  const expanded = expandEventsInRange(isoDate(gridStart), isoDate(gridEnd));

  for(let i=0;i<42;i++){
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate()+i);
    const iso = isoDate(cellDate);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if(cellDate.getMonth() !== month) cell.classList.add('other-month');
    if(iso === todayStr()) cell.classList.add('today');
    const dayEvents = expanded.filter(e=>e.occDate===iso).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
    cell.innerHTML = `<div class="daynum">${cellDate.getDate()}</div>` +
      dayEvents.map(e=>{
        const m = memberById(e.memberId);
        const bg = m ? m.color : '#7d8597';
        const rpt = (e.repeat && e.repeat!=='none') ? '↻ ' : '';
        let spanClass = '', spanIcon = '', label;
        if(e.isSpan){
          spanClass = e.isSpanStart ? '' : (e.isSpanEnd ? ' cal-span-end' : ' cal-span-mid');
          spanIcon = e.isSpanStart ? '▶ ' : (e.isSpanEnd ? '◀ ' : '─ ');
          label = e.isSpanStart ? `${e.time?e.time+' ':''}${escapeHtml(e.title)}` : escapeHtml(e.title);
        } else {
          label = `${e.time?e.time+' ':''}${escapeHtml(e.title)}`;
        }
        const titleAttr = escapeHtml(e.title) + (e.repeat && e.repeat!=='none' ? ' ('+REPEAT_LABELS[e.repeat]+')' : '') + (e.isSpan ? ` (${fmtDateNice(e.date)} – ${fmtDateNice(e.endDate)})` : '');
        return `<div class="cal-event${spanClass}" style="background:${bg}" title="${titleAttr}">${rpt}${spanIcon}${label}</div>`;
      }).join('');
    cell.addEventListener('click', ()=>openEventDialog(iso));
    grid.appendChild(cell);
  }
}

function renderCalendar(){
  CAL_TARGETS.forEach(t=>renderCalendarInto(t.gridId, t.labelId));
}

function goPrevMonth(){ calCursor.setMonth(calCursor.getMonth()-1); renderCalendar(); }
function goNextMonth(){ calCursor.setMonth(calCursor.getMonth()+1); renderCalendar(); }
document.getElementById('prevMonth').addEventListener('click', goPrevMonth);
document.getElementById('nextMonth').addEventListener('click', goNextMonth);
document.getElementById('prevMonthOv').addEventListener('click', goPrevMonth);
document.getElementById('nextMonthOv').addEventListener('click', goNextMonth);

function openEventDialog(iso){
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
  dialog.showModal();
}
function renderExistingEvents(){
  const wrap = document.getElementById('existingEvents');
  const evs = expandEventsInRange(selectedCalDate, selectedCalDate);
  if(evs.length===0){ wrap.innerHTML=''; return; }
  wrap.innerHTML = '<div class="field"><label>Existing events</label></div>' +
    evs.map(e=>{
      const m = memberById(e.memberId);
      const isRecurring = e.repeat && e.repeat!=='none';
      const isSpan = e.endDate && e.endDate > e.date;
      const spanNote = isSpan ? ` (${fmtDateNice(e.date)} – ${fmtDateNice(e.endDate)})` : '';
      return `<div class="row" style="justify-content:space-between; padding:4px 0;">
        <span class="chip" style="--mc:${m?m.color:'#7d8597'}">${isRecurring?'↻ ':''}${e.time?e.time+' · ':''}${escapeHtml(e.title)}${spanNote}</span>
        <button class="btn small danger" data-id="${e.id}" data-recurring="${isRecurring?'1':'0'}">✕</button>
      </div>`;
    }).join('');
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.dataset.recurring==='1' && !confirm('This event repeats. Delete the whole series?')) return;
      deleteDoc(doc(col('events'), btn.dataset.id));
    });
  });
}
document.getElementById('saveEventBtn').addEventListener('click', ()=>{
  const title = document.getElementById('eventTitle').value.trim();
  if(!title) return;
  const time = document.getElementById('eventTime').value;
  const memberId = document.getElementById('eventMember').value;
  const repeat = document.getElementById('eventRepeat').value;
  const repeatUntil = repeat==='none' ? '' : document.getElementById('eventRepeatUntil').value;
  const rawEndDate = document.getElementById('eventEndDate').value;
  const endDate = (repeat==='none' && rawEndDate && rawEndDate > selectedCalDate) ? rawEndDate : '';
  addDoc(col('events'), {date: selectedCalDate, endDate, title, time, memberId, repeat, repeatUntil});
  document.getElementById('eventTitle').value='';
  document.getElementById('eventTime').value='';
  document.getElementById('eventEndDate').value='';
  document.getElementById('eventRepeat').value='none';
  document.getElementById('eventRepeatUntil').value='';
  document.getElementById('eventRepeatUntilWrap').style.display='none';
});

// ---------- Overview ----------
function renderOverview(){
  const openTasks = state.tasks.filter(t=>!t.done);
  const overdue = openTasks.filter(t=>t.due && t.due < todayStr());
  const dueToday = openTasks.filter(t=>t.due === todayStr());
  const groceryOpen = state.grocery.filter(g=>!g.done);
  const shoppingOpen = state.shopping.filter(s=>!s.done);
  const upcoming7 = (()=>{
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(end.getDate()+7);
    return state.events.filter(e=>{
      const d = new Date(e.date+'T00:00:00');
      const endISO = (e.endDate && e.endDate > e.date) ? e.endDate : e.date;
      const endD = new Date(endISO+'T00:00:00');
      return endD >= start && d <= end;
    }).sort((a,b)=> a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));
  })();
  const totalOwed = state.members.reduce((sum,m)=>{
    const debtTotal = state.debts.filter(d=>d.memberId===m.id).reduce((s,d)=>s+(Number(d.balance)||0), 0);
    const paidTotal = state.payments.filter(p=>p.memberId===m.id).reduce((s,p)=>s+(Number(p.amount)||0), 0);
    return sum + Math.max(debtTotal - paidTotal, 0);
  }, 0);
  const nextHoliday = (()=>{
    const todayISO = todayStr();
    const upcoming = state.holidays.filter(h=>{
      const endISO = (h.endDate && h.endDate > h.startDate) ? h.endDate : h.startDate;
      return endISO >= todayISO;
    }).sort((a,b)=> (a.startDate||'').localeCompare(b.startDate||''));
    return upcoming[0] || null;
  })();
  let holidayNum = '', holidayIsAway = false;
  if(nextHoliday){
    const todayISO = todayStr();
    if(nextHoliday.startDate <= todayISO){
      holidayNum = 'Away'; holidayIsAway = true;
    } else {
      const days = Math.round((new Date(nextHoliday.startDate+'T00:00:00') - new Date(todayISO+'T00:00:00'))/86400000);
      holidayNum = days + (days===1 ? ' day' : ' days');
    }
  }

  const statGrid = document.getElementById('statGrid');
  statGrid.innerHTML = `
    <div class="stat stat-tasks" data-action="tab:tasks" tabindex="0" role="button" aria-label="Go to open tasks"><div class="stat-top"><span class="icon">📋</span><span class="num">${openTasks.length}</span></div><div class="label">Open tasks</div></div>
    <div class="stat stat-overdue" data-action="tasks:overdue" tabindex="0" role="button" aria-label="Go to overdue tasks"><div class="stat-top"><span class="icon">⚠️</span><span class="num" style="color:${overdue.length?'var(--bad)':'inherit'}">${overdue.length}</span></div><div class="label">Overdue</div></div>
    <div class="stat stat-today" data-action="tasks:today" tabindex="0" role="button" aria-label="Go to tasks due today"><div class="stat-top"><span class="icon">⏰</span><span class="num" style="color:${dueToday.length?'var(--warn)':'inherit'}">${dueToday.length}</span></div><div class="label">Due today</div></div>
    <div class="stat stat-grocery" data-action="tab:grocery" tabindex="0" role="button" aria-label="Go to grocery list"><div class="stat-top"><span class="icon">🛒</span><span class="num">${groceryOpen.length}</span></div><div class="label">Grocery left</div></div>
    <div class="stat stat-shopping" data-action="tab:shopping" tabindex="0" role="button" aria-label="Go to shopping list"><div class="stat-top"><span class="icon">🛍️</span><span class="num">${shoppingOpen.length}</span></div><div class="label">Shopping left</div></div>
    <div class="stat stat-members" data-action="tab:members" tabindex="0" role="button" aria-label="Go to family members"><div class="stat-top"><span class="icon">👪</span><span class="num">${state.members.length}</span></div><div class="label">Family members</div></div>
    ${(canSeeFinance && state.debts.length) ? `<div class="stat stat-finance" data-action="tab:finance" tabindex="0" role="button" aria-label="Go to finance"><div class="stat-top"><span class="icon">💰</span><span class="num" style="font-size:1.05rem;">${fmtMoney(totalOwed)}</span></div><div class="label">Total owed</div></div>` : ''}
    ${nextHoliday ? `<div class="stat stat-holiday" data-action="tab:holiday" tabindex="0" role="button" aria-label="Go to holidays"><div class="stat-top"><span class="icon">✈️</span><span class="num" style="font-size:${holidayIsAway?'1.05rem':'1.2rem'};">${holidayNum}</span></div><div class="label">${escapeHtml(nextHoliday.destination)}</div></div>` : ''}
  `;

  renderTaskList(document.getElementById('overviewTaskList'), [...overdue, ...dueToday], {removable:false});

  const evList = document.getElementById('overviewEventList');
  evList.innerHTML = '';
  if(upcoming7.length===0){
    evList.innerHTML = '<div class="empty">No events in the next 7 days.</div>';
  } else {
    upcoming7.forEach(e=>{
      const m = memberById(e.memberId);
      const li = document.createElement('li');
      li.className = 'task-item';
      const isSpan = e.endDate && e.endDate > e.date;
      const dateLabel = isSpan ? `${fmtDateNice(e.date)} – ${fmtDateNice(e.endDate)}` : `${fmtDateNice(e.date)}${e.time?' · '+e.time:''}`;
      li.innerHTML = `
        <div class="task-main">
          <div class="task-title">${escapeHtml(e.title)}</div>
          <div class="task-meta">
            <span class="due-badge due-upcoming">${dateLabel}</span>
            ${m?`<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>`:''}
          </div>
        </div>
      `;
      evList.appendChild(li);
    });
  }
}

// ---------- Finance ----------
function fmtMoney(n){
  const v = Number(n) || 0;
  return '£' + v.toLocaleString('en-GB', {minimumFractionDigits:2, maximumFractionDigits:2});
}

// Tracks whether the "Log a payment" form is currently editing an existing
// payment entry (holds its doc id) or logging a new one (null).
let editingPaymentId = null;

function renderFinance(){
  const wrap = document.getElementById('financeWrap');
  wrap.innerHTML = '';
  if(state.members.length===0){
    wrap.innerHTML = '<div class="empty">Add a family member first, then track their balances here.</div>';
    return;
  }
  state.members.forEach(m=>{
    const debts = state.debts.filter(d=>d.memberId===m.id);
    const payments = [...state.payments.filter(p=>p.memberId===m.id)].sort((a,b)=>{
      const dc = (a.date||'').localeCompare(b.date||'');
      if(dc!==0) return dc;
      const at = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : 0;
      const bt = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : 0;
      return at - bt;
    });
    if(debts.length===0 && payments.length===0) return; // nothing logged for this member yet

    const debtTotal = debts.reduce((s,d)=>s+(Number(d.balance)||0), 0);
    const paidTotal = payments.reduce((s,p)=>s+(Number(p.amount)||0), 0);
    const current = debtTotal - paidTotal;

    const card = document.createElement('div');
    card.className = 'fin-card';
    let html = `
      <div class="fin-card-head">
        <span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>
        <span class="fin-amt ${current>0?'fin-neg':'fin-pos'}" style="font-size:1rem;">${fmtMoney(current)} outstanding</span>
      </div>
    `;
    if(debts.length){
      html += `<div class="fin-sub">Accounts</div>`;
      debts.forEach(d=>{
        html += `
          <div class="fin-line">
            <div class="fin-line-main">
              <span class="fin-line-title">${escapeHtml(d.creditor)}</span>
              ${d.note?`<span class="fin-line-note">${escapeHtml(d.note)}</span>`:''}
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
    if(payments.length){
      html += `<div class="fin-sub">Payment history</div>`;
      let running = debtTotal;
      payments.forEach(p=>{
        running -= (Number(p.amount)||0);
        html += `
          <div class="fin-line" ${p.id===editingPaymentId?'style="box-shadow:inset 0 0 0 2px var(--c-finance);"':''}>
            <div class="fin-line-main">
              <span class="fin-line-title">${fmtDateNice(p.date)}</span>
              <span class="fin-line-note">${escapeHtml(p.method||'')}${p.comment?` — ${escapeHtml(p.comment)}`:''}</span>
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
    card.querySelectorAll('[data-action="delDebt"]').forEach(btn=>{
      btn.addEventListener('click', ()=> deleteDoc(doc(col('debts'), btn.dataset.id)));
    });
    card.querySelectorAll('[data-action="delPayment"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if(btn.dataset.id === editingPaymentId) cancelPaymentEdit();
        deleteDoc(doc(col('payments'), btn.dataset.id));
      });
    });
    card.querySelectorAll('[data-action="editPayment"]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const p = state.payments.find(x=>x.id===btn.dataset.id);
        if(p) startEditPayment(p);
      });
    });
    wrap.appendChild(card);
  });
  if(!wrap.children.length){
    wrap.innerHTML = '<div class="empty">No balances logged yet — add one above.</div>';
  }
}

function startEditPayment(p){
  editingPaymentId = p.id;
  document.getElementById('paymentMember').value = p.memberId || '';
  document.getElementById('paymentDate').value = p.date || '';
  document.getElementById('paymentAmount').value = (p.amount!=null) ? p.amount : '';
  document.getElementById('paymentMethod').value = p.method || 'Bank Transfer';
  document.getElementById('paymentComment').value = p.comment || '';
  document.getElementById('addPaymentBtn').textContent = 'Save changes';
  document.getElementById('cancelPaymentEditBtn').style.display = '';
  document.getElementById('paymentMember').closest('.card').scrollIntoView({behavior:'smooth', block:'start'});
  renderFinance();
}

function cancelPaymentEdit(){
  editingPaymentId = null;
  document.getElementById('paymentDate').value = '';
  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentComment').value = '';
  document.getElementById('addPaymentBtn').textContent = 'Log payment';
  document.getElementById('cancelPaymentEditBtn').style.display = 'none';
  renderFinance();
}

document.getElementById('cancelPaymentEditBtn').addEventListener('click', cancelPaymentEdit);

document.getElementById('addDebtBtn').addEventListener('click', ()=>{
  const memberId = document.getElementById('debtMember').value;
  const creditor = document.getElementById('debtCreditor').value.trim();
  const balance = parseFloat(document.getElementById('debtBalance').value);
  const note = document.getElementById('debtNote').value.trim();
  if(!memberId || !creditor || isNaN(balance)) return;
  addDoc(col('debts'), {memberId, creditor, balance, note, createdAt: serverTimestamp()});
  document.getElementById('debtCreditor').value = '';
  document.getElementById('debtBalance').value = '';
  document.getElementById('debtNote').value = '';
});

document.getElementById('addPaymentBtn').addEventListener('click', ()=>{
  const memberId = document.getElementById('paymentMember').value;
  const date = document.getElementById('paymentDate').value || todayStr();
  const amount = parseFloat(document.getElementById('paymentAmount').value);
  const method = document.getElementById('paymentMethod').value;
  const comment = document.getElementById('paymentComment').value.trim();
  if(!memberId || isNaN(amount)) return;
  addDoc(col('payments'), {memberId, date, amount, method, comment, createdAt: serverTimestamp()});
  document.getElementById('paymentDate').value = '';
  document.getElementById('paymentAmount').value = '';
  document.getElementById('paymentComment').value = '';
});

// ---------- Holidays ----------
// Holiday "who's going" is a multi-select of member chips rather than a single dropdown —
// selection lives here (not in the DOM) so it survives the picker being rebuilt on every
// members-list change.
let holidaySelectedMembers = new Set();

function renderHolidayMemberPicker(){
  const wrap = document.getElementById('holidayMemberPicker');
  if(!wrap) return;
  // Drop any selected ids for members that no longer exist.
  holidaySelectedMembers.forEach(id=>{ if(!memberById(id)) holidaySelectedMembers.delete(id); });
  wrap.innerHTML = '';
  state.members.forEach(m=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-toggle' + (holidaySelectedMembers.has(m.id) ? ' active' : '');
    btn.style.borderColor = m.color;
    btn.style.background = holidaySelectedMembers.has(m.id) ? m.color : '#fff';
    btn.textContent = m.name;
    btn.addEventListener('click', ()=>{
      if(holidaySelectedMembers.has(m.id)) holidaySelectedMembers.delete(m.id);
      else holidaySelectedMembers.add(m.id);
      renderHolidayMemberPicker();
    });
    wrap.appendChild(btn);
  });
}

// A holiday's travellers: new docs store memberIds (array); tolerate the older
// single-memberId shape from before multi-select was added.
function holidayMemberIds(h){
  if(Array.isArray(h.memberIds)) return h.memberIds;
  if(h.memberId) return [h.memberId];
  return [];
}

// Tracks whether the "Plan a holiday" form is currently editing an existing
// entry (holds its doc id) or adding a new one (null).
let editingHolidayId = null;

// Older holiday docs (created before the status field existed) have no
// `status` at all — treat those as "Planning" everywhere.
function holidayStatusClass(status){
  switch(status){
    case 'Confirmed': return 'status-confirmed';
    case 'Booked': return 'status-booked';
    case 'Pending Payment': return 'status-pendingpayment';
    default: return 'status-planning';
  }
}

function renderHolidays(){
  const list = document.getElementById('holidayList');
  list.innerHTML = '';
  if(state.holidays.length===0){
    list.innerHTML = '<div class="empty">No holidays planned yet — add one above.</div>';
    return;
  }
  const todayISO = todayStr();
  // Always re-sorted by start date on every render, so a holiday added out of
  // order (or edited to a new date) immediately jumps to its correct place.
  const sorted = [...state.holidays].sort((a,b)=> (a.startDate||'').localeCompare(b.startDate||''));
  sorted.forEach(h=>{
    const travellers = holidayMemberIds(h).map(memberById).filter(Boolean);
    const endISO = (h.endDate && h.endDate > h.startDate) ? h.endDate : h.startDate;
    const isPast = endISO < todayISO;
    const dateLabel = endISO !== h.startDate ? `${fmtDateNiceYear(h.startDate)} – ${fmtDateNiceYear(endISO)}` : fmtDateNiceYear(h.startDate);
    const travellerChips = travellers.length
      ? travellers.map(m=>`<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>`).join('')
      : '<span class="chip" style="--mc:#7d8597;">Whole family</span>';
    const li = document.createElement('li');
    li.className = 'task-item';
    li.style.alignItems = 'center';
    if(isPast) li.style.opacity = '0.55';
    if(h.id === editingHolidayId) li.style.boxShadow = 'inset 0 0 0 2px var(--c-holiday)';
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
    li.querySelector('[data-action="edit"]').addEventListener('click', ()=>{
      startEditHoliday(h);
    });
    li.querySelector('[data-action="delete"]').addEventListener('click', ()=>{
      if(h.id === editingHolidayId) cancelHolidayEdit();
      deleteDoc(doc(col('holidays'), h.id));
    });
    list.appendChild(li);
  });
}

function startEditHoliday(h){
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
  document.getElementById('holidayDestination').closest('.card').scrollIntoView({behavior:'smooth', block:'start'});
  renderHolidays();
}

function cancelHolidayEdit(){
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

document.getElementById('cancelHolidayEditBtn').addEventListener('click', cancelHolidayEdit);

document.getElementById('addHolidayBtn').addEventListener('click', ()=>{
  const startDate = document.getElementById('holidayStart').value;
  const endDateRaw = document.getElementById('holidayEnd').value;
  const destination = document.getElementById('holidayDestination').value.trim();
  const airline = document.getElementById('holidayAirline').value.trim();
  const bookingRef = document.getElementById('holidayBookingRef').value.trim();
  const status = document.getElementById('holidayStatus').value;
  const memberIds = Array.from(holidaySelectedMembers);
  if(!startDate || !destination) return;
  const endDate = (endDateRaw && endDateRaw >= startDate) ? endDateRaw : startDate;
  if(editingHolidayId){
    updateDoc(doc(col('holidays'), editingHolidayId), {startDate, endDate, destination, airline, bookingRef, status, memberIds});
    cancelHolidayEdit();
    return;
  }
  addDoc(col('holidays'), {startDate, endDate, destination, airline, bookingRef, status, memberIds, createdAt: serverTimestamp()});
  document.getElementById('holidayStart').value = '';
  document.getElementById('holidayEnd').value = '';
  document.getElementById('holidayDestination').value = '';
  document.getElementById('holidayAirline').value = '';
  document.getElementById('holidayBookingRef').value = '';
  document.getElementById('holidayStatus').value = 'Planning';
  holidaySelectedMembers = new Set();
  renderHolidayMemberPicker();
});

// ---------- Wish List ----------
let editingWishId = null;

// Only ever render a link badge for http(s) URLs — guards against a stray
// javascript: URI (typed or pasted) ever ending up as a clickable href.
function safeWishLink(url){
  if(!url) return '';
  try{
    const u = new URL(url);
    if(u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  }catch(e){}
  return '';
}

function renderWishlist(){
  const list = document.getElementById('wishListEl');
  list.innerHTML = '';
  if(state.wishlist.length===0){
    list.innerHTML = '<div class="empty">No wishes added yet — add one above.</div>';
    return;
  }
  const sorted = [...state.wishlist].sort((a,b)=>{
    const an = memberById(a.memberId) ? memberById(a.memberId).name : '';
    const bn = memberById(b.memberId) ? memberById(b.memberId).name : '';
    return an.localeCompare(bn);
  });
  sorted.forEach(w=>{
    const m = memberById(w.memberId);
    const link = safeWishLink(w.link);
    const li = document.createElement('li');
    li.className = 'task-item';
    li.style.alignItems = 'center';
    if(w.id === editingWishId) li.style.boxShadow = 'inset 0 0 0 2px var(--c-wishlist)';
    li.innerHTML = `
      <div class="task-main" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        ${m?`<span class="chip" style="--mc:${m.color}"><span class="dot">${initials(m.name)}</span>${escapeHtml(m.name)}</span>`:''}
        <span class="task-title">${escapeHtml(w.item)}</span>
        ${link?`<a class="ref-badge" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">View product ↗</a>`:''}
        ${w.notes?`<span style="color:var(--ink-soft); font-size:0.8rem;">${escapeHtml(w.notes)}</span>`:''}
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn small" data-action="editWish" data-id="${w.id}">✎ Edit</button>
        <button class="btn small danger" data-action="delWish" data-id="${w.id}">✕</button>
      </div>
    `;
    li.querySelector('[data-action="editWish"]').addEventListener('click', ()=>{
      startEditWish(w);
    });
    li.querySelector('[data-action="delWish"]').addEventListener('click', ()=>{
      if(w.id === editingWishId) cancelWishEdit();
      deleteDoc(doc(col('wishlist'), w.id));
    });
    list.appendChild(li);
  });
}

function startEditWish(w){
  editingWishId = w.id;
  document.getElementById('wishMember').value = w.memberId || '';
  document.getElementById('wishItem').value = w.item || '';
  document.getElementById('wishLink').value = w.link || '';
  document.getElementById('wishNotes').value = w.notes || '';
  document.getElementById('addWishBtn').textContent = 'Save changes';
  document.getElementById('cancelWishEditBtn').style.display = '';
  document.getElementById('wishItem').closest('.card').scrollIntoView({behavior:'smooth', block:'start'});
  renderWishlist();
}

function cancelWishEdit(){
  editingWishId = null;
  document.getElementById('wishItem').value = '';
  document.getElementById('wishLink').value = '';
  document.getElementById('wishNotes').value = '';
  document.getElementById('addWishBtn').textContent = 'Add wish';
  document.getElementById('cancelWishEditBtn').style.display = 'none';
  renderWishlist();
}

document.getElementById('cancelWishEditBtn').addEventListener('click', cancelWishEdit);

document.getElementById('addWishBtn').addEventListener('click', ()=>{
  const memberId = document.getElementById('wishMember').value;
  const item = document.getElementById('wishItem').value.trim();
  const link = document.getElementById('wishLink').value.trim();
  const notes = document.getElementById('wishNotes').value.trim();
  if(!memberId || !item) return;
  if(editingWishId){
    updateDoc(doc(col('wishlist'), editingWishId), {memberId, item, link, notes});
    cancelWishEdit();
    return;
  }
  addDoc(col('wishlist'), {memberId, item, link, notes, createdAt: serverTimestamp()});
  document.getElementById('wishItem').value = '';
  document.getElementById('wishLink').value = '';
  document.getElementById('wishNotes').value = '';
});

// ---------- Export / Import ----------
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'family-dashboard-' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', ()=>{
  document.getElementById('importFile').click();
});
document.getElementById('importFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    try{
      const data = JSON.parse(ev.target.result);
      if(!(data.members && data.tasks && data.events)){
        alert("That file doesn't look like a family dashboard export.");
        return;
      }
      if(!confirm('This replaces the shared data for the whole family with the contents of this file. Continue?')) return;

      const collections = {members:data.members, tasks:data.tasks, events:data.events, grocery:data.grocery||[], shopping:data.shopping||[], holidays:data.holidays||[], wishlist:data.wishlist||[]};
      if(canSeeFinance){
        // Only imported for Nish/Sangeetha — importing as anyone else would hit a
        // Firestore permissions error on these two collections and abort the whole import.
        collections.debts = data.debts||[];
        collections.payments = data.payments||[];
      }
      for(const name of Object.keys(collections)){
        const existing = await getDocs(col(name));
        await Promise.all(existing.docs.map(d=>deleteDoc(d.ref)));
      }
      // Preserve original IDs so cross-references (assignee, memberId, completedBy) still resolve.
      for(const [name, items] of Object.entries(collections)){
        const batch = writeBatch(db);
        items.forEach(item=>{
          const {id, ...rest} = item;
          const ref = id ? doc(col(name), id) : doc(col(name));
          batch.set(ref, rest);
        });
        await batch.commit();
      }
    }catch(err){
      alert('Could not import that file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ---------- Render all ----------
function renderAll(){
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
