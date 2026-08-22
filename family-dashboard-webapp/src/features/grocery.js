import { state } from "../state/store.js";
import { addItem, updateItem, deleteItem, serverTimestamp } from "../supabase/collections.js";
import { escapeHtml } from "../utils/format.js";

const GROCERY_CATEGORY_ORDER = ["Fruit & Veg", "Dairy & Eggs", "Meat & Fish", "Bakery", "Frozen", "Pantry & Tins", "Household", "Other"];

// Mirrors the <datalist> suggestions in index.html — picking a suggestion
// pre-selects its category so the common case needs no extra click.
const GROCERY_ITEM_CATEGORY = {
  'Bananas': 'Fruit & Veg', 'Apples': 'Fruit & Veg', 'Grapes': 'Fruit & Veg',
  'Oranges': 'Fruit & Veg', 'Strawberries': 'Fruit & Veg', 'Blueberries': 'Fruit & Veg',
  'Lemons': 'Fruit & Veg', 'Avocado': 'Fruit & Veg', 'Onions': 'Fruit & Veg',
  'Carrots': 'Fruit & Veg', 'Potatoes': 'Fruit & Veg', 'Tomatoes': 'Fruit & Veg',
  'Cucumber': 'Fruit & Veg', 'Peppers': 'Fruit & Veg', 'Broccoli': 'Fruit & Veg',
  'Mushrooms': 'Fruit & Veg', 'Salad': 'Fruit & Veg', 'Spinach': 'Fruit & Veg',
  'Garlic': 'Fruit & Veg',
  'Milk': 'Dairy & Eggs', 'Butter': 'Dairy & Eggs', 'Cheese': 'Dairy & Eggs',
  'Eggs': 'Dairy & Eggs', 'Yogurt': 'Dairy & Eggs', 'Cream': 'Dairy & Eggs',
  'Orange Juice': 'Dairy & Eggs',
  'Chicken Breast': 'Meat & Fish', 'Chicken Thighs': 'Meat & Fish', 'Minced Beef': 'Meat & Fish',
  'Bacon': 'Meat & Fish', 'Sausages': 'Meat & Fish', 'Salmon': 'Meat & Fish', 'Ham': 'Meat & Fish',
  'Bread': 'Bakery', 'Rolls': 'Bakery', 'Bagels': 'Bakery', 'Croissants': 'Bakery',
  'Brioche Bun': 'Bakery',
  'Peas': 'Frozen', 'Sweetcorn': 'Frozen', 'Ice Cream': 'Frozen', 'Frozen Chips': 'Frozen',
  'Rice': 'Pantry & Tins', 'Pasta': 'Pantry & Tins', 'Cereal': 'Pantry & Tins',
  'Porridge Oats': 'Pantry & Tins', 'Baked Beans': 'Pantry & Tins', 'Tinned Tomatoes': 'Pantry & Tins',
  'Tinned Soup': 'Pantry & Tins', 'Flour': 'Pantry & Tins', 'Sugar': 'Pantry & Tins',
  'Olive Oil': 'Pantry & Tins', 'Salt': 'Pantry & Tins', 'Pepper': 'Pantry & Tins',
  'Ketchup': 'Pantry & Tins', 'Mayonnaise': 'Pantry & Tins', 'Tea Bags': 'Pantry & Tins',
  'Coffee': 'Pantry & Tins', 'Biscuits': 'Pantry & Tins', 'Crisps': 'Pantry & Tins',
  'Chocolate': 'Pantry & Tins', 'Lindt Chocolate': 'Pantry & Tins', 'Squash': 'Pantry & Tins',
  'Water': 'Pantry & Tins',
  'Toilet Roll': 'Household', 'Kitchen Roll': 'Household', 'Washing Up Liquid': 'Household',
  'Laundry Detergent': 'Household', 'Bin Bags': 'Household', 'Dishwasher Tablets': 'Household',
};

export function renderGrocery() {
  const wrap = document.getElementById('groceryListWrap');
  wrap.innerHTML = '';
  if (state.grocery.length === 0) {
    wrap.innerHTML = '<div class="empty">Grocery list is empty — add something above.</div>';
    return;
  }
  GROCERY_CATEGORY_ORDER.forEach(cat => {
    const items = state.grocery.filter(g => g.category === cat);
    if (items.length === 0) return;
    const section = document.createElement('div');
    section.style.marginBottom = '14px';
    const openCount = items.filter(g => !g.done).length;
    section.innerHTML = `<div style="font-weight:700; font-size:0.8rem; color:var(--c-grocery); margin-bottom:4px;">${cat} <span style="color:var(--ink-soft); font-weight:400;">(${openCount} left)</span></div>`;
    const ul = document.createElement('ul');
    ul.className = 'todo-list';
    items.sort((a, b) => (a.done === b.done) ? 0 : (a.done ? 1 : -1)).forEach(item => {
      const li = document.createElement('li');
      li.className = 'todo-item';
      li.innerHTML = `
        <input type="checkbox" ${item.done ? 'checked' : ''}>
        <div class="task-main">
          <div class="task-title ${item.done ? 'done' : ''}">${escapeHtml(item.text)}${item.qty ? ` <span style="color:var(--ink-soft); font-weight:400;">(${escapeHtml(item.qty)})</span>` : ''}</div>
        </div>
        <button class="btn small danger">✕</button>
      `;
      li.querySelector('input').addEventListener('change', e => {
        updateItem('grocery', item.id, { done: e.target.checked });
      });
      li.querySelector('button').addEventListener('click', () => {
        deleteItem('grocery', item.id);
      });
      ul.appendChild(li);
    });
    section.appendChild(ul);
    wrap.appendChild(section);
  });
}

export function initGrocery() {
  document.getElementById('groceryText').addEventListener('input', e => {
    const cat = GROCERY_ITEM_CATEGORY[e.target.value.trim()];
    if (cat) document.getElementById('groceryCategory').value = cat;
  });
  document.getElementById('addGroceryBtn').addEventListener('click', () => {
    const input = document.getElementById('groceryText');
    const text = input.value.trim();
    if (!text) return;
    const qty = document.getElementById('groceryQty').value.trim();
    const category = document.getElementById('groceryCategory').value;
    addItem('grocery', { text, qty, category, done: false, createdAt: serverTimestamp() });
    input.value = '';
    document.getElementById('groceryQty').value = '';
  });
  document.getElementById('groceryText').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addGroceryBtn').click();
  });
  document.getElementById('clearGroceryBtn').addEventListener('click', async () => {
    const done = state.grocery.filter(g => g.done);
    await Promise.all(done.map(g => deleteItem('grocery', g.id)));
  });
}
