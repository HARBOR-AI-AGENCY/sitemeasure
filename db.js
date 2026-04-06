const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'sitemeasure.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════
db.exec(`
  -- Catalog hierarchy
  CREATE TABLE IF NOT EXISTS catalog_classes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    icon       TEXT,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalog_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id   INTEGER NOT NULL REFERENCES catalog_classes(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalog_subcategories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalog_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    subcategory_id INTEGER NOT NULL REFERENCES catalog_subcategories(id) ON DELETE CASCADE,
    item_number    TEXT,
    name           TEXT NOT NULL,
    description    TEXT,
    material       TEXT,
    profile        TEXT,
    width_in       REAL,
    height_in      REAL,
    unit           TEXT DEFAULT 'EA',
    in_stock       INTEGER DEFAULT 1,
    sort_order     INTEGER DEFAULT 0,
    stock_length_ft REAL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Projects
  CREATE TABLE IF NOT EXISTS projects (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    address      TEXT,
    waste_factor REAL DEFAULT 1.10,
    notes        TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Suite templates (floor plan types)
  CREATE TABLE IF NOT EXISTS suite_templates (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    default_door_height INTEGER DEFAULT 80,
    sort_order          INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS template_rooms (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES suite_templates(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    notes       TEXT DEFAULT '',
    sort_order  INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS template_doors (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id        INTEGER NOT NULL REFERENCES template_rooms(id) ON DELETE CASCADE,
    catalog_item_id INTEGER REFERENCES catalog_items(id),
    type           TEXT NOT NULL DEFAULT 'Interior Slab',
    width_in       INTEGER DEFAULT 32,
    height_in      INTEGER DEFAULT 80,
    qty_drawing    INTEGER,
    qty_field      INTEGER,
    sort_order     INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS template_trim (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id        INTEGER NOT NULL REFERENCES template_rooms(id) ON DELETE CASCADE,
    catalog_item_id INTEGER REFERENCES catalog_items(id),
    type           TEXT NOT NULL DEFAULT 'Baseboard',
    lf_drawing     REAL,
    lf_field       REAL,
    sort_order     INTEGER DEFAULT 0
  );

  -- Floors
  CREATE TABLE IF NOT EXISTS floors (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    default_door_height INTEGER DEFAULT 80,
    sort_order          INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS units (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_id    INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    template_id INTEGER REFERENCES suite_templates(id),
    sort_order  INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS common_rooms (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    floor_id   INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    notes      TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS common_doors (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id        INTEGER NOT NULL REFERENCES common_rooms(id) ON DELETE CASCADE,
    catalog_item_id INTEGER REFERENCES catalog_items(id),
    type           TEXT NOT NULL DEFAULT 'Interior Slab',
    width_in       INTEGER DEFAULT 32,
    height_in      INTEGER DEFAULT 80,
    qty_drawing    INTEGER,
    qty_field      INTEGER,
    sort_order     INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS common_trim (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id        INTEGER NOT NULL REFERENCES common_rooms(id) ON DELETE CASCADE,
    catalog_item_id INTEGER REFERENCES catalog_items(id),
    type           TEXT NOT NULL DEFAULT 'Baseboard',
    lf_drawing     REAL,
    lf_field       REAL,
    sort_order     INTEGER DEFAULT 0
  );

  -- Material specifications (per template and per project common areas)
  CREATE TABLE IF NOT EXISTS template_material_specs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id     INTEGER NOT NULL REFERENCES suite_templates(id) ON DELETE CASCADE,
    spec_type       TEXT NOT NULL,
    type_label      TEXT NOT NULL,
    catalog_item_id INTEGER REFERENCES catalog_items(id),
    UNIQUE(template_id, spec_type, type_label)
  );
  CREATE TABLE IF NOT EXISTS project_common_specs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    spec_type       TEXT NOT NULL,
    type_label      TEXT NOT NULL,
    catalog_item_id INTEGER REFERENCES catalog_items(id),
    UNIQUE(project_id, spec_type, type_label)
  );
`);

// ═══════════════════════════════════════════════════════════
// SEED CATALOG
// ═══════════════════════════════════════════════════════════
function seedCatalog() {
  const { n } = db.prepare('SELECT COUNT(*) as n FROM catalog_classes').get();
  if (n > 0) return;

  const iCls = db.prepare('INSERT INTO catalog_classes (name, icon, sort_order) VALUES (?,?,?)');
  const iCat = db.prepare('INSERT INTO catalog_categories (class_id, name, sort_order) VALUES (?,?,?)');
  const iSub = db.prepare('INSERT INTO catalog_subcategories (category_id, name, sort_order) VALUES (?,?,?)');
  const iItm = db.prepare(`INSERT INTO catalog_items
    (subcategory_id,item_number,name,description,material,profile,width_in,height_in,unit,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);

  db.exec('BEGIN');

  // ── DOORS class ──────────────────────────────────────────
  const dCls  = iCls.run('Doors', '🚪', 10).lastInsertRowid;

  const intId  = iCat.run(dCls, 'Interior Doors',   10).lastInsertRowid;
  const extId  = iCat.run(dCls, 'Exterior Doors',   20).lastInsertRowid;
  const fireId = iCat.run(dCls, 'Fire Rated Doors', 30).lastInsertRowid;

  // Interior subcategories + items
  const slabId    = iSub.run(intId, 'Slab',            10).lastInsertRowid;
  const prehungId = iSub.run(intId, 'Prehung',         20).lastInsertRowid;
  const bifoldId  = iSub.run(intId, 'Bifold',          30).lastInsertRowid;
  const bypassId  = iSub.run(intId, 'Bypass / Closet', 40).lastInsertRowid;
  const barnId    = iSub.run(intId, 'Barn Door',       50).lastInsertRowid;
  const frenchId  = iSub.run(intId, 'French Door',     60).lastInsertRowid;
                    iSub.run(intId, 'Pocket Door',     70);  // empty — vendor fills in

  iItm.run(slabId,    'DR-SLAB-MOL',   'Moulded Panel Slab',     'Moulded panel slab door, various widths',    'Moulded',      'Panel',   null, 80, 'EA', 10);
  iItm.run(slabId,    'DR-SLAB-SHAK',  'Shaker Slab',            '5-panel shaker slab door',                   'Stile & Rail', 'Shaker',  null, 80, 'EA', 20);
  iItm.run(slabId,    'DR-SLAB-FLUSH', 'Flush Slab',             'Smooth hollow-core flush slab',              'Hollow Core',  'Flush',   null, 80, 'EA', 30);
  iItm.run(prehungId, 'DR-HUNG-MOL',   'Moulded Panel Prehung',  'Prehung moulded panel, knockdown frame',     'Moulded',      'Panel',   null, 80, 'EA', 10);
  iItm.run(prehungId, 'DR-HUNG-SHAK',  'Shaker Prehung',         'Prehung shaker, knockdown frame',            'Stile & Rail', 'Shaker',  null, 80, 'EA', 20);
  iItm.run(bifoldId,  'DR-BIFOLD-STD', 'Bifold Door',            'Bifold closet door',                         'Moulded',      'Bifold',  null, 80, 'EA', 10);
  iItm.run(bypassId,  'DR-BYPASS-STD', 'Bypass Closet Door',     'Sliding bypass closet door',                 'Moulded',      'Bypass',  null, 80, 'EA', 10);
  iItm.run(barnId,    'DR-BARN-STD',   'Barn Door',              'Sliding barn door, hardware sold separately','Stile & Rail', 'Barn',    null, 84, 'EA', 10);
  iItm.run(frenchId,  'DR-FRENCH-GL',  'French Door — Glazed',   'French door with glass lites',               'Stile & Rail', 'French',  null, 80, 'EA', 10);

  // Exterior — empty subcategories for vendor
  iSub.run(extId, 'Entry Door — Single', 10);
  iSub.run(extId, 'Entry Door — Double', 20);
  iSub.run(extId, 'Patio Door — Sliding', 30);
  iSub.run(extId, 'Garden Door', 40);

  // Fire Rated
  const f20 = iSub.run(fireId, '20-Minute', 10).lastInsertRowid;
         iSub.run(fireId, '45-Minute', 20);
         iSub.run(fireId, '90-Minute', 30);
  iItm.run(f20, 'DR-FIRE-STD', 'Fire Rated Door', 'Fire rated solid core, code compliant', 'Solid Core', 'Flush', null, 80, 'EA', 10);

  // ── TRIM class ───────────────────────────────────────────
  const tCls = iCls.run('Trim', '📏', 20).lastInsertRowid;

  const bbId  = iCat.run(tCls, 'Baseboard',      10).lastInsertRowid;
  const casId = iCat.run(tCls, 'Door Casing',    20).lastInsertRowid;
  const crId  = iCat.run(tCls, 'Crown Moulding', 30).lastInsertRowid;
  const wcId  = iCat.run(tCls, 'Window Casing',  40).lastInsertRowid;
  const stId  = iCat.run(tCls, 'Door Stop',      50).lastInsertRowid;
  const bdId  = iCat.run(tCls, 'Backband',       60).lastInsertRowid;
  const hrId  = iCat.run(tCls, 'Handrail',       70).lastInsertRowid;
  const crRId = iCat.run(tCls, 'Chair Rail',     80).lastInsertRowid;
  const qrId  = iCat.run(tCls, 'Quarter Round',  90).lastInsertRowid;
  const smId  = iCat.run(tCls, 'Shoe Mould',    100).lastInsertRowid;

  // Baseboard — Finger Joint Pine
  const bbFJP = iSub.run(bbId, 'Finger Joint Pine', 10).lastInsertRowid;
  iItm.run(bbFJP,'BB-BEAD-FJP',   'Bead Baseboard',          'Clean bead detail, modern homes',        'Finger Joint Pine','Bead',         0.5, 3.5,  'LF',10);
  iItm.run(bbFJP,'BB-BEVEL-FJP',  'Bevel Baseboard',         'Crisp beveled profile',                  'Finger Joint Pine','Bevel',        0.5, 4.25, 'LF',20);
  iItm.run(bbFJP,'BB-CONT-FJP',   'Contemporary Baseboard',  'Flat face, minimalist profile',          'Finger Joint Pine','Contemporary', 0.5, 5.5,  'LF',30);
  iItm.run(bbFJP,'BB-EASED-FJP',  'Eased Edge Baseboard',    'Subtle eased top edge',                  'Finger Joint Pine','Eased Edge',   0.5, 5.5,  'LF',40);
  iItm.run(bbFJP,'BB-MOD-FJP',    'Modern Baseboard',        'Simple contemporary profile',            'Finger Joint Pine','Modern',       0.5, 3.5,  'LF',50);
  iItm.run(bbFJP,'BB-GOTH-FJP',   'Gothic Baseboard',        'Pointed arch detail',                    'Finger Joint Pine','Gothic',       0.5, 4.25, 'LF',60);
  iItm.run(bbFJP,'BB-STEP-FJP',   'Step Baseboard',          'Stepped profile, classic look',          'Finger Joint Pine','Step',         0.5, 5.5,  'LF',70);
  iItm.run(bbFJP,'BB-NEWVIC-FJP', 'New Victorian Baseboard', 'Victorian-inspired modern profile',      'Finger Joint Pine','New Victorian',0.5, 5.5,  'LF',80);
  iItm.run(bbFJP,'BB-ANT-FJP',    'Antique Baseboard',       'Ornate antique profile',                 'Finger Joint Pine','Antique',      0.5, 5.5,  'LF',90);
  iItm.run(bbFJP,'BB-CAND-FJP',   'Candlestick Baseboard',   'Traditional candlestick detail',         'Finger Joint Pine','Candlestick',  0.5, 4.25, 'LF',100);
  iItm.run(bbFJP,'BB-COL-FJP',    'Colonial Baseboard',      'Standard colonial profile',              'Finger Joint Pine','Colonial',     0.5, 4.25, 'LF',110);
  iItm.run(bbFJP,'BB-COLB-FJP',   'Colonial B Baseboard',    'Classic colonial variant',               'Finger Joint Pine','Colonial B',   0.5, 5.5,  'LF',120);
  iItm.run(bbFJP,'BB-ORN-FJP',    'Ornamental Baseboard',    'Decorative ornamental profile',          'Finger Joint Pine','Ornamental',   0.5, 5.5,  'LF',130);
  iItm.run(bbFJP,'BB-PRES-FJP',   'Prestige Baseboard',      'Premium wide baseboard',                 'Finger Joint Pine','Prestige',     0.75,7,    'LF',140);
  iItm.run(bbFJP,'BB-REGAL-FJP',  'Regal Baseboard',         'Grand regal profile',                    'Finger Joint Pine','Regal',        0.75,7,    'LF',150);

  // Baseboard — Primed MDF
  const bbMDF = iSub.run(bbId, 'Primed MDF', 20).lastInsertRowid;
  iItm.run(bbMDF,'BB-CONT-MDF',  'Contemporary Baseboard', 'MDF flat contemporary',   'Primed MDF','Contemporary',0.5, 5.5,  'LF',10);
  iItm.run(bbMDF,'BB-EASED-MDF', 'Eased Edge Baseboard',   'MDF eased edge',          'Primed MDF','Eased Edge',  0.5, 5.5,  'LF',20);
  iItm.run(bbMDF,'BB-COL-MDF',   'Colonial Baseboard',     'MDF colonial profile',    'Primed MDF','Colonial',    0.5, 4.25, 'LF',30);
  iItm.run(bbMDF,'BB-PRES-MDF',  'Prestige Baseboard',     'MDF premium wide',        'Primed MDF','Prestige',    0.75,7,    'LF',40);
  iItm.run(bbMDF,'BB-BEAD-MDF',  'Bead Baseboard',         'MDF bead detail',         'Primed MDF','Bead',        0.5, 3.5,  'LF',50);
  iItm.run(bbMDF,'BB-MOD-MDF',   'Modern Baseboard',       'MDF modern flat',         'Primed MDF','Modern',      0.5, 3.5,  'LF',60);

  // Baseboard — Hardwood (empty — vendor fills in)
  iSub.run(bbId, 'Hardwood', 30);

  // Door Casing
  const casFJP = iSub.run(casId, 'Finger Joint Pine', 10).lastInsertRowid;
  const casMDF = iSub.run(casId, 'Primed MDF',        20).lastInsertRowid;
  const casHW  = iSub.run(casId, 'Hardwood',          30).lastInsertRowid;
  iItm.run(casFJP,'CAS-COL-FJP', 'Colonial Casing',     'Classic colonial door casing',    'Finger Joint Pine','Colonial',     0.75,2.5, 'LF',10);
  iItm.run(casFJP,'CAS-CONT-FJP','Contemporary Casing',  'Clean modern casing',             'Finger Joint Pine','Contemporary', 0.75,2.5, 'LF',20);
  iItm.run(casFJP,'CAS-OGE-FJP', 'Ogee Casing',          'Classic S-curve ogee profile',    'Finger Joint Pine','Ogee',         0.75,3.25,'LF',30);
  iItm.run(casFJP,'CAS-FLAT-FJP','Flat Casing',           'Simple flat profile casing',      'Finger Joint Pine','Flat',         0.75,2.25,'LF',40);
  iItm.run(casMDF,'CAS-COL-MDF', 'Colonial Casing',      'MDF colonial casing',             'Primed MDF',       'Colonial',     0.75,2.5, 'LF',10);
  iItm.run(casMDF,'CAS-CONT-MDF','Contemporary Casing',   'MDF contemporary casing',         'Primed MDF',       'Contemporary', 0.75,2.5, 'LF',20);
  iItm.run(casMDF,'CAS-OGE-MDF', 'Ogee Casing',           'MDF ogee casing',                 'Primed MDF',       'Ogee',         0.75,3.25,'LF',30);
  iItm.run(casHW, 'CAS-COL-OAK', 'Colonial Casing',       'Oak colonial casing',             'Oak',              'Colonial',     0.75,2.5, 'LF',10);
  iItm.run(casHW, 'CAS-CONT-MAP','Contemporary Casing',   'Maple contemporary casing',       'Maple',            'Contemporary', 0.75,2.5, 'LF',20);

  // Crown Moulding
  const crFJP = iSub.run(crId, 'Finger Joint Pine', 10).lastInsertRowid;
  const crMDF = iSub.run(crId, 'Primed MDF',        20).lastInsertRowid;
  const crHW  = iSub.run(crId, 'Hardwood',          30).lastInsertRowid;
  iItm.run(crFJP,'CRO-SPRNG-FJP','Spring Crown', 'Classic spring angle crown',  'Finger Joint Pine','Spring',0.75,3.25,'LF',10);
  iItm.run(crFJP,'CRO-COG-FJP',  'Cove Crown',   'Elegant cove profile crown',  'Finger Joint Pine','Cove',  0.75,4.25,'LF',20);
  iItm.run(crFJP,'CRO-LRGE-FJP', 'Large Crown',  'Grand statement crown',       'Finger Joint Pine','Large', 0.75,5.5, 'LF',30);
  iItm.run(crMDF,'CRO-SPRNG-MDF','Spring Crown',  'MDF spring crown',            'Primed MDF',       'Spring',0.75,3.25,'LF',10);
  iItm.run(crMDF,'CRO-COG-MDF',  'Cove Crown',   'MDF cove crown',              'Primed MDF',       'Cove',  0.75,4.25,'LF',20);
  iItm.run(crMDF,'CRO-LRGE-MDF', 'Large Crown',  'MDF large crown',             'Primed MDF',       'Large', 0.75,5.5, 'LF',30);
  iItm.run(crHW, 'CRO-SPRNG-OAK','Spring Crown',  'Oak spring crown',            'Oak',              'Spring',0.75,3.25,'LF',10);
  iItm.run(crHW, 'CRO-SPRNG-MAP','Spring Crown',  'Maple spring crown',          'Maple',            'Spring',0.75,3.25,'LF',20);

  // Window Casing
  const wcFJP = iSub.run(wcId, 'Finger Joint Pine', 10).lastInsertRowid;
  const wcMDF = iSub.run(wcId, 'Primed MDF',        20).lastInsertRowid;
  iItm.run(wcFJP,'WIN-COL-FJP', 'Colonial Window Casing','Colonial window casing',       'Finger Joint Pine','Colonial',0.75,2.5, 'LF',10);
  iItm.run(wcFJP,'WIN-FLAT-FJP','Flat Window Casing',    'Flat window casing',           'Finger Joint Pine','Flat',    0.75,2.25,'LF',20);
  iItm.run(wcMDF,'WIN-COL-MDF', 'Colonial Window Casing','MDF colonial window casing',   'Primed MDF',       'Colonial',0.75,2.5, 'LF',10);

  // Door Stop
  const stStd = iSub.run(stId, 'Standard', 10).lastInsertRowid;
  iItm.run(stStd,'STP-STD-FJP','Standard Door Stop','Standard interior door stop','Finger Joint Pine','Standard',0.5,1.5,'LF',10);
  iItm.run(stStd,'STP-STD-MDF','Standard Door Stop','MDF door stop',              'Primed MDF',       'Standard',0.5,1.5,'LF',20);

  // Backband
  const bdStd = iSub.run(bdId, 'Standard', 10).lastInsertRowid;
  iItm.run(bdStd,'BBD-STD-FJP','Standard Backband','Applied over casing for depth','Finger Joint Pine','Standard',0.75,1.25,'LF',10);
  iItm.run(bdStd,'BBD-STD-MDF','Standard Backband','MDF backband',                'Primed MDF',       'Standard',0.75,1.25,'LF',20);

  // Handrail
  const hrOak = iSub.run(hrId, 'Oak',               10).lastInsertRowid;
  const hrMap = iSub.run(hrId, 'Maple',             20).lastInsertRowid;
  const hrPin = iSub.run(hrId, 'Finger Joint Pine', 30).lastInsertRowid;
  iItm.run(hrOak,'HND-PRFL-OAK','Oak Handrail',   'Profiled oak handrail',   'Oak',              'Profile',1.75,2.25,'LF',10);
  iItm.run(hrMap,'HND-PRFL-MAP','Maple Handrail', 'Profiled maple handrail', 'Maple',            'Profile',1.75,2.25,'LF',10);
  iItm.run(hrPin,'HND-PRFL-PIN','Pine Handrail',  'Pine handrail',           'Finger Joint Pine','Profile',1.75,2.25,'LF',10);

  // Remaining categories — empty subcategories for vendor
  iSub.run(crRId, 'Standard', 10);
  iSub.run(qrId,  'Standard', 10);
  iSub.run(smId,  'Standard', 10);

  db.exec('COMMIT');
  console.log('✓ Catalog seeded');
}

seedCatalog();

// Set stock_length_ft defaults on seeded items (idempotent — only touches NULLs)
function runMigrations() {
  db.exec(`
    UPDATE catalog_items SET stock_length_ft = 16 WHERE stock_length_ft IS NULL AND unit = 'LF'
      AND subcategory_id IN (SELECT s.id FROM catalog_subcategories s JOIN catalog_categories c ON c.id = s.category_id
        WHERE c.name IN ('Baseboard','Door Casing','Crown Moulding','Window Casing','Backband','Chair Rail','Quarter Round','Shoe Mould'));
    UPDATE catalog_items SET stock_length_ft = 7 WHERE stock_length_ft IS NULL AND unit = 'LF'
      AND subcategory_id IN (SELECT s.id FROM catalog_subcategories s JOIN catalog_categories c ON c.id = s.category_id
        WHERE c.name IN ('Door Stop','Architrave'));
    UPDATE catalog_items SET stock_length_ft = 12 WHERE stock_length_ft IS NULL AND unit = 'LF'
      AND subcategory_id IN (SELECT s.id FROM catalog_subcategories s JOIN catalog_categories c ON c.id = s.category_id
        WHERE c.name IN ('Handrail'));
  `);
}
runMigrations();

// ═══════════════════════════════════════════════════════════
// CATALOG QUERIES
// ═══════════════════════════════════════════════════════════
function getCatalogTree() {
  const classes = db.prepare('SELECT * FROM catalog_classes ORDER BY sort_order').all();
  return classes.map(cls => ({
    ...cls,
    categories: db.prepare('SELECT * FROM catalog_categories WHERE class_id=? ORDER BY sort_order').all(cls.id).map(cat => ({
      ...cat,
      subcategories: db.prepare(`
        SELECT s.*, COUNT(i.id) as item_count
        FROM catalog_subcategories s
        LEFT JOIN catalog_items i ON i.subcategory_id = s.id
        WHERE s.category_id = ?
        GROUP BY s.id ORDER BY s.sort_order
      `).all(cat.id)
    }))
  }));
}

function getItems({ subcategoryId, search, unit } = {}) {
  let sql = `SELECT i.*, s.name as subcategory_name, cat.name as category_name, cls.name as class_name
    FROM catalog_items i
    JOIN catalog_subcategories s ON s.id = i.subcategory_id
    JOIN catalog_categories cat ON cat.id = s.category_id
    JOIN catalog_classes cls ON cls.id = cat.class_id
    WHERE 1=1`;
  const params = [];
  if (subcategoryId) { sql += ' AND i.subcategory_id = ?'; params.push(subcategoryId); }
  if (unit)          { sql += ' AND i.unit = ?'; params.push(unit); }
  if (search) {
    sql += ' AND (i.name LIKE ? OR i.item_number LIKE ? OR i.description LIKE ? OR i.material LIKE ? OR i.profile LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q, q);
  }
  sql += ' ORDER BY i.sort_order, i.name';
  return db.prepare(sql).all(...params);
}

function getItem(id) { return db.prepare('SELECT * FROM catalog_items WHERE id=?').get(id); }

function createItem(data) {
  const r = db.prepare(`INSERT INTO catalog_items
    (subcategory_id,item_number,name,description,material,profile,width_in,height_in,unit,stock_length_ft,in_stock,sort_order)
    VALUES (@subcategory_id,@item_number,@name,@description,@material,@profile,@width_in,@height_in,@unit,@stock_length_ft,@in_stock,@sort_order)
  `).run(data);
  return getItem(r.lastInsertRowid);
}

function updateItem(id, data) {
  db.prepare(`UPDATE catalog_items SET
    item_number=@item_number, name=@name, description=@description,
    material=@material, profile=@profile, width_in=@width_in, height_in=@height_in,
    unit=@unit, stock_length_ft=@stock_length_ft, in_stock=@in_stock, subcategory_id=@subcategory_id,
    updated_at=CURRENT_TIMESTAMP WHERE id=@id
  `).run({ ...data, id });
  return getItem(id);
}

function deleteItem(id) { db.prepare('DELETE FROM catalog_items WHERE id=?').run(id); }

function bulkUpsertItems(items) {
  // items: [{class, category, subcategory, item_number, name, ...}]
  const getSub = db.prepare(`
    SELECT s.id FROM catalog_subcategories s
    JOIN catalog_categories c ON c.id = s.category_id
    JOIN catalog_classes cl ON cl.id = c.class_id
    WHERE cl.name=? AND c.name=? AND s.name=?
  `);
  const upsert = db.prepare(`INSERT INTO catalog_items
    (subcategory_id,item_number,name,description,material,profile,width_in,height_in,unit,stock_length_ft,in_stock,updated_at)
    VALUES (@subcategory_id,@item_number,@name,@description,@material,@profile,@width_in,@height_in,@unit,@stock_length_ft,@in_stock,CURRENT_TIMESTAMP)
    ON CONFLICT(item_number) DO UPDATE SET
      name=excluded.name, description=excluded.description,
      material=excluded.material, profile=excluded.profile,
      width_in=excluded.width_in, height_in=excluded.height_in,
      unit=excluded.unit, stock_length_ft=excluded.stock_length_ft, in_stock=excluded.in_stock,
      subcategory_id=excluded.subcategory_id,
      updated_at=CURRENT_TIMESTAMP`);

  let imported = 0, errors = [];
  db.exec('BEGIN');
  for (const row of items) {
    try {
      const sub = getSub.get(row.class, row.category, row.subcategory);
      if (!sub) { errors.push(`Unknown path: ${row.class} > ${row.category} > ${row.subcategory}`); continue; }
      upsert.run({ ...row, subcategory_id: sub.id });
      imported++;
    } catch(e) { errors.push(`${row.item_number}: ${e.message}`); }
  }
  db.exec('COMMIT');
  return { imported, errors };
}

// ═══════════════════════════════════════════════════════════
// PROJECT QUERIES
// ═══════════════════════════════════════════════════════════
function getProjects() {
  return db.prepare(`
    SELECT p.*, COUNT(DISTINCT t.id) as template_count, COUNT(DISTINCT f.id) as floor_count
    FROM projects p
    LEFT JOIN suite_templates t ON t.project_id = p.id
    LEFT JOIN floors f ON f.project_id = p.id
    GROUP BY p.id ORDER BY p.updated_at DESC
  `).all();
}

function getProject(id) { return db.prepare('SELECT * FROM projects WHERE id=?').get(id); }

function createProject(data) {
  const r = db.prepare('INSERT INTO projects (name,address,waste_factor,notes) VALUES (@name,@address,@waste_factor,@notes)').run(data);
  return getProject(r.lastInsertRowid);
}

function updateProject(id, data) {
  db.prepare('UPDATE projects SET name=@name,address=@address,waste_factor=@waste_factor,notes=@notes,updated_at=CURRENT_TIMESTAMP WHERE id=@id').run({ ...data, id });
  return getProject(id);
}

function deleteProject(id) { db.prepare('DELETE FROM projects WHERE id=?').run(id); }

function getFullProject(id) {
  const project = getProject(id);
  if (!project) return null;

  const templates = db.prepare('SELECT * FROM suite_templates WHERE project_id=? ORDER BY sort_order').all(id).map(t => ({
    ...t,
    rooms: db.prepare('SELECT * FROM template_rooms WHERE template_id=? ORDER BY sort_order').all(t.id).map(r => ({
      ...r,
      doors: db.prepare('SELECT d.*, i.item_number, i.name as item_name FROM template_doors d LEFT JOIN catalog_items i ON i.id=d.catalog_item_id WHERE d.room_id=? ORDER BY d.sort_order').all(r.id),
      trim:  db.prepare('SELECT tr.*, i.item_number, i.name as item_name FROM template_trim tr LEFT JOIN catalog_items i ON i.id=tr.catalog_item_id WHERE tr.room_id=? ORDER BY tr.sort_order').all(r.id)
    })),
    specs: db.prepare('SELECT s.*, i.item_number, i.name as item_name, i.stock_length_ft FROM template_material_specs s LEFT JOIN catalog_items i ON i.id=s.catalog_item_id WHERE s.template_id=?').all(t.id)
  }));

  const floors = db.prepare('SELECT * FROM floors WHERE project_id=? ORDER BY sort_order').all(id).map(f => ({
    ...f,
    units: db.prepare('SELECT u.*, t.name as template_name FROM units u LEFT JOIN suite_templates t ON t.id=u.template_id WHERE u.floor_id=? ORDER BY u.sort_order').all(f.id),
    commonRooms: db.prepare('SELECT * FROM common_rooms WHERE floor_id=? ORDER BY sort_order').all(f.id).map(r => ({
      ...r,
      doors: db.prepare('SELECT d.*, i.item_number, i.name as item_name FROM common_doors d LEFT JOIN catalog_items i ON i.id=d.catalog_item_id WHERE d.room_id=? ORDER BY d.sort_order').all(r.id),
      trim:  db.prepare('SELECT tr.*, i.item_number, i.name as item_name FROM common_trim tr LEFT JOIN catalog_items i ON i.id=tr.catalog_item_id WHERE tr.room_id=? ORDER BY tr.sort_order').all(r.id)
    }))
  }));

  const commonSpecs = db.prepare('SELECT s.*, i.item_number, i.name as item_name, i.stock_length_ft FROM project_common_specs s LEFT JOIN catalog_items i ON i.id=s.catalog_item_id WHERE s.project_id=?').all(id);
  return { project, templates, floors, commonSpecs };
}

// Save template (full replace of rooms/doors/trim)
function saveTemplate(templateId, { name, default_door_height, rooms }) {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE suite_templates SET name=?,default_door_height=? WHERE id=?').run(name, default_door_height || 80, templateId);
    // Get existing room IDs and delete ones not in new data
    const existingRoomIds = db.prepare('SELECT id FROM template_rooms WHERE template_id=?').all(templateId).map(r => r.id);
    const newRoomIds = rooms.filter(r => r.id).map(r => r.id);
    existingRoomIds.filter(id => !newRoomIds.includes(id)).forEach(id =>
      db.prepare('DELETE FROM template_rooms WHERE id=?').run(id)
    );

    rooms.forEach((room, ri) => {
      let roomId = room.id;
      if (roomId) {
        db.prepare('UPDATE template_rooms SET name=?,notes=?,sort_order=? WHERE id=?').run(room.name, room.notes || '', ri, roomId);
      } else {
        roomId = db.prepare('INSERT INTO template_rooms (template_id,name,notes,sort_order) VALUES (?,?,?,?)').run(templateId, room.name, room.notes || '', ri).lastInsertRowid;
      }
      db.prepare('DELETE FROM template_doors WHERE room_id=?').run(roomId);
      db.prepare('DELETE FROM template_trim WHERE room_id=?').run(roomId);
      (room.doors || []).forEach((d, di) =>
        db.prepare('INSERT INTO template_doors (room_id,catalog_item_id,type,width_in,height_in,qty_drawing,qty_field,sort_order) VALUES (?,?,?,?,?,?,?,?)').run(roomId, d.catalog_item_id || null, d.type, d.width_in || 32, d.height_in || 80, d.qty_drawing || null, d.qty_field || null, di)
      );
      (room.trim || []).forEach((t, ti) =>
        db.prepare('INSERT INTO template_trim (room_id,catalog_item_id,type,lf_drawing,lf_field,sort_order) VALUES (?,?,?,?,?,?)').run(roomId, t.catalog_item_id || null, t.type, t.lf_drawing || null, t.lf_field || null, ti)
      );
    });
    db.exec('COMMIT');
    return db.prepare('SELECT * FROM suite_templates WHERE id=?').get(templateId);
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}

// Save floor (full replace of units/common rooms/doors/trim)
function saveFloor(floorId, { name, default_door_height, units, commonRooms }) {
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE floors SET name=?,default_door_height=? WHERE id=?').run(name, default_door_height || 80, floorId);
    db.prepare('DELETE FROM units WHERE floor_id=?').run(floorId);
    (units || []).forEach((u, ui) =>
      db.prepare('INSERT INTO units (floor_id,name,template_id,sort_order) VALUES (?,?,?,?)').run(floorId, u.name, u.template_id || null, ui)
    );

    const existingCRIds = db.prepare('SELECT id FROM common_rooms WHERE floor_id=?').all(floorId).map(r => r.id);
    const newCRIds = (commonRooms || []).filter(r => r.id).map(r => r.id);
    existingCRIds.filter(id => !newCRIds.includes(id)).forEach(id =>
      db.prepare('DELETE FROM common_rooms WHERE id=?').run(id)
    );

    (commonRooms || []).forEach((room, ri) => {
      let roomId = room.id;
      if (roomId) {
        db.prepare('UPDATE common_rooms SET name=?,notes=?,sort_order=? WHERE id=?').run(room.name, room.notes || '', ri, roomId);
      } else {
        roomId = db.prepare('INSERT INTO common_rooms (floor_id,name,notes,sort_order) VALUES (?,?,?,?)').run(floorId, room.name, room.notes || '', ri).lastInsertRowid;
      }
      db.prepare('DELETE FROM common_doors WHERE room_id=?').run(roomId);
      db.prepare('DELETE FROM common_trim WHERE room_id=?').run(roomId);
      (room.doors || []).forEach((d, di) =>
        db.prepare('INSERT INTO common_doors (room_id,catalog_item_id,type,width_in,height_in,qty_drawing,qty_field,sort_order) VALUES (?,?,?,?,?,?,?,?)').run(roomId, d.catalog_item_id || null, d.type, d.width_in || 32, d.height_in || 80, d.qty_drawing || null, d.qty_field || null, di)
      );
      (room.trim || []).forEach((t, ti) =>
        db.prepare('INSERT INTO common_trim (room_id,catalog_item_id,type,lf_drawing,lf_field,sort_order) VALUES (?,?,?,?,?,?)').run(roomId, t.catalog_item_id || null, t.type, t.lf_drawing || null, t.lf_field || null, ti)
      );
    });
    db.exec('COMMIT');
    return db.prepare('SELECT * FROM floors WHERE id=?').get(floorId);
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}

function saveTemplateSpecs(templateId, specs) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM template_material_specs WHERE template_id=?').run(templateId);
    specs.forEach(s => {
      if (s.catalog_item_id) {
        db.prepare('INSERT INTO template_material_specs (template_id,spec_type,type_label,catalog_item_id) VALUES (?,?,?,?)').run(templateId, s.spec_type, s.type_label, s.catalog_item_id);
      }
    });
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}

function saveProjectCommonSpecs(projectId, specs) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM project_common_specs WHERE project_id=?').run(projectId);
    specs.forEach(s => {
      if (s.catalog_item_id) {
        db.prepare('INSERT INTO project_common_specs (project_id,spec_type,type_label,catalog_item_id) VALUES (?,?,?,?)').run(projectId, s.spec_type, s.type_label, s.catalog_item_id);
      }
    });
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = {
  getCatalogTree, getItems, getItem, createItem, updateItem, deleteItem, bulkUpsertItems,
  getProjects, getProject, createProject, updateProject, deleteProject, getFullProject,
  saveTemplate, saveFloor, saveTemplateSpecs, saveProjectCommonSpecs,
  db  // expose for direct queries in server
};
