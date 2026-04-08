// ═══════════════════════════════════════════════════════════
// SITEMEASURE — ENTERPRISE SPA
// ═══════════════════════════════════════════════════════════

// ── API Client ────────────────────────────────────────────
const api = {
  async get(path) {
    const r = await fetch('/api' + path);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  async post(path, data) {
    const r = await fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  async put(path, data) {
    const r = await fetch('/api' + path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j.data;
  },
  async del(path) {
    const r = await fetch('/api' + path, { method: 'DELETE' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Request failed');
    return j.data;
  }
};

// ── UI Utilities ──────────────────────────────────────────
const UI = {
  esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },

  toast(msg, ms = 2400) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  },

  openModal(html, wide = false) {
    document.getElementById('modalBackdrop').classList.add('open');
    const c = document.getElementById('modalContainer');
    c.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
    c.classList.add('open');
  },

  closeModal() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.getElementById('modalContainer').classList.remove('open');
    document.getElementById('modalContainer').innerHTML = '';
  },

  setLoading(el, loading) {
    if (loading) { el.disabled = true; el.dataset.orig = el.innerHTML; el.innerHTML = '<span class="spinner"></span>'; }
    else { el.disabled = false; el.innerHTML = el.dataset.orig || el.innerHTML; }
  },

  confirm(msg) { return window.confirm(msg); },

  render(html) { document.getElementById('appShell').innerHTML = html; },

  setNav(active) {
    document.getElementById('topnavLinks').innerHTML =
      ['projects','catalog'].map(k => `<a href="#${k}" class="${active===k?'active':''}">${k==='projects'?'🏗 Projects':'🗂 Catalog'}</a>`).join('');
  }
};

// ── State ─────────────────────────────────────────────────
let STATE = {
  catalogTree: null,
  activeSub: null,     // active subcategory id in catalog
  project: null,       // current open project
  projectTab: 'setup'  // setup | templates | floors | specs | summary
};
let _allCatalogItems = null;
let _activeSpecTplId = null;
let _specContext = 'tpl'; // 'tpl' | 'common'

const DOOR_TYPES = ['Interior Slab','Interior Prehung','Barn Door','French Door','Bifold','Bypass','Fire Rated','Exterior'];
const DOOR_WIDTHS = [12,14,16,18,20,22,24,26,28,30,32,34,36,38,42,48];
const TRIM_TYPES = ['Baseboard','Casing','Crown Moulding','Door Stop','Backband','Architrave','Handrail'];
const STOCK_LENGTHS = { 'Baseboard': 16, 'Casing': 16, 'Crown Moulding': 16, 'Door Stop': 7, 'Backband': 16, 'Architrave': 16, 'Handrail': 12 };
const TRIM_CAT_MAP  = { 'Baseboard': 'Baseboard', 'Casing': 'Door Casing', 'Crown Moulding': 'Crown Moulding', 'Door Stop': 'Door Stop', 'Backband': 'Backband', 'Architrave': 'Backband', 'Handrail': 'Handrail' };
const DOOR_CAT_MAP  = { 'Interior Slab': 'Interior Doors', 'Interior Prehung': 'Interior Doors', 'Barn Door': 'Interior Doors', 'French Door': 'Interior Doors', 'Bifold': 'Interior Doors', 'Bypass': 'Interior Doors', 'Fire Rated': 'Fire Rated Doors', 'Exterior': 'Exterior Doors' };

// ── Router ────────────────────────────────────────────────
async function route() {
  const hash = location.hash || '#projects';
  if (hash.startsWith('#catalog')) return viewCatalog();
  if (hash.startsWith('#project/')) {
    const id = parseInt(hash.split('/')[1]);
    return viewProject(id);
  }
  return viewDashboard();
}

window.addEventListener('hashchange', route);

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function viewDashboard() {
  UI.setNav('projects');
  UI.render('<div style="padding:40px;text-align:center"><span class="spinner dark"></span></div>');
  const projects = await api.get('/projects');
  const tree = await api.get('/catalog/tree');
  const totalItems = tree.reduce((a, cls) => a + cls.categories.reduce((b, cat) => b + cat.subcategories.reduce((c, sub) => c + sub.item_count, 0), 0), 0);
  const totalSubs  = tree.reduce((a, cls) => a + cls.categories.reduce((b, cat) => b + cat.subcategories.length, 0), 0);

  UI.render(`
    <div style="padding:24px;max-width:1100px;margin:0 auto">
      <div class="page-hdr">
        <div class="page-hdr-left">
          <div class="page-title">Projects</div>
          <div class="page-sub">Manage your building estimation projects</div>
        </div>
        <div class="page-hdr-actions">
          <button class="btn btn-secondary" onclick="location.hash='#catalog'">🗂 Manage Catalog</button>
          <button class="btn btn-primary" onclick="newProjectModal()">+ New Project</button>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card accent">
          <div class="sc-label">Active Projects</div>
          <div class="sc-val">${projects.length}</div>
          <div class="sc-sub">Building jobs</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Catalog Items</div>
          <div class="sc-val">${totalItems}</div>
          <div class="sc-sub">Across ${totalSubs} categories</div>
        </div>
        <div class="stat-card">
          <div class="sc-label">Product Classes</div>
          <div class="sc-val">${tree.length}</div>
          <div class="sc-sub">${tree.map(c => c.name).join(', ')}</div>
        </div>
      </div>

      <div class="project-grid">
        ${projects.map(p => `
          <a class="project-card" href="#project/${p.id}">
            <div class="pc-icon">🏗</div>
            <div class="pc-name">${UI.esc(p.name)}</div>
            <div class="pc-addr">${UI.esc(p.address || '—')}</div>
            <div class="pc-meta">
              <span class="pc-stat"><strong>${p.template_count}</strong> suite types</span>
              <span class="pc-stat"><strong>${p.floor_count}</strong> floors</span>
              <span class="pc-stat">Waste <strong>${Math.round((p.waste_factor - 1) * 100)}%</strong></span>
            </div>
            <div class="pc-date">Updated ${new Date(p.updated_at).toLocaleDateString('en-CA')}</div>
          </a>
        `).join('')}
        <div class="new-project-card" onclick="newProjectModal()">
          <div class="plus">+</div>
          <span>New Project</span>
        </div>
      </div>
    </div>
  `);
}

function newProjectModal() {
  UI.openModal(`
    <div class="modal-hdr">
      <h3>New Project</h3>
      <button class="modal-close" onclick="UI.closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid c2">
        <div class="field" style="grid-column:span 2">
          <label>Building Name *</label>
          <input type="text" id="pName" placeholder="e.g. Riverside Condominiums" />
        </div>
        <div class="field" style="grid-column:span 2">
          <label>Site Address</label>
          <input type="text" id="pAddr" placeholder="123 Main St, City, Province" />
        </div>
        <div class="field">
          <label>Waste Factor</label>
          <select id="pWaste">
            <option value="1.05">5% — Simple</option>
            <option value="1.10" selected>10% — Standard</option>
            <option value="1.15">15% — Complex</option>
            <option value="1.20">20% — High</option>
          </select>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="createProjBtn" onclick="createProject()">Create Project</button>
    </div>
  `);
  document.getElementById('pName').focus();
}

async function createProject() {
  const name = document.getElementById('pName').value.trim();
  if (!name) { UI.toast('Project name is required'); return; }
  const btn = document.getElementById('createProjBtn');
  UI.setLoading(btn, true);
  try {
    const p = await api.post('/projects', { name, address: document.getElementById('pAddr').value, waste_factor: parseFloat(document.getElementById('pWaste').value) });
    UI.closeModal();
    location.hash = `#project/${p.id}`;
  } catch(e) { UI.toast('Error: ' + e.message); UI.setLoading(btn, false); }
}

// ═══════════════════════════════════════════════════════════
// CATALOG VIEW
// ═══════════════════════════════════════════════════════════
async function viewCatalog(subcatId) {
  UI.setNav('catalog');
  if (!STATE.catalogTree) STATE.catalogTree = await api.get('/catalog/tree');

  const activeId = subcatId || STATE.activeSub || STATE.catalogTree[0]?.categories[0]?.subcategories[0]?.id;
  STATE.activeSub = activeId;

  UI.render(`
    <div class="sidebar-layout">
      <aside class="sidebar">
        <div class="sidebar-hdr">Product Catalog</div>
        <div class="sidebar-search">
          <input type="text" placeholder="Search catalog…" id="catTreeSearch" oninput="filterCatalogTree(this.value)" />
        </div>
        <div id="catalogTree">${renderCatalogTree(STATE.catalogTree, activeId)}</div>
      </aside>
      <div class="main-content" id="catalogMain">
        ${activeId ? '<div style="padding:20px;text-align:center"><span class="spinner dark"></span></div>' : '<div class="empty-table"><div class="ico">🗂</div><p>Select a category from the tree</p></div>'}
      </div>
    </div>
  `);

  if (activeId) await loadCatalogItems(activeId);
}

function renderCatalogTree(tree, activeId) {
  return tree.map(cls => `
    <div class="tree-class">
      <div class="tree-class-hdr open" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')">
        <span class="ico">${cls.icon || '📦'}</span>
        <span>${UI.esc(cls.name)}</span>
        <span class="chevron">▶</span>
      </div>
      <div class="tree-categories open">
        ${cls.categories.map(cat => `
          <div>
            <div class="tree-cat-hdr open" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')">
              <span>${UI.esc(cat.name)}</span>
              <span class="chevron">▶</span>
            </div>
            <div class="tree-subs open">
              ${cat.subcategories.map(sub => `
                <div class="tree-sub ${sub.id == activeId ? 'active' : ''}" onclick="selectCatalogSub(${sub.id})" data-id="${sub.id}">
                  <span>${UI.esc(sub.name)}</span>
                  <span class="count">${sub.item_count}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function filterCatalogTree(q) {
  document.querySelectorAll('.tree-sub').forEach(el => {
    el.style.display = !q || el.textContent.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

async function selectCatalogSub(id) {
  STATE.activeSub = id;
  document.querySelectorAll('.tree-sub').forEach(el => el.classList.toggle('active', el.dataset.id == id));
  await loadCatalogItems(id);
}

async function loadCatalogItems(subcatId) {
  const main = document.getElementById('catalogMain');
  if (!main) return;
  main.innerHTML = '<div style="padding:40px;text-align:center"><span class="spinner dark"></span></div>';

  // Find subcategory info from tree
  let subName = '', catName = '', clsName = '';
  for (const cls of STATE.catalogTree) {
    for (const cat of cls.categories) {
      const sub = cat.subcategories.find(s => s.id == subcatId);
      if (sub) { subName = sub.name; catName = cat.name; clsName = cls.name; break; }
    }
  }

  const items = await api.get(`/catalog/items?subcategoryId=${subcatId}`);
  main.innerHTML = renderItemsTable(items, subcatId, subName, catName, clsName);
}

function renderItemsTable(items, subcatId, subName, catName, clsName) {
  const isDoors = clsName === 'Doors';

  return `
    <div style="max-width:1000px">
      <div class="page-hdr">
        <div class="page-hdr-left">
          <div class="breadcrumb">
            <span>${UI.esc(clsName)}</span> / <span>${UI.esc(catName)}</span> / <span>${UI.esc(subName)}</span>
          </div>
          <div class="page-title">${UI.esc(subName)}</div>
          <div class="page-sub">${catName} · ${clsName}</div>
        </div>
        <div class="page-hdr-actions">
          <button class="btn btn-secondary" onclick="catalogImportModal()">⬆ Import CSV</button>
          <a class="btn btn-secondary btn-sm" href="/api/catalog/export/template" download>↓ CSV Template</a>
          <button class="btn btn-primary" onclick="catalogAddItemModal(${subcatId},'${UI.esc(clsName)}')">+ Add Item</button>
        </div>
      </div>

      <div class="table-card">
        <div class="table-toolbar">
          <span class="tt-title">Items</span>
          <span class="tt-count">${items.length} record${items.length !== 1 ? 's' : ''}</span>
          <div class="tt-search">
            <span>🔍</span>
            <input type="text" placeholder="Search items…" id="itemSearch" oninput="filterItemTable(this.value)" />
          </div>
          <div class="tt-spacer"></div>
          <div class="tt-filter">
            <select onchange="filterItemByStock(this.value)">
              <option value="">All Stock</option>
              <option value="1">In Stock</option>
              <option value="0">Out of Stock</option>
            </select>
          </div>
        </div>

        ${items.length === 0 ? `
          <div class="empty-table">
            <div class="ico">📦</div>
            <p>No items yet. Add your first item or import a CSV.</p>
          </div>
        ` : `
          <div style="overflow-x:auto">
            <table class="data-table" id="itemsTable">
              <thead>
                <tr>
                  <th>Item #</th>
                  <th>Name</th>
                  <th>Material</th>
                  <th>Profile / Style</th>
                  ${isDoors ? '<th class="r">Height</th>' : '<th class="r">Width</th><th class="r">Height</th>'}
                  <th>Unit</th>
                  <th>Stock</th>
                  <th class="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr data-stock="${item.in_stock}" data-name="${UI.esc(item.name).toLowerCase()}" data-item="${UI.esc(item.item_number || '').toLowerCase()}">
                    <td class="mono">${item.item_number ? `<span class="badge bdg-gray">${UI.esc(item.item_number)}</span>` : '<span class="dim">—</span>'}</td>
                    <td class="fw">${UI.esc(item.name)}</td>
                    <td>${UI.esc(item.material || '—')}</td>
                    <td>${UI.esc(item.profile || '—')}</td>
                    ${isDoors
                      ? `<td class="r dim">${item.height_in ? item.height_in + '"' : '—'}</td>`
                      : `<td class="r dim">${item.width_in ? item.width_in + '"' : '—'}</td><td class="r dim">${item.height_in ? item.height_in + '"' : '—'}</td>`
                    }
                    <td><span class="badge bdg-blue">${UI.esc(item.unit)}</span></td>
                    <td>${item.in_stock ? '<span class="badge bdg-dot bdg-green">In Stock</span>' : '<span class="badge bdg-dot bdg-red">Out</span>'}</td>
                    <td class="r">
                      <div class="tbl-actions">
                        <button class="btn btn-ghost btn-xs" onclick="catalogEditItemModal(${item.id})">Edit</button>
                        <button class="btn btn-danger btn-xs" onclick="catalogDeleteItem(${item.id})">Delete</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    </div>
  `;
}

function filterItemTable(q) {
  document.querySelectorAll('#itemsTable tbody tr').forEach(tr => {
    const match = !q || tr.dataset.name.includes(q.toLowerCase()) || tr.dataset.item.includes(q.toLowerCase());
    tr.style.display = match ? '' : 'none';
  });
}
function filterItemByStock(val) {
  document.querySelectorAll('#itemsTable tbody tr').forEach(tr => {
    tr.style.display = !val || tr.dataset.stock === val ? '' : 'none';
  });
}

// Catalog CRUD modals
function catalogAddItemModal(subcatId, clsName) {
  const isDoors = clsName === 'Doors';
  UI.openModal(`
    <div class="modal-hdr">
      <h3>Add Item</h3>
      <button class="modal-close" onclick="UI.closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid c2">
        <div class="field"><label>Item Number / SKU</label><input type="text" id="iNum" placeholder="e.g. BB-COL-FJP" /></div>
        <div class="field" style="grid-column:span 2"><label>Name *</label><input type="text" id="iName" /></div>
        <div class="field" style="grid-column:span 2"><label>Description</label><input type="text" id="iDesc" /></div>
        <div class="field"><label>Material</label><input type="text" id="iMat" placeholder="e.g. Finger Joint Pine" /></div>
        <div class="field"><label>Profile / Style</label><input type="text" id="iProf" placeholder="e.g. Colonial" /></div>
        ${isDoors
          ? `<div class="field"><label>Height (in)</label><input type="number" id="iH" placeholder="80" /></div>`
          : `<div class="field"><label>Width (in)</label><input type="number" id="iW" placeholder="0.5" step="0.01"/></div>
             <div class="field"><label>Height (in)</label><input type="number" id="iH" placeholder="3.5" step="0.01"/></div>
             <div class="field"><label>Stock Length (ft)</label><input type="number" id="iStockLen" placeholder="16" step="1"/></div>`
        }
        <div class="field"><label>Unit</label><select id="iUnit"><option value="EA">EA — Each</option><option value="LF">LF — Linear Foot</option></select></div>
        <div class="field"><label>Stock Status</label><select id="iStock"><option value="1">In Stock</option><option value="0">Out of Stock</option></select></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="saveItemBtn" onclick="catalogSaveNewItem(${subcatId})">Add Item</button>
    </div>
  `);
  document.getElementById('iNum').focus();
}

async function catalogSaveNewItem(subcatId) {
  const name = document.getElementById('iName').value.trim();
  if (!name) { UI.toast('Name is required'); return; }
  const btn = document.getElementById('saveItemBtn');
  UI.setLoading(btn, true);
  try {
    await api.post('/catalog/items', {
      subcategory_id: subcatId,
      item_number: document.getElementById('iNum').value.trim() || null,
      name,
      description: document.getElementById('iDesc').value,
      material: document.getElementById('iMat').value,
      profile: document.getElementById('iProf').value,
      width_in: parseFloat(document.getElementById('iW')?.value) || null,
      height_in: parseFloat(document.getElementById('iH').value) || null,
      stock_length_ft: parseFloat(document.getElementById('iStockLen')?.value) || null,
      unit: document.getElementById('iUnit').value,
      in_stock: parseInt(document.getElementById('iStock').value)
    });
    UI.closeModal();
    UI.toast('Item added');
    STATE.catalogTree = null; // refresh tree
    await loadCatalogItems(subcatId);
    STATE.catalogTree = await api.get('/catalog/tree');
    document.getElementById('catalogTree').innerHTML = renderCatalogTree(STATE.catalogTree, subcatId);
  } catch(e) { UI.toast('Error: ' + e.message); UI.setLoading(btn, false); }
}

async function catalogEditItemModal(itemId) {
  const items = await api.get(`/catalog/items?subcategoryId=0`);
  const r = await fetch(`/api/catalog/items?search=`);
  // fetch item directly
  const res = await fetch(`/api/catalog/items/${itemId}`);
  const j = await res.json();
  // Since we don't have a GET single endpoint, get from current list
  const trs = document.querySelectorAll('#itemsTable tbody tr');
  // Just re-fetch the subcategory items and find by id
  const allItems = await api.get(`/catalog/items?subcategoryId=${STATE.activeSub}`);
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  UI.openModal(`
    <div class="modal-hdr">
      <h3>Edit Item</h3>
      <button class="modal-close" onclick="UI.closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid c2">
        <div class="field"><label>Item Number / SKU</label><input type="text" id="iNum" value="${UI.esc(item.item_number || '')}" /></div>
        <div class="field" style="grid-column:span 2"><label>Name *</label><input type="text" id="iName" value="${UI.esc(item.name)}" /></div>
        <div class="field" style="grid-column:span 2"><label>Description</label><input type="text" id="iDesc" value="${UI.esc(item.description || '')}" /></div>
        <div class="field"><label>Material</label><input type="text" id="iMat" value="${UI.esc(item.material || '')}" /></div>
        <div class="field"><label>Profile / Style</label><input type="text" id="iProf" value="${UI.esc(item.profile || '')}" /></div>
        <div class="field"><label>Width (in)</label><input type="number" id="iW" value="${item.width_in ?? ''}" step="0.01" /></div>
        <div class="field"><label>Height (in)</label><input type="number" id="iH" value="${item.height_in ?? ''}" step="0.01" /></div>
        <div class="field"><label>Stock Length (ft)</label><input type="number" id="iStockLen" value="${item.stock_length_ft ?? ''}" step="1" placeholder="e.g. 16" /></div>
        <div class="field"><label>Unit</label>
          <select id="iUnit">
            <option value="EA" ${item.unit==='EA'?'selected':''}>EA — Each</option>
            <option value="LF" ${item.unit==='LF'?'selected':''}>LF — Linear Foot</option>
          </select>
        </div>
        <div class="field"><label>Stock Status</label>
          <select id="iStock">
            <option value="1" ${item.in_stock?'selected':''}>In Stock</option>
            <option value="0" ${!item.in_stock?'selected':''}>Out of Stock</option>
          </select>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" id="saveItemBtn" onclick="catalogUpdateItem(${itemId},${item.subcategory_id})">Save Changes</button>
    </div>
  `);
}

async function catalogUpdateItem(itemId, subcatId) {
  const name = document.getElementById('iName').value.trim();
  if (!name) { UI.toast('Name is required'); return; }
  const btn = document.getElementById('saveItemBtn');
  UI.setLoading(btn, true);
  try {
    await api.put(`/catalog/items/${itemId}`, {
      subcategory_id: subcatId,
      item_number: document.getElementById('iNum').value.trim() || null,
      name,
      description: document.getElementById('iDesc').value,
      material: document.getElementById('iMat').value,
      profile: document.getElementById('iProf').value,
      width_in: parseFloat(document.getElementById('iW').value) || null,
      height_in: parseFloat(document.getElementById('iH').value) || null,
      stock_length_ft: parseFloat(document.getElementById('iStockLen').value) || null,
      unit: document.getElementById('iUnit').value,
      in_stock: parseInt(document.getElementById('iStock').value)
    });
    UI.closeModal();
    UI.toast('Changes saved');
    await loadCatalogItems(subcatId);
  } catch(e) { UI.toast('Error: ' + e.message); UI.setLoading(btn, false); }
}

async function catalogDeleteItem(itemId) {
  if (!UI.confirm('Delete this item? This cannot be undone.')) return;
  try {
    await api.del(`/catalog/items/${itemId}`);
    UI.toast('Item deleted');
    STATE.catalogTree = null;
    await loadCatalogItems(STATE.activeSub);
    STATE.catalogTree = await api.get('/catalog/tree');
    document.getElementById('catalogTree').innerHTML = renderCatalogTree(STATE.catalogTree, STATE.activeSub);
  } catch(e) { UI.toast('Error: ' + e.message); }
}

// ── CSV Import ────────────────────────────────────────────
function catalogImportModal() {
  UI.openModal(`
    <div class="modal-hdr">
      <h3>Import Catalog Items — CSV</h3>
      <button class="modal-close" onclick="UI.closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="callout">
        Required columns: <strong>class, category, subcategory, item_number, name</strong><br>
        Optional: description, material, profile, width_in, height_in, unit (EA/LF), in_stock (1/0)<br>
        Existing item numbers will be updated. New ones will be inserted.
      </div>
      <a href="/api/catalog/export/template" download class="btn btn-secondary btn-sm" style="margin-bottom:14px;display:inline-flex">↓ Download CSV Template</a>
      <div class="upload-zone" id="csvZone" onclick="document.getElementById('csvFile').click()"
        ondragover="event.preventDefault();this.classList.add('drag')"
        ondragleave="this.classList.remove('drag')"
        ondrop="event.preventDefault();this.classList.remove('drag');handleCSVDrop(event)">
        <div class="uz-ico">📄</div>
        <p>Click to upload or drag & drop<br><small>CSV files only</small></p>
        <input type="file" id="csvFile" accept=".csv,text/csv" onchange="handleCSVFile(this.files[0])" />
      </div>
      <div id="csvPreview"></div>
    </div>
    <div class="modal-foot" id="csvFoot">
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>
    </div>
  `, true);
}

function handleCSVDrop(e) { handleCSVFile(e.dataTransfer.files[0]); }

function handleCSVFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => parseCSVPreview(e.target.result);
  reader.readAsText(file);
}

function parseCSVPreview(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) { UI.toast('CSV must have a header row and at least one data row'); return; }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || [];
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
    return obj;
  });

  window._csvRows = rows;

  const preview = rows.slice(0, 8);
  document.getElementById('csvPreview').innerHTML = `
    <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:8px">${rows.length} row${rows.length!==1?'s':''} detected · Showing first 8</p>
    <div class="preview-wrap">
      <table class="preview-table">
        <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${preview.map(r=>`<tr>${headers.map(h=>`<td>${UI.esc(r[h]||'')}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;
  document.getElementById('csvFoot').innerHTML = `
    <button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>
    <button class="btn btn-primary" id="importBtn" onclick="runCSVImport()">Import ${rows.length} Rows</button>
  `;
}

async function runCSVImport() {
  const rows = window._csvRows;
  if (!rows?.length) return;
  const btn = document.getElementById('importBtn');
  UI.setLoading(btn, true);
  try {
    const result = await api.post('/catalog/import', { rows });
    let html = `<div class="import-result import-ok">✓ Imported / updated <strong>${result.imported}</strong> item${result.imported!==1?'s':''}</div>`;
    if (result.errors.length) {
      html += `<div class="import-result import-err">⚠ ${result.errors.length} error${result.errors.length!==1?'s':''}:<br>${result.errors.map(e=>`<div style="margin-top:4px;font-size:.75rem">${UI.esc(e)}</div>`).join('')}</div>`;
    }
    document.getElementById('csvPreview').innerHTML = html;
    document.getElementById('csvFoot').innerHTML = '<button class="btn btn-primary" onclick="UI.closeModal();refreshAfterImport()">Done</button>';
  } catch(e) { UI.toast('Import failed: ' + e.message); UI.setLoading(btn, false); }
}

async function refreshAfterImport() {
  STATE.catalogTree = null;
  if (STATE.activeSub) await loadCatalogItems(STATE.activeSub);
  STATE.catalogTree = await api.get('/catalog/tree');
  document.getElementById('catalogTree').innerHTML = renderCatalogTree(STATE.catalogTree, STATE.activeSub);
  UI.toast('Catalog refreshed');
}

// ═══════════════════════════════════════════════════════════
// PROJECT EDITOR
// ═══════════════════════════════════════════════════════════
async function viewProject(id) {
  UI.setNav('');
  UI.render('<div style="padding:40px;text-align:center"><span class="spinner dark"></span></div>');
  const data = await api.get(`/projects/${id}`);
  STATE.project = data;
  renderProjectEditor();
}

function renderProjectEditor() {
  const { project, templates, floors } = STATE.project;
  const tab = STATE.projectTab;

  const shell = `
    <div class="editor-layout">
      <div class="editor-topbar">
        <a class="editor-back" href="#projects">← Projects</a>
        <div class="editor-title">${UI.esc(project.name)}</div>
        <div class="editor-tabs">
          <button class="etab ${tab==='setup'?'active':''}"     onclick="switchProjectTab('setup')">⚙ Setup</button>
          <button class="etab ${tab==='templates'?'active':''}" onclick="switchProjectTab('templates')">📐 Suite Templates</button>
          <button class="etab ${tab==='floors'?'active':''}"    onclick="switchProjectTab('floors')">🏢 Floors & Units</button>
          <button class="etab ${tab==='specs'?'active':''}"     onclick="switchProjectTab('specs')">🎨 Material Specs</button>
          <button class="etab ${tab==='summary'?'active':''}"   onclick="switchProjectTab('summary')">📋 Summary</button>
        </div>
      </div>
      <div class="editor-body" id="editorBody"></div>
    </div>
  `;
  UI.render(shell);
  renderProjectTab();
}

function switchProjectTab(tab) {
  if (STATE.projectTab === 'templates' && tab !== 'templates') {
    const hasUnsaved = STATE.project?.templates?.some(t => t.rooms?.some(r => !r.id));
    if (hasUnsaved && !UI.confirm('You have unsaved rooms. Leave without saving?')) return;
  }
  STATE.projectTab = tab;
  document.querySelectorAll('.etab').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tab)));
  renderProjectTab();
}

function renderProjectTab() {
  const tab = STATE.projectTab;
  const body = document.getElementById('editorBody');
  if (!body) return;
  if (tab === 'setup')     body.innerHTML = renderSetupTab();
  if (tab === 'templates') body.innerHTML = renderTemplatesTab();
  if (tab === 'floors')    body.innerHTML = renderFloorsTab();
  if (tab === 'specs')     loadAndRenderSpecsTab();
  if (tab === 'summary')   body.innerHTML = renderSummaryTab();
}

async function loadAndRenderSpecsTab() {
  const body = document.getElementById('editorBody');
  if (!_allCatalogItems) {
    body.innerHTML = '<div style="padding:40px;text-align:center"><span class="spinner dark"></span></div>';
    _allCatalogItems = await api.get('/catalog/items?search=');
  }
  body.innerHTML = renderSpecsTab();
}

// ── Setup Tab ─────────────────────────────────────────────
function renderSetupTab() {
  const { project } = STATE.project;
  return `
    <div style="max-width:600px">
      <div class="form-card">
        <div class="form-card-title">Building Information</div>
        <div class="form-grid c2">
          <div class="field" style="grid-column:span 2">
            <label>Building Name *</label>
            <input type="text" id="spName" value="${UI.esc(project.name)}" />
          </div>
          <div class="field" style="grid-column:span 2">
            <label>Site Address</label>
            <input type="text" id="spAddr" value="${UI.esc(project.address || '')}" />
          </div>
          <div class="field">
            <label>Waste Factor</label>
            <select id="spWaste">
              <option value="1.05" ${project.waste_factor==1.05?'selected':''}>5% — Simple</option>
              <option value="1.10" ${project.waste_factor==1.10?'selected':''}>10% — Standard</option>
              <option value="1.15" ${project.waste_factor==1.15?'selected':''}>15% — Complex</option>
              <option value="1.20" ${project.waste_factor==1.20?'selected':''}>20% — High</option>
            </select>
          </div>
          <div class="field">
            <label>Notes</label>
            <input type="text" id="spNotes" value="${UI.esc(project.notes || '')}" placeholder="Optional notes" />
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="btn btn-primary" onclick="saveSetup()">Save Changes</button>
          <button class="btn btn-danger" onclick="deleteProject()">Delete Project</button>
        </div>
      </div>

      <div class="form-card">
        <div class="form-card-title">Project Overview</div>
        <div class="stat-grid">
          <div onclick="switchProjectTab('templates')" style="cursor:pointer">${statChip('📐', STATE.project.templates.length, 'Suite Templates')}</div>
          <div onclick="switchProjectTab('floors')" style="cursor:pointer">${statChip('🏢', STATE.project.floors.length, 'Floors')}</div>
          <div>${statChip('🚪', STATE.project.floors.reduce((a,f)=>a+f.units.length,0), 'Total Units')}</div>
        </div>
      </div>
    </div>
  `;
}

function statChip(ico, val, label) {
  return `<div class="stat-card"><div class="sc-label">${label}</div><div class="sc-val">${ico} ${val}</div></div>`;
}

async function saveSetup() {
  const p = STATE.project.project;
  try {
    const updated = await api.put(`/projects/${p.id}`, {
      name: document.getElementById('spName').value,
      address: document.getElementById('spAddr').value,
      waste_factor: parseFloat(document.getElementById('spWaste').value),
      notes: document.getElementById('spNotes').value
    });
    STATE.project.project = updated;
    document.querySelector('.editor-title').textContent = updated.name;
    UI.toast('Project saved');
  } catch(e) { UI.toast('Error: ' + e.message); }
}

async function deleteProject() {
  if (!UI.confirm(`Delete "${STATE.project.project.name}"? This cannot be undone.`)) return;
  await api.del(`/projects/${STATE.project.project.id}`);
  location.hash = '#projects';
}

// ── Templates Tab ─────────────────────────────────────────
let _activeTplId = null;

function renderTemplatesTab() {
  const { templates } = STATE.project;
  const active = _activeTplId ? templates.find(t => t.id === _activeTplId) : templates[0];
  if (active) _activeTplId = active.id;

  const unitCounts = {};
  STATE.project.floors.forEach(f => f.units.forEach(u => {
    if (u.template_id) unitCounts[u.template_id] = (unitCounts[u.template_id] || 0) + 1;
  }));

  return `
    <div style="display:grid;grid-template-columns:240px 1fr;gap:16px;max-width:1000px">
      <div>
        <div class="form-card" style="padding:12px">
          <div class="form-card-title">Suite Types</div>
          ${templates.map(t => `
            <div class="list-row ${t.id===_activeTplId?'list-row-active':''}" onclick="_activeTplId=${t.id};renderProjectTab()" style="padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .1s;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-weight:600;font-size:.88rem">${UI.esc(t.name)}</div>
                <div style="font-size:.72rem;color:var(--text-muted)">${unitCounts[t.id]||0} unit${(unitCounts[t.id]||0)!==1?'s':''} · ${t.rooms.length} room${t.rooms.length!==1?'s':''}</div>
              </div>
              <button class="btn btn-danger btn-xs" onclick="event.stopPropagation();deleteTemplate(${t.id})">×</button>
            </div>
          `).join('')}
          <button class="btn btn-outline" style="width:100%;margin-top:8px;justify-content:center" onclick="addTemplate()">+ Add Template</button>
        </div>
      </div>
      <div>
        ${active ? renderTemplateEditor(active) : '<div class="form-card"><p style="color:var(--text-muted);font-size:.85rem">Select a template or create one.</p></div>'}
      </div>
    </div>
  `;
}

function renderTemplateEditor(tpl) {
  return `
    <div class="form-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:200px;margin:0">
          <label>Template Name</label>
          <input type="text" id="tplName_${tpl.id}" value="${UI.esc(tpl.name)}" />
        </div>
        <div class="field" style="width:110px;margin:0">
          <label>Default Door Height (in)</label>
          <input type="number" id="defH_tpl_${tpl.id}" value="${tpl.default_door_height || 80}" min="60" max="120" />
        </div>
        <div style="margin-top:18px;display:flex;gap:8px">
          ${_tplDirty.has(tpl.id)
            ? `<button class="btn btn-primary" onclick="saveTemplate(${tpl.id})">Save Template</button>`
            : `<button class="btn btn-primary" style="background:#16a34a;border-color:#16a34a" onclick="saveTemplate(${tpl.id})">✓ Template Saved</button>`
          }
          <button class="btn btn-outline" onclick="addRoomToTemplate(${tpl.id})">+ Add Room</button>
        </div>
      </div>
      <div class="callout">Drawing quantities from AI or manual entry. Field quantities captured on site. Summary uses field if set, otherwise drawing.</div>
      ${tpl.rooms.map((r, ri) => renderRoomBlock('tpl', tpl.id, r, ri, tpl.default_door_height || 80)).join('')}
      <button class="btn-add-row" onclick="addRoomToTemplate(${tpl.id})">+ Add Room</button>
    </div>
  `;
}

function addRoomToTemplate(tplId) {
  const tpl = STATE.project.templates.find(t => t.id === tplId);
  tpl.rooms.push({ id: null, name: 'New Room', notes: '', doors: [], trim: [] });
  _tplDirty.add(tplId);
  renderProjectTab();
}

async function addTemplate() {
  const name = prompt('Suite template name (e.g. "2BR Corner"):');
  if (!name) return;
  try {
    const t = await api.post(`/projects/${STATE.project.project.id}/templates`, { name });
    t.rooms = [];
    STATE.project.templates.push(t);
    _activeTplId = t.id;
    renderProjectTab();
  } catch(e) { UI.toast('Error: ' + e.message); }
}

async function deleteTemplate(id) {
  if (!UI.confirm('Delete this template? Units assigned to it will lose their template.')) return;
  await api.del(`/templates/${id}`);
  STATE.project.templates = STATE.project.templates.filter(t => t.id !== id);
  if (_activeTplId === id) _activeTplId = STATE.project.templates[0]?.id || null;
  renderProjectTab();
}

function getRequiredBedrooms(name) {
  const m = name.match(/(\d+)BR/i);
  return m ? parseInt(m[1]) : 0;
}

function isBedroomRoom(name) {
  // matches "Bedroom 1", "BR1", "BR 2", "Master Bedroom", etc.
  return /(bedroom|\bbr\s*\d)/i.test(name);
}

async function saveTemplate(tplId) {
  const tpl = STATE.project.templates.find(t => t.id === tplId);
  const name = document.getElementById(`tplName_${tplId}`)?.value || tpl.name;
  const defH = parseInt(document.getElementById(`defH_tpl_${tplId}`)?.value) || tpl.default_door_height || 80;
  tpl.default_door_height = defH;

  const required = getRequiredBedrooms(name);
  if (required > 0) {
    const bedroomRooms = tpl.rooms.filter(r => isBedroomRoom(r.name));
    if (bedroomRooms.length < required) {
      UI.toast(`⚠ A ${required}BR template needs ${required} bedroom${required>1?'s':''} — found ${bedroomRooms.length}. Add the missing bedroom room(s) before saving.`);
      return;
    }
  }

  try {
    await api.put(`/templates/${tplId}`, { name, default_door_height: defH, rooms: tpl.rooms });
    tpl.name = name;
    _tplDirty.delete(tplId);
    UI.toast('Template saved');
    // refresh from server to get proper IDs
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    renderProjectTab();
  } catch(e) { UI.toast('Error: ' + e.message); }
}

async function saveRoom(tplId, ri) {
  const tpl = STATE.project.templates.find(t => t.id === tplId);
  const name = document.getElementById(`tplName_${tplId}`)?.value || tpl.name;
  const defH = parseInt(document.getElementById(`defH_tpl_${tplId}`)?.value) || tpl.default_door_height || 80;
  tpl.default_door_height = defH;
  try {
    await api.put(`/templates/${tplId}`, { name, default_door_height: defH, rooms: tpl.rooms });
    tpl.name = name;
    _tplDirty.delete(tplId);
    const required = getRequiredBedrooms(name);
    const savedRoomIsBedrm = isBedroomRoom(tpl.rooms[ri]?.name || '');
    if (required > 0 && savedRoomIsBedrm) {
      const bedroomCount = tpl.rooms.filter(r => isBedroomRoom(r.name)).length;
      UI.toast(bedroomCount >= required
        ? `✓ All bedrooms saved — use Save Template to finalize`
        : `Room saved (${bedroomCount}/${required} bedrooms)`);
    } else {
      UI.toast('Room saved');
    }
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    renderProjectTab();
  } catch(e) { UI.toast('Error: ' + e.message); }
}

// ── Floors Tab ────────────────────────────────────────────
let _activeFloorIdx = 0;
const _floorDirty = new Set(); // floor IDs with unsaved changes
const _tplDirty = new Set();   // template IDs with unsaved changes

function renderFloorsTab() {
  const { floors } = STATE.project;
  if (_activeFloorIdx >= floors.length) _activeFloorIdx = 0;
  const floor = floors[_activeFloorIdx];

  return `
    <div style="max-width:900px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${floors.map((f, i) => `
          <button class="etab ${i===_activeFloorIdx?'active':''}" style="border-radius:20px;border:1.5px solid ${i===_activeFloorIdx?'var(--brand)':'var(--border)'}" onclick="_activeFloorIdx=${i};renderProjectTab()">${UI.esc(f.name)}</button>
        `).join('')}
        <button class="btn btn-outline btn-sm" onclick="addFloor()">+ Floor</button>
      </div>
      ${floor ? renderFloorEditor(floor, _activeFloorIdx) : '<div class="form-card"><p style="color:var(--text-muted)">Add a floor to get started.</p></div>'}
    </div>
  `;
}

function renderFloorEditor(floor, idx) {
  const templates = STATE.project.templates;
  return `
    <div class="form-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:160px;margin:0">
          <label>Floor Name</label>
          <input type="text" id="flName_${floor.id}" value="${UI.esc(floor.name)}" />
        </div>
        <div style="margin-top:18px;display:flex;gap:8px">
          ${_floorDirty.has(floor.id)
            ? `<button class="btn btn-primary" onclick="saveFloor(${floor.id})">Save Floor</button>`
            : `<button class="btn btn-primary" style="background:#16a34a;border-color:#16a34a" onclick="saveFloor(${floor.id})">✓ Floor Saved</button>`
          }
          <button class="btn btn-secondary" onclick="duplicateFloor(${idx})">📋 Duplicate</button>
          <button class="btn btn-danger" onclick="deleteFloor(${floor.id})">Delete</button>
        </div>
      </div>

      <div class="form-card-title" style="margin-top:4px">Suite Units</div>

      <div style="display:flex;align-items:flex-end;gap:8px;margin-bottom:14px;padding:10px 12px;background:var(--bg-subtle, #f5f5f5);border-radius:8px;flex-wrap:wrap;border:1px solid var(--border)">
        <div class="field" style="flex:1;min-width:160px;margin:0">
          <label>Template</label>
          <select id="bulkTpl_${floor.id}">
            <option value="">— Select template —</option>
            ${templates.map(t=>`<option value="${t.id}">${UI.esc(t.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="width:70px;margin:0">
          <label>Qty</label>
          <input type="number" id="bulkQty_${floor.id}" value="1" min="1" max="99" />
        </div>
        <button class="btn btn-primary" style="margin-bottom:1px" onclick="addUnitsByTemplate(${floor.id})">+ Add Units</button>
      </div>

      <div class="units-grid">
        ${floor.units.map(u => {
          const tpl = templates.find(t => t.id === u.template_id);
          return `<div class="unit-chip ${tpl?'has-tpl':''}" onclick="editUnitModal(${floor.id},'${u._localId||u.id}','${UI.esc(u.name)}',${u.template_id||'null'})">
            <button class="ud" onclick="event.stopPropagation();removeUnit(${floor.id},'${u._localId||u.id}')">×</button>
            <div class="un">${UI.esc(u.name)}</div>
            <div class="ut">${tpl ? UI.esc(tpl.name) : 'No template'}</div>
          </div>`;
        }).join('')}
        <div class="unit-chip add" onclick="addUnit(${floor.id})">
          <span class="plus">+</span>
          <span>Add Unit</span>
        </div>
      </div>

      <hr class="divider" />
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;flex-wrap:wrap">
        <div class="form-card-title" style="margin-bottom:0">Common Areas</div>
        <div class="field" style="width:110px;margin:0">
          <label>Default Door Height (in)</label>
          <input type="number" id="defH_floor_${floor.id}" value="${floor.default_door_height || 80}" min="60" max="120" />
        </div>
      </div>
      <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:12px">Hallways, laundry rooms, amenity spaces, suite entrance doors</p>
      ${floor.commonRooms.map((r, ri) => renderRoomBlock('floor', floor.id, r, ri, floor.default_door_height || 80)).join('')}
      <button class="btn-add-row" onclick="addCommonRoom(${floor.id})">+ Add Common Area</button>
    </div>
  `;
}

async function addFloor() {
  const n = STATE.project.floors.length + 1;
  const f = await api.post(`/projects/${STATE.project.project.id}/floors`, { name: `Floor ${n}` });
  f.units = []; f.commonRooms = [];
  STATE.project.floors.push(f);
  _activeFloorIdx = STATE.project.floors.length - 1;
  renderProjectTab();
}

async function deleteFloor(id) {
  if (!UI.confirm('Delete this floor?')) return;
  await api.del(`/floors/${id}`);
  STATE.project.floors = STATE.project.floors.filter(f => f.id !== id);
  if (_activeFloorIdx >= STATE.project.floors.length) _activeFloorIdx = Math.max(0, STATE.project.floors.length - 1);
  renderProjectTab();
}

function duplicateFloor(fromIdx) {
  const src = STATE.project.floors[fromIdx];
  const n = STATE.project.floors.length + 1;
  const copy = {
    id: null, name: `Floor ${n}`,
    units: src.units.map(u => ({ ...u, id: null, _localId: '_' + Math.random().toString(36).slice(2) })),
    commonRooms: src.commonRooms.map(r => ({ ...r, id: null, doors: [...r.doors.map(d=>({...d,id:null}))], trim: [...r.trim.map(t=>({...t,id:null}))] }))
  };
  STATE.project.floors.push(copy);
  _activeFloorIdx = STATE.project.floors.length - 1;
  renderProjectTab();
  // Auto-save the duplicate
  const flr = STATE.project.floors[_activeFloorIdx];
  (async () => {
    const saved = await api.post(`/projects/${STATE.project.project.id}/floors`, { name: copy.name });
    flr.id = saved.id;
    await api.put(`/floors/${saved.id}`, { name: copy.name, units: copy.units, commonRooms: copy.commonRooms });
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    renderProjectTab();
    UI.toast(`Floor ${n} duplicated`);
  })();
}

async function saveFloor(floorId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  const name = document.getElementById(`flName_${floorId}`)?.value || floor.name;
  const defH = parseInt(document.getElementById(`defH_floor_${floorId}`)?.value) || floor.default_door_height || 80;
  floor.default_door_height = defH;
  try {
    await api.put(`/floors/${floorId}`, { name, default_door_height: defH, units: floor.units, commonRooms: floor.commonRooms });
    floor.name = name;
    _floorDirty.delete(floorId);
    UI.toast('Floor saved');
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    renderProjectTab();
  } catch(e) { UI.toast('Error: ' + e.message); }
}

async function saveCommonRoom(floorId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  const name = document.getElementById(`flName_${floorId}`)?.value || floor.name;
  const defH = parseInt(document.getElementById(`defH_floor_${floorId}`)?.value) || floor.default_door_height || 80;
  floor.default_door_height = defH;
  try {
    await api.put(`/floors/${floorId}`, { name, default_door_height: defH, units: floor.units, commonRooms: floor.commonRooms });
    floor.name = name;
    _floorDirty.delete(floorId);
    UI.toast('Common area saved');
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    renderProjectTab();
  } catch(e) { UI.toast('Error: ' + e.message); }
}

function addUnit(floorId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  const n = floor.units.length + 1;
  floor.units.push({ id: null, _localId: '_' + Math.random().toString(36).slice(2), name: String(n).padStart(2,'0'), template_id: null });
  _floorDirty.add(floorId);
  renderProjectTab();
}

function addUnitsByTemplate(floorId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  const tplId = parseInt(document.getElementById(`bulkTpl_${floorId}`)?.value) || null;
  const qty   = Math.max(1, parseInt(document.getElementById(`bulkQty_${floorId}`)?.value) || 1);
  if (!tplId) { UI.toast('Select a template first'); return; }

  // Extract leading floor number for unit naming (e.g. "Floor 2" → "2", "Level 12" → "12")
  const floorNum = floor.name.match(/\d+/)?.[0] || '';

  for (let i = 0; i < qty; i++) {
    const seq = floor.units.length + 1;
    const unitName = floorNum
      ? `${floorNum}${String(seq).padStart(2, '0')}`
      : String(seq).padStart(2, '0');
    floor.units.push({ id: null, _localId: '_' + Math.random().toString(36).slice(2), name: unitName, template_id: tplId });
  }
  _floorDirty.add(floorId);
  renderProjectTab();
}

function removeUnit(floorId, unitLocalId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  floor.units = floor.units.filter(u => (u._localId || u.id) != unitLocalId);
  _floorDirty.add(floorId);
  renderProjectTab();
}

function editUnitModal(floorId, unitLocalId, unitName, templateId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  const unit = floor.units.find(u => (u._localId || u.id) == unitLocalId);
  UI.openModal(`
    <div class="modal-hdr">
      <h3>Edit Unit</h3>
      <button class="modal-close" onclick="UI.closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field"><label>Unit Number / Name</label><input type="text" id="uName" value="${UI.esc(unitName)}" /></div>
        <div class="field"><label>Floor Plan Template</label>
          <select id="uTpl">
            <option value="">— No template assigned —</option>
            ${STATE.project.templates.map(t=>`<option value="${t.id}" ${t.id==templateId?'selected':''}>${UI.esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-danger btn-sm" onclick="removeUnit(${floorId},'${unitLocalId}');UI.closeModal()">Delete Unit</button>
      <button class="btn btn-secondary" onclick="UI.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveUnitEdit(${floorId},'${unitLocalId}')">Save</button>
    </div>
  `);
}

function saveUnitEdit(floorId, unitLocalId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  const unit = floor.units.find(u => (u._localId || u.id) == unitLocalId);
  unit.name = document.getElementById('uName').value || unit.name;
  unit.template_id = parseInt(document.getElementById('uTpl').value) || null;
  UI.closeModal();
  _floorDirty.add(floorId);
  renderProjectTab();
}

function addCommonRoom(floorId) {
  const floor = STATE.project.floors.find(f => f.id === floorId);
  floor.commonRooms.push({ id: null, name: 'Common Area', notes: '', doors: [], trim: [] });
  _floorDirty.add(floorId);
  renderProjectTab();
}

// ── Shared Room Block ─────────────────────────────────────
function renderRoomBlock(type, parentId, room, ri, defaultHeight = 80) {
  const key = `${type}_${parentId}_${ri}`;
  return `
    <div class="room-block" id="rb_${key}">
      <div class="room-block-hdr">
        <input class="room-name-inp" type="text" value="${UI.esc(room.name)}"
          onchange="updateRoomName('${type}',${parentId},${ri},this.value)" />
        ${type === 'floor' ? `
          ${!room.id ? '<span style="font-size:.7rem;color:#f59e0b;font-weight:600;white-space:nowrap">● Unsaved</span>' : ''}
          <button class="btn btn-primary btn-xs" onclick="saveCommonRoom(${parentId})">Save</button>
        ` : ''}
        <button class="btn btn-danger btn-xs" onclick="removeRoom('${type}',${parentId},${ri})">Remove</button>
      </div>
      <div class="room-block-body">
        <div class="sec-divider">🚪 Doors</div>
        <div class="grid-hdr door-row"><span>Type</span><span class="r">W (in)</span><span class="r">H (in)</span><span class="r">Dwg Qty</span><span class="r">Field Qty</span><span></span></div>
        ${room.doors.map((d, di) => {
          const h = d.height_in ?? defaultHeight;
          const isOverride = d.height_in != null && d.height_in !== defaultHeight;
          const isCustomW = !DOOR_WIDTHS.includes(Number(d.width_in));
          return `
          <div class="door-row">
            <select class="row-input row-select" onchange="updateDoor('${type}',${parentId},${ri},${di},'type',this.value)">
              ${DOOR_TYPES.map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}
            </select>
            <div>
              ${isCustomW
                ? `<input class="row-input" type="number" value="${d.width_in||''}" placeholder="in" onchange="updateDoor('${type}',${parentId},${ri},${di},'width_in',this.value)" />`
                : `<select class="row-input row-select" onchange="updateDoor('${type}',${parentId},${ri},${di},'width_in',this.value)">
                    ${DOOR_WIDTHS.filter(w=>d.type==='Bifold'?w>=24:true).map(w=>`<option value="${w}" ${d.width_in==w?'selected':''}>${w}"</option>`).join('')}
                  </select>`
              }
              <label style="font-size:.68rem;display:flex;align-items:center;gap:3px;margin-top:2px;cursor:pointer;color:var(--text-muted)">
                <input type="checkbox" ${isCustomW?'checked':''} onchange="toggleCustomWidth('${type}',${parentId},${ri},${di},this.checked)" style="width:auto;margin:0" />
                Custom
              </label>
            </div>
            <input class="row-input" type="number" value="${h}" placeholder="${defaultHeight}" title="${isOverride?'Height overridden':'Inherits default height'}" style="${isOverride?'border-color:var(--brand);':'opacity:.7;'}" onchange="updateDoor('${type}',${parentId},${ri},${di},'height_in',this.value)" />
            <input class="row-input" type="number" value="${d.qty_drawing??''}" placeholder="—" onchange="updateDoor('${type}',${parentId},${ri},${di},'qty_drawing',this.value)" />
            <input class="row-input" type="number" value="${d.qty_field??''}" placeholder="—" onchange="updateDoor('${type}',${parentId},${ri},${di},'qty_field',this.value)" />
            <button class="rm-btn" onclick="removeDoor('${type}',${parentId},${ri},${di})">×</button>
          </div>`;
        }).join('')}
        <button class="btn-add-row" onclick="addDoor('${type}',${parentId},${ri})">+ Add Door</button>

        <div class="sec-divider" style="margin-top:12px">📏 Trim (Linear Feet)</div>
        <div class="grid-hdr trim-row"><span>Type</span><span class="r">Dwg LF</span><span class="r">Field LF</span><span></span></div>
        ${room.trim.map((t, ti) => `
          <div class="trim-row">
            <select class="row-input row-select" onchange="updateTrim('${type}',${parentId},${ri},${ti},'type',this.value)">
              ${TRIM_TYPES.map(tt=>`<option ${tt===t.type?'selected':''}>${tt}</option>`).join('')}
            </select>
            <input class="row-input" type="number" value="${t.lf_drawing??''}" placeholder="—" onchange="updateTrim('${type}',${parentId},${ri},${ti},'lf_drawing',this.value)" />
            <input class="row-input" type="number" value="${t.lf_field??''}" placeholder="—" onchange="updateTrim('${type}',${parentId},${ri},${ti},'lf_field',this.value)" />
            <button class="rm-btn" onclick="removeTrim('${type}',${parentId},${ri},${ti})">×</button>
          </div>
        `).join('')}
        <button class="btn-add-row" onclick="addTrim('${type}',${parentId},${ri})">+ Add Trim</button>

        <div style="margin-top:12px">
          <label style="font-size:.7rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">Notes</label>
          <textarea class="row-input" rows="2" style="resize:vertical;margin-top:4px" placeholder="Site conditions, special requirements…"
            onchange="updateRoomNotes('${type}',${parentId},${ri},this.value)">${UI.esc(room.notes||'')}</textarea>
        </div>
        ${type === 'tpl' ? `
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <button class="btn btn-primary" style="width:100%" onclick="saveRoom(${parentId},${ri})">Save Room</button>
        </div>` : ''}
      </div>
    </div>
  `;
}

// Room state mutations
function getRooms(type, parentId) {
  if (type === 'tpl') return STATE.project.templates.find(t => t.id === parentId)?.rooms;
  return STATE.project.floors.find(f => f.id === parentId)?.commonRooms;
}
function updateRoomName(type, parentId, ri, val) { getRooms(type, parentId)[ri].name = val; }
function updateRoomNotes(type, parentId, ri, val) { getRooms(type, parentId)[ri].notes = val; }
function removeRoom(type, parentId, ri) {
  getRooms(type, parentId).splice(ri, 1);
  if (type === 'floor') _floorDirty.add(parentId);
  else _tplDirty.add(parentId);
  renderProjectTab();
}
function addDoor(type, parentId, ri) {
  const defHEl = document.getElementById(`defH_${type}_${parentId}`);
  const h = defHEl ? (parseInt(defHEl.value) || 80) : (
    type === 'tpl'
      ? STATE.project.templates.find(t => t.id === parentId)?.default_door_height || 80
      : STATE.project.floors.find(f => f.id === parentId)?.default_door_height || 80
  );
  getRooms(type, parentId)[ri].doors.push({ id: null, type: 'Interior Slab', width_in: 32, height_in: h, qty_drawing: null, qty_field: null });
  if (type === 'floor') _floorDirty.add(parentId); else _tplDirty.add(parentId);
  renderProjectTab();
}
function removeDoor(type, parentId, ri, di) {
  getRooms(type, parentId)[ri].doors.splice(di, 1);
  if (type === 'floor') _floorDirty.add(parentId); else _tplDirty.add(parentId);
  renderProjectTab();
}
function updateDoor(type, parentId, ri, di, field, val) {
  const d = getRooms(type, parentId)[ri].doors[di];
  if (field === 'type') d.type = val;
  else d[field] = val === '' ? null : parseInt(val);
}
function toggleCustomWidth(type, parentId, ri, di, checked) {
  const d = getRooms(type, parentId)[ri].doors[di];
  d.width_in = checked ? null : 32;
  if (type === 'floor') _floorDirty.add(parentId); else _tplDirty.add(parentId);
  renderProjectTab();
}
function addTrim(type, parentId, ri) {
  const trim = getRooms(type, parentId)[ri].trim;
  const hasBaseboard = trim.some(t => t.type === 'Baseboard');
  trim.push({ id: null, type: hasBaseboard ? 'Casing' : 'Baseboard', lf_drawing: null, lf_field: null });
  if (type === 'floor') _floorDirty.add(parentId); else _tplDirty.add(parentId);
  renderProjectTab();
}
function removeTrim(type, parentId, ri, ti) {
  getRooms(type, parentId)[ri].trim.splice(ti, 1);
  if (type === 'floor') _floorDirty.add(parentId); else _tplDirty.add(parentId);
  renderProjectTab();
}
function updateTrim(type, parentId, ri, ti, field, val) {
  const t = getRooms(type, parentId)[ri].trim[ti];
  if (field === 'type') t.type = val;
  else t[field] = val === '' ? null : parseFloat(val);
}

// ── Specs Tab ─────────────────────────────────────────────
function renderSpecsTab() {
  const { project, commonSpecs } = STATE.project;
  return renderSpecEditor('common', project.id, commonSpecs || []);
}

function specsToMap(specs) {
  const map = { trim: {}, door: {} };
  (specs || []).forEach(s => { map[s.spec_type][s.type_label] = s; });
  return map;
}

function buildItemPicker(specType, typeLabel, currentItemId) {
  const items = _allCatalogItems || [];
  const catMap = { ...TRIM_CAT_MAP, ...DOOR_CAT_MAP };
  const catFilter = catMap[typeLabel];
  const filtered = catFilter ? items.filter(i => i.category_name === catFilter) : items.filter(i => i.unit === (specType === 'door' ? 'EA' : 'LF'));
  return `<select class="row-input row-select spec-picker" style="font-size:.8rem" data-spec-type="${specType}" data-type-label="${UI.esc(typeLabel)}" onchange="specPickerChange(this)">
    <option value="">— not set —</option>
    ${filtered.map(i => `<option value="${i.id}" data-num="${UI.esc(i.item_number||'')}" data-stock="${i.stock_length_ft||''}" ${i.id===currentItemId?'selected':''}>${i.item_number?i.item_number+' — ':''}${UI.esc(i.name)}</option>`).join('')}
  </select>`;
}

function renderSpecEditor(context, contextId, specs) {
  const map = specsToMap(specs);
  const saveCall = context === 'tpl' ? `saveTemplateSpecs(${contextId})` : `saveCommonSpecs(${contextId})`;
  const title = '🎨 Building Material Specs';

  function trimRows() {
    return TRIM_TYPES.map(type => {
      const spec = map.trim[type];
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${type}</td>
        <td>${buildItemPicker('trim', type, spec?.catalog_item_id||null)}</td>
        <td class="r mono spec-item-num">${spec?.item_number ? `<span class="badge bdg-gray">${UI.esc(spec.item_number)}</span>` : '<span class="dim">—</span>'}</td>
        <td class="r dim spec-stock">${spec?.stock_length_ft ? spec.stock_length_ft+"'" : '—'}</td>
      </tr>`;
    }).join('');
  }

  function doorRows() {
    return DOOR_TYPES.map(type => {
      const spec = map.door[type];
      return `<tr>
        <td style="font-weight:500;white-space:nowrap">${type}</td>
        <td>${buildItemPicker('door', type, spec?.catalog_item_id||null)}</td>
        <td class="r mono spec-item-num">${spec?.item_number ? `<span class="badge bdg-gray">${UI.esc(spec.item_number)}</span>` : '<span class="dim">—</span>'}</td>
      </tr>`;
    }).join('');
  }

  return `
    <div class="form-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div class="form-card-title" style="margin:0">${title}</div>
        <button class="btn btn-primary" id="saveSpecsBtn" onclick="${saveCall}">Save Specs</button>
      </div>

      <div class="sec-divider" style="margin-bottom:8px">📏 Trim Materials</div>
      <table class="data-table" style="margin-bottom:24px">
        <thead><tr><th>Trim Type</th><th>Catalog Item</th><th class="r">Item #</th><th class="r">Stock</th></tr></thead>
        <tbody>${trimRows()}</tbody>
      </table>

      <div class="sec-divider" style="margin-bottom:8px">🚪 Door Products</div>
      <table class="data-table">
        <thead><tr><th>Door Type</th><th>Catalog Item</th><th class="r">Item #</th></tr></thead>
        <tbody>${doorRows()}</tbody>
      </table>
    </div>
  `;
}

function specPickerChange(sel) {
  const row = sel.closest('tr');
  const opt = sel.selectedOptions[0];
  const num = opt?.dataset?.num || '';
  const stock = opt?.dataset?.stock || '';
  const numCell = row.querySelector('.spec-item-num');
  const stockCell = row.querySelector('.spec-stock');
  if (numCell) numCell.innerHTML = num ? `<span class="badge bdg-gray">${UI.esc(num)}</span>` : '<span class="dim">—</span>';
  if (stockCell) stockCell.textContent = stock ? stock + "'" : '—';
}

async function saveTemplateSpecs(tplId) {
  const btn = document.getElementById('saveSpecsBtn');
  UI.setLoading(btn, true);
  try {
    const specs = [];
    document.querySelectorAll('.spec-picker').forEach(sel => {
      specs.push({ spec_type: sel.dataset.specType, type_label: sel.dataset.typeLabel, catalog_item_id: parseInt(sel.value) || null });
    });
    await api.put(`/templates/${tplId}/specs`, { specs });
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    _allCatalogItems = null;
    UI.toast('Template specs saved');
    await loadAndRenderSpecsTab();
  } catch(e) { UI.toast('Error: ' + e.message); UI.setLoading(btn, false); }
}

async function saveCommonSpecs(projectId) {
  const btn = document.getElementById('saveSpecsBtn');
  UI.setLoading(btn, true);
  try {
    const specs = [];
    document.querySelectorAll('.spec-picker').forEach(sel => {
      specs.push({ spec_type: sel.dataset.specType, type_label: sel.dataset.typeLabel, catalog_item_id: parseInt(sel.value) || null });
    });
    await api.put(`/projects/${projectId}/common-specs`, { specs });
    const refreshed = await api.get(`/projects/${STATE.project.project.id}`);
    STATE.project = refreshed;
    _allCatalogItems = null;
    UI.toast('Common area specs saved');
    await loadAndRenderSpecsTab();
  } catch(e) { UI.toast('Error: ' + e.message); UI.setLoading(btn, false); }
}

// ── Summary Tab ───────────────────────────────────────────
function renderSummaryTab() {
  const { project, templates, floors, commonSpecs } = STATE.project;
  const wf = project.waste_factor;
  const showDwg = document.getElementById('showDwgToggle')?.checked || false;

  // Suite materials per template
  const tplCounts = {};
  floors.forEach(f => f.units.forEach(u => { if (u.template_id) tplCounts[u.template_id] = (tplCounts[u.template_id]||0)+1; }));

  const eff = (field, dwg) => field ?? dwg ?? 0;
  const grandDoors = {}, grandTrim = {};
  const missingSpecs = [];

  const commonSpecMap = specsToMap(commonSpecs || []);

  const suiteSections = templates.filter(t => tplCounts[t.id] > 0).map(t => {
    const count = tplCounts[t.id];
    const doors = {}, trim = {};
    t.rooms.forEach(r => {
      r.doors.forEach(d => {
        const k = `${d.type} ${d.width_in || '?'}"`;
        const spec = commonSpecMap.door[d.type];
        if (!doors[k]) doors[k] = { eff: 0, dwg: 0, itemNum: spec?.item_number || null };
        doors[k].eff += eff(d.qty_field, d.qty_drawing) * count;
        doors[k].dwg += (d.qty_drawing||0) * count;
        if (!grandDoors[k]) grandDoors[k] = { qty: 0, itemNum: spec?.item_number || null };
        grandDoors[k].qty += eff(d.qty_field, d.qty_drawing) * count;
        if (!spec && eff(d.qty_field, d.qty_drawing) > 0) { const m = `${d.type}`; if (!missingSpecs.includes(m)) missingSpecs.push(m); }
      });
      r.trim.forEach(tr => {
        const spec = commonSpecMap.trim[tr.type];
        if (!trim[tr.type]) trim[tr.type] = { eff: 0, dwg: 0, itemNum: spec?.item_number || null, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        trim[tr.type].eff += eff(tr.lf_field, tr.lf_drawing) * count;
        trim[tr.type].dwg += (tr.lf_drawing||0) * count;
        if (!grandTrim[tr.type]) grandTrim[tr.type] = { lf: 0, itemNum: spec?.item_number || null, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        grandTrim[tr.type].lf += eff(tr.lf_field, tr.lf_drawing) * count;
        if (!spec && eff(tr.lf_field, tr.lf_drawing) > 0) { const m = `${tr.type}`; if (!missingSpecs.includes(m)) missingSpecs.push(m); }
      });
    });
    return { name: t.name, count, doors, trim };
  });

  const commonSections = floors.map(f => {
    const doors = {}, trim = {};
    f.commonRooms.forEach(r => {
      r.doors.forEach(d => {
        const k = `${d.type} ${d.width_in || '?'}"`;
        const spec = commonSpecMap.door[d.type];
        if (!doors[k]) doors[k] = { eff: 0, dwg: 0, itemNum: spec?.item_number || null };
        doors[k].eff += eff(d.qty_field, d.qty_drawing);
        doors[k].dwg += d.qty_drawing||0;
        if (!grandDoors[k]) grandDoors[k] = { qty: 0, itemNum: spec?.item_number || null };
        grandDoors[k].qty += eff(d.qty_field, d.qty_drawing);
        if (!spec && eff(d.qty_field, d.qty_drawing) > 0) { const m = `${d.type}`; if (!missingSpecs.includes(m)) missingSpecs.push(m); }
      });
      r.trim.forEach(tr => {
        const spec = commonSpecMap.trim[tr.type];
        if (!trim[tr.type]) trim[tr.type] = { eff: 0, dwg: 0, itemNum: spec?.item_number || null, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        trim[tr.type].eff += eff(tr.lf_field, tr.lf_drawing);
        trim[tr.type].dwg += tr.lf_drawing||0;
        if (!grandTrim[tr.type]) grandTrim[tr.type] = { lf: 0, itemNum: spec?.item_number || null, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        grandTrim[tr.type].lf += eff(tr.lf_field, tr.lf_drawing);
        if (!spec && eff(tr.lf_field, tr.lf_drawing) > 0) { const m = `${tr.type}`; if (!missingSpecs.includes(m)) missingSpecs.push(m); }
      });
    });
    return { name: f.name, doors, trim };
  }).filter(s => Object.keys(s.doors).length || Object.keys(s.trim).length);

  const totalDoors = Object.values(grandDoors).reduce((a,b)=>a+b.qty,0);
  const totalTrimRaw = Object.values(grandTrim).reduce((a,b)=>a+b.lf,0);
  const totalTrimWaste = Math.ceil(totalTrimRaw * wf);

  const dwgTh = showDwg ? '<th>Drawing</th>' : '';

  function doorTbl(doors) {
    const entries = Object.entries(doors);
    if (!entries.length) return '<p style="font-size:.8rem;color:var(--text-muted)">No doors entered.</p>';
    return `<table class="data-table" style="margin-bottom:8px">
      <thead><tr><th>Door Type</th><th class="r">Item #</th><th class="r">As-Built</th>${dwgTh}</tr></thead>
      <tbody>${entries.map(([k,v])=>`<tr>
        <td>${k}</td>
        <td class="r mono">${v.itemNum ? `<span class="badge bdg-gray">${UI.esc(v.itemNum)}</span>` : '<span class="dim badge bdg-warn">No spec</span>'}</td>
        <td class="r fw">${v.eff} units</td>
        ${showDwg?`<td class="r dim">${v.dwg} dwg</td>`:''}
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function trimTbl(trim) {
    const entries = Object.entries(trim);
    if (!entries.length) return '<p style="font-size:.8rem;color:var(--text-muted)">No trim entered.</p>';
    return `<table class="data-table" style="margin-bottom:8px">
      <thead><tr><th>Trim Type</th><th class="r">Item #</th><th class="r">As-Built LF</th><th class="r">+${Math.round((wf-1)*100)}% Waste</th><th class="r">Stock</th><th class="r">Pieces</th>${dwgTh}</tr></thead>
      <tbody>${entries.map(([k,v]) => {
        const lfWaste = Math.ceil(v.eff * wf);
        const pieces = v.stockLen ? Math.ceil(lfWaste / v.stockLen) : null;
        return `<tr>
          <td>${k}</td>
          <td class="r mono">${v.itemNum ? `<span class="badge bdg-gray">${UI.esc(v.itemNum)}</span>` : '<span class="dim badge bdg-warn">No spec</span>'}</td>
          <td class="r">${v.eff}</td>
          <td class="r fw">${lfWaste} LF</td>
          <td class="r dim">${v.stockLen ? v.stockLen+"'" : '—'}</td>
          <td class="r fw">${pieces !== null ? pieces+' pcs' : '—'}</td>
          ${showDwg ? `<td class="r dim">${v.dwg}</td>` : ''}
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function grandDoorTbl() {
    const entries = Object.entries(grandDoors);
    if (!entries.length) return '<p style="font-size:.8rem;color:var(--text-muted)">No doors.</p>';
    return `<table class="data-table" style="margin-bottom:8px">
      <thead><tr><th>Door Type</th><th class="r">Item #</th><th class="r">Total Units</th></tr></thead>
      <tbody>${entries.map(([k,v])=>`<tr>
        <td>${k}</td>
        <td class="r mono">${v.itemNum ? `<span class="badge bdg-gray">${UI.esc(v.itemNum)}</span>` : '<span class="dim badge bdg-warn">No spec</span>'}</td>
        <td class="r fw">${v.qty}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  function grandTrimTbl() {
    const entries = Object.entries(grandTrim);
    if (!entries.length) return '<p style="font-size:.8rem;color:var(--text-muted)">No trim.</p>';
    return `<table class="data-table" style="margin-bottom:8px">
      <thead><tr><th>Trim Type</th><th class="r">Item #</th><th class="r">Total LF</th><th class="r">+${Math.round((wf-1)*100)}% Waste</th><th class="r">Stock</th><th class="r">Pieces</th></tr></thead>
      <tbody>${entries.map(([k,v]) => {
        const lfWaste = Math.ceil(v.lf * wf);
        const pieces = v.stockLen ? Math.ceil(lfWaste / v.stockLen) : null;
        return `<tr>
          <td>${k}</td>
          <td class="r mono">${v.itemNum ? `<span class="badge bdg-gray">${UI.esc(v.itemNum)}</span>` : '<span class="dim badge bdg-warn">No spec</span>'}</td>
          <td class="r">${v.lf}</td>
          <td class="r fw">${lfWaste} LF</td>
          <td class="r dim">${v.stockLen ? v.stockLen+"'" : '—'}</td>
          <td class="r fw">${pieces !== null ? pieces+' pcs' : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  return `
    <div style="max-width:960px">
      <div class="page-hdr">
        <div><div class="page-title">Material Takeoff — ${UI.esc(project.name)}</div></div>
        <div class="page-hdr-actions">
          <div class="toggle-row" style="margin:0">
            <input type="checkbox" id="showDwgToggle" onchange="renderProjectTab()" />
            <label for="showDwgToggle" style="margin:0;font-size:.82rem;color:var(--text)">Show drawing comparison</label>
          </div>
          <button class="btn btn-secondary" onclick="exportCSV()">⬇ Export CSV</button>
          <button class="btn btn-primary" onclick="window.print()">🖨 Print / PDF</button>
        </div>
      </div>

      ${suiteSections.map(s => `
        <div class="form-card sum-section">
          <div class="sum-section-title">📐 ${UI.esc(s.name)} <span style="font-weight:400;color:var(--text-muted)">— ${s.count} unit${s.count!==1?'s':''}</span></div>
          ${doorTbl(s.doors)}
          ${trimTbl(s.trim)}
        </div>
      `).join('')}

      ${commonSections.map(s => `
        <div class="form-card sum-section">
          <div class="sum-section-title">🏢 ${UI.esc(s.name)} — Common Areas</div>
          ${doorTbl(s.doors)}
          ${trimTbl(s.trim)}
        </div>
      `).join('')}

      <div class="form-card">
        <div class="form-card-title">Grand Total — All Materials</div>
        ${grandDoorTbl()}
        ${grandTrimTbl()}
        <div class="grand-total-card" style="margin-top:12px">
          <div class="gt-row"><span>Total Doors</span><span>${totalDoors} units</span></div>
          <div class="gt-row"><span>Total Trim (measured)</span><span>${totalTrimRaw} LF</span></div>
          <div class="gt-row total"><span>Total Trim + ${Math.round((wf-1)*100)}% Waste</span><span>${totalTrimWaste} LF</span></div>
        </div>
      </div>

      ${missingSpecs.length ? `
        <div class="form-card" style="border:1.5px solid var(--warning,#f59e0b);background:var(--warning-bg,#fffbeb)">
          <div class="form-card-title" style="color:var(--warning-text,#92400e)">⚠ Missing Material Specs</div>
          <p style="font-size:.82rem;color:var(--warning-text,#92400e);margin-bottom:8px">The following material types have quantities but no product assigned in the building spec. Go to the <strong>Material Specs</strong> tab to assign catalog items.</p>
          <ul style="font-size:.82rem;color:var(--warning-text,#92400e);margin:0;padding-left:18px">
            ${missingSpecs.map(m => `<li>${UI.esc(m)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `;
}

// ── CSV Export ────────────────────────────────────────────
function exportCSV() {
  const { project, templates, floors, commonSpecs } = STATE.project;
  const wf = project.waste_factor;
  const tplCounts = {};
  floors.forEach(f => f.units.forEach(u => { if (u.template_id) tplCounts[u.template_id] = (tplCounts[u.template_id]||0)+1; }));
  const eff = (field, dwg) => field ?? dwg ?? 0;
  const commonSpecMap = specsToMap(commonSpecs || []);
  const grandDoors = {}, grandTrim = {};

  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [];

  rows.push([q('SiteMeasure Material Takeoff'), q(project.name)]);
  rows.push([q('Date'), q(new Date().toLocaleDateString())]);
  rows.push([q('Address'), q(project.address || '')]);
  rows.push([q('Waste Factor'), q(Math.round((wf - 1) * 100) + '%')]);
  rows.push([]);

  const COL_HDR = [q('Type'), q('Item #'), q('Description'), q('As-Built'), q('Unit'), q('+Waste'), q('Stock (ft)'), q('Pieces'), q('Notes')];

  // ── Suite sections
  templates.filter(t => tplCounts[t.id] > 0).forEach(t => {
    const count = tplCounts[t.id];
    rows.push([q(`SUITE: ${t.name} — ${count} unit${count !== 1 ? 's' : ''}`)]);
    rows.push(COL_HDR);
    const doors = {}, trim = {};
    t.rooms.forEach(r => {
      r.doors.forEach(d => {
        const k = `${d.type} ${d.width_in || '?'}"`;
        const spec = commonSpecMap.door[d.type];
        if (!doors[k]) doors[k] = { eff: 0, spec };
        doors[k].eff += eff(d.qty_field, d.qty_drawing) * count;
        if (!grandDoors[k]) grandDoors[k] = { qty: 0, spec: spec || null };
        grandDoors[k].qty += eff(d.qty_field, d.qty_drawing) * count;
      });
      r.trim.forEach(tr => {
        const spec = commonSpecMap.trim[tr.type];
        if (!trim[tr.type]) trim[tr.type] = { eff: 0, spec, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        trim[tr.type].eff += eff(tr.lf_field, tr.lf_drawing) * count;
        if (!grandTrim[tr.type]) grandTrim[tr.type] = { lf: 0, spec: spec || null, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        grandTrim[tr.type].lf += eff(tr.lf_field, tr.lf_drawing) * count;
      });
    });
    Object.entries(doors).forEach(([k, v]) =>
      rows.push([q(k), q(v.spec?.item_number || ''), q(v.spec?.item_name || ''), q(v.eff), q('EA'), q(''), q(''), q(''), q(v.spec ? '' : '⚠ No spec')]));
    Object.entries(trim).forEach(([k, v]) => {
      const lfw = Math.ceil(v.eff * wf);
      rows.push([q(k), q(v.spec?.item_number || ''), q(v.spec?.item_name || ''), q(v.eff), q('LF'), q(lfw), q(v.stockLen || ''), q(v.stockLen ? Math.ceil(lfw / v.stockLen) : ''), q(v.spec ? '' : '⚠ No spec')]);
    });
    rows.push([]);
  });

  // ── Common area sections
  floors.forEach(f => {
    const hasMaterials = f.commonRooms.some(r => r.doors.length || r.trim.length);
    if (!hasMaterials) return;
    rows.push([q(`COMMON AREAS: ${f.name}`)]);
    rows.push(COL_HDR);
    const doors = {}, trim = {};
    f.commonRooms.forEach(r => {
      r.doors.forEach(d => {
        const k = `${d.type} ${d.width_in || '?'}"`;
        const spec = commonSpecMap.door[d.type];
        if (!doors[k]) doors[k] = { eff: 0, spec };
        doors[k].eff += eff(d.qty_field, d.qty_drawing);
        if (!grandDoors[k]) grandDoors[k] = { qty: 0, spec: spec || null };
        grandDoors[k].qty += eff(d.qty_field, d.qty_drawing);
      });
      r.trim.forEach(tr => {
        const spec = commonSpecMap.trim[tr.type];
        if (!trim[tr.type]) trim[tr.type] = { eff: 0, spec, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        trim[tr.type].eff += eff(tr.lf_field, tr.lf_drawing);
        if (!grandTrim[tr.type]) grandTrim[tr.type] = { lf: 0, spec: spec || null, stockLen: spec?.stock_length_ft || STOCK_LENGTHS[tr.type] || null };
        grandTrim[tr.type].lf += eff(tr.lf_field, tr.lf_drawing);
      });
    });
    Object.entries(doors).forEach(([k, v]) =>
      rows.push([q(k), q(v.spec?.item_number || ''), q(v.spec?.item_name || ''), q(v.eff), q('EA'), q(''), q(''), q(''), q(v.spec ? '' : '⚠ No spec')]));
    Object.entries(trim).forEach(([k, v]) => {
      const lfw = Math.ceil(v.eff * wf);
      rows.push([q(k), q(v.spec?.item_number || ''), q(v.spec?.item_name || ''), q(v.eff), q('LF'), q(lfw), q(v.stockLen || ''), q(v.stockLen ? Math.ceil(lfw / v.stockLen) : ''), q(v.spec ? '' : '⚠ No spec')]);
    });
    rows.push([]);
  });

  // ── Grand total / order summary
  rows.push([q('ORDER SUMMARY — GRAND TOTAL')]);
  rows.push(COL_HDR);
  Object.entries(grandDoors).forEach(([k, v]) =>
    rows.push([q(k), q(v.spec?.item_number || ''), q(v.spec?.item_name || ''), q(v.qty), q('EA'), q(''), q(''), q(''), q(v.spec ? '' : '⚠ No spec')]));
  Object.entries(grandTrim).forEach(([k, v]) => {
    const lfw = Math.ceil(v.lf * wf);
    rows.push([q(k), q(v.spec?.item_number || ''), q(v.spec?.item_name || ''), q(v.lf), q('LF'), q(lfw), q(v.stockLen || ''), q(v.stockLen ? Math.ceil(lfw / v.stockLen) : ''), q(v.spec ? '' : '⚠ No spec')]);
  });

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}_takeoff.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', route);
