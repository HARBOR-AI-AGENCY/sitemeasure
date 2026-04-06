const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3030;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ───────────────────────────────────────────────
const ok  = (res, data)   => res.json({ ok: true, data });
const err = (res, msg, s=400) => res.status(s).json({ ok: false, error: msg });
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch(e) { next(e); } };

// ═══════════════════════════════════════════════════════════
// CATALOG API
// ═══════════════════════════════════════════════════════════

// GET /api/catalog/tree
app.get('/api/catalog/tree', wrap((req, res) => ok(res, db.getCatalogTree())));

// GET /api/catalog/items?subcategoryId=&search=&unit=
app.get('/api/catalog/items', wrap((req, res) => {
  const { subcategoryId, search, unit } = req.query;
  ok(res, db.getItems({ subcategoryId: subcategoryId ? +subcategoryId : null, search, unit }));
}));

// POST /api/catalog/items
app.post('/api/catalog/items', wrap((req, res) => {
  const { subcategory_id, item_number, name, description, material, profile, width_in, height_in, unit, stock_length_ft, in_stock } = req.body;
  if (!subcategory_id || !name) return err(res, 'subcategory_id and name are required');
  ok(res, db.createItem({ subcategory_id, item_number: item_number || null, name, description: description || '', material: material || null, profile: profile || null, width_in: width_in || null, height_in: height_in || null, unit: unit || 'EA', stock_length_ft: stock_length_ft || null, in_stock: in_stock !== false ? 1 : 0, sort_order: 0 }));
}));

// PUT /api/catalog/items/:id
app.put('/api/catalog/items/:id', wrap((req, res) => {
  const item = db.getItem(+req.params.id);
  if (!item) return err(res, 'Not found', 404);
  const { subcategory_id, item_number, name, description, material, profile, width_in, height_in, unit, stock_length_ft, in_stock } = req.body;
  if (!name) return err(res, 'name is required');
  ok(res, db.updateItem(+req.params.id, { subcategory_id: subcategory_id || item.subcategory_id, item_number: item_number ?? item.item_number, name, description: description ?? '', material: material ?? null, profile: profile ?? null, width_in: width_in ?? null, height_in: height_in ?? null, unit: unit || 'EA', stock_length_ft: stock_length_ft ?? item.stock_length_ft ?? null, in_stock: in_stock !== false ? 1 : 0 }));
}));

// DELETE /api/catalog/items/:id
app.delete('/api/catalog/items/:id', wrap((req, res) => {
  db.deleteItem(+req.params.id);
  ok(res, { deleted: true });
}));

// POST /api/catalog/import  — body: { rows: [{class,category,subcategory,item_number,name,...}] }
app.post('/api/catalog/import', wrap((req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return err(res, 'rows array required');
  ok(res, db.bulkUpsertItems(rows));
}));

// GET /api/catalog/export/template  — returns CSV template text
app.get('/api/catalog/export/template', (req, res) => {
  const header = 'class,category,subcategory,item_number,name,description,material,profile,width_in,height_in,unit,in_stock';
  const example = 'Trim,Baseboard,Finger Joint Pine,BB-BEAD-FJP,Bead Baseboard,Clean bead detail,Finger Joint Pine,Bead,0.5,3.5,LF,1';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sitemeasure_catalog_import.csv"');
  res.send(header + '\n' + example + '\n');
});

// ═══════════════════════════════════════════════════════════
// PROJECTS API
// ═══════════════════════════════════════════════════════════

// GET /api/projects
app.get('/api/projects', wrap((req, res) => ok(res, db.getProjects())));

// POST /api/projects
app.post('/api/projects', wrap((req, res) => {
  const { name, address, waste_factor, notes } = req.body;
  if (!name) return err(res, 'name is required');
  ok(res, db.createProject({ name, address: address || '', waste_factor: waste_factor || 1.10, notes: notes || '' }));
}));

// GET /api/projects/:id  — full project with templates + floors
app.get('/api/projects/:id', wrap((req, res) => {
  const p = db.getFullProject(+req.params.id);
  if (!p) return err(res, 'Not found', 404);
  ok(res, p);
}));

// PUT /api/projects/:id
app.put('/api/projects/:id', wrap((req, res) => {
  const { name, address, waste_factor, notes } = req.body;
  if (!name) return err(res, 'name is required');
  ok(res, db.updateProject(+req.params.id, { name, address: address || '', waste_factor: waste_factor || 1.10, notes: notes || '' }));
}));

// DELETE /api/projects/:id
app.delete('/api/projects/:id', wrap((req, res) => {
  db.deleteProject(+req.params.id);
  ok(res, { deleted: true });
}));

// ── Templates ─────────────────────────────────────────────

// POST /api/projects/:id/templates
app.post('/api/projects/:id/templates', wrap((req, res) => {
  const projectId = +req.params.id;
  const { name } = req.body;
  if (!name) return err(res, 'name is required');
  const r = db.db.prepare('INSERT INTO suite_templates (project_id,name,sort_order) VALUES (?,?,?)').run(projectId, name, 0);
  ok(res, { id: r.lastInsertRowid, project_id: projectId, name, rooms: [] });
}));

// PUT /api/templates/:id  — save full template (rooms + doors + trim)
app.put('/api/templates/:id', wrap((req, res) => {
  const { name, default_door_height, rooms } = req.body;
  if (!name) return err(res, 'name is required');
  ok(res, db.saveTemplate(+req.params.id, { name, default_door_height: default_door_height || 80, rooms: rooms || [] }));
}));

// DELETE /api/templates/:id
app.delete('/api/templates/:id', wrap((req, res) => {
  db.db.prepare('DELETE FROM suite_templates WHERE id=?').run(+req.params.id);
  ok(res, { deleted: true });
}));

// GET /api/templates/:id/specs
app.get('/api/templates/:id/specs', wrap((req, res) => {
  const specs = db.db.prepare('SELECT s.*, i.item_number, i.name as item_name, i.stock_length_ft FROM template_material_specs s LEFT JOIN catalog_items i ON i.id=s.catalog_item_id WHERE s.template_id=?').all(+req.params.id);
  ok(res, specs);
}));

// PUT /api/templates/:id/specs
app.put('/api/templates/:id/specs', wrap((req, res) => {
  const { specs } = req.body;
  if (!Array.isArray(specs)) return err(res, 'specs array required');
  db.saveTemplateSpecs(+req.params.id, specs);
  ok(res, { saved: true });
}));

// GET /api/projects/:id/common-specs
app.get('/api/projects/:id/common-specs', wrap((req, res) => {
  const specs = db.db.prepare('SELECT s.*, i.item_number, i.name as item_name, i.stock_length_ft FROM project_common_specs s LEFT JOIN catalog_items i ON i.id=s.catalog_item_id WHERE s.project_id=?').all(+req.params.id);
  ok(res, specs);
}));

// PUT /api/projects/:id/common-specs
app.put('/api/projects/:id/common-specs', wrap((req, res) => {
  const { specs } = req.body;
  if (!Array.isArray(specs)) return err(res, 'specs array required');
  db.saveProjectCommonSpecs(+req.params.id, specs);
  ok(res, { saved: true });
}));

// ── Floors ────────────────────────────────────────────────

// POST /api/projects/:id/floors
app.post('/api/projects/:id/floors', wrap((req, res) => {
  const projectId = +req.params.id;
  const { name } = req.body;
  if (!name) return err(res, 'name is required');
  const r = db.db.prepare('INSERT INTO floors (project_id,name,sort_order) VALUES (?,?,?)').run(projectId, name, 0);
  ok(res, { id: r.lastInsertRowid, project_id: projectId, name, units: [], commonRooms: [] });
}));

// PUT /api/floors/:id  — save full floor (units + common rooms)
app.put('/api/floors/:id', wrap((req, res) => {
  const { name, default_door_height, units, commonRooms } = req.body;
  if (!name) return err(res, 'name is required');
  ok(res, db.saveFloor(+req.params.id, { name, default_door_height: default_door_height || 80, units: units || [], commonRooms: commonRooms || [] }));
}));

// DELETE /api/floors/:id
app.delete('/api/floors/:id', wrap((req, res) => {
  db.db.prepare('DELETE FROM floors WHERE id=?').run(+req.params.id);
  ok(res, { deleted: true });
}));

// ── Error handler ─────────────────────────────────────────
app.use((e, req, res, _next) => {
  console.error(e);
  res.status(500).json({ ok: false, error: e.message });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => console.log(`SiteMeasure running → http://localhost:${PORT}`));
