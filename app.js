/* ═══════════════════════════════════════════════
   POLAR XPRESS OPS — MAIN APPLICATION
   All logic in one file · No build step required
═══════════════════════════════════════════════ */

'use strict';

// ─── CONFIG ──────────────────────────────────────────────
const CFG = {
  SCRIPT_URL: localStorage.getItem('px_script_url') || '',
  APP_VERSION: '1.0.0',
  SESSION_HOURS: 12,
};

// ─── STATE ───────────────────────────────────────────────
let STATE = {
  user: null,       // { name, role, pin }
  page: 'dashboard',
  salesCache: null,
  today: todayStr(),
};

// ─── HELPERS ─────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

function formatCurrency(n) {
  const num = parseFloat(n) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatTime(str) {
  if (!str) return '';
  return str;
}

function getInitials(name) {
  return (name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function isOwner() {
  return STATE.user && (STATE.user.role === 'owner' || STATE.user.role === 'manager');
}

function el(id) { return document.getElementById(id); }

function html(str) {
  const div = document.createElement('div');
  div.innerHTML = str;
  return div.firstElementChild;
}

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── TOAST ───────────────────────────────────────────────
function toast(msg, type = 'info') {
  const c = el('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ─── MODAL ───────────────────────────────────────────────
function showModal(title, bodyHtml, footerHtml = '') {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML = bodyHtml;
  el('modal-footer').innerHTML = footerHtml;
  el('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  el('modal-overlay').classList.add('hidden');
  el('modal-body').innerHTML = '';
  el('modal-footer').innerHTML = '';
}

// ─── LOCAL STORAGE HELPERS ────────────────────────────────
function ls(key, val) {
  if (val === undefined) {
    try { return JSON.parse(localStorage.getItem('px_' + key)); } catch { return null; }
  }
  localStorage.setItem('px_' + key, JSON.stringify(val));
}

function lsRemove(key) { localStorage.removeItem('px_' + key); }

// ─── STAFF DATA (stored locally + synced to Sheets) ──────
function getStaffList() {
  return ls('staff') || [
    { id: 's1', name: 'Pranav', role: 'owner', pin: '1111', phone: '', active: true },
    { id: 's2', name: 'Raj',    role: 'owner', pin: '2222', phone: '', active: true },
    { id: 's3', name: 'Tej',    role: 'owner', pin: '3333', phone: '', active: true },
  ];
}

function saveStaffList(list) { ls('staff', list); }

// ─── AUTH ─────────────────────────────────────────────────
function authenticate(pin) {
  const staff = getStaffList();
  const match = staff.find(s => s.active && s.pin === pin);
  return match || null;
}

function startSession(user) {
  STATE.user = { name: user.name, role: user.role, pin: user.pin };
  sessionStorage.setItem('px_session', JSON.stringify({
    ...STATE.user,
    expires: Date.now() + (CFG.SESSION_HOURS * 3600 * 1000)
  }));
}

function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem('px_session'));
    if (s && s.expires > Date.now()) {
      STATE.user = { name: s.name, role: s.role, pin: s.pin };
      return true;
    }
  } catch {}
  return false;
}

function logout() {
  sessionStorage.removeItem('px_session');
  STATE.user = null;
  location.reload();
}

// ─── BACKUP ───────────────────────────────────────────────
const BACKUP_KEYS = [
  'staff','sales_log','recon_log','attendance_log','expenses',
  'inventory','sops','vendors','task_templates','daily_task_log',
  'products','product_log','setup_done',
];

async function backupAll(silent = false) {
  const url = ls('script_url') || CFG.SCRIPT_URL;
  if (!url) {
    if (!silent) toast('Set Google Sheets URL in Settings first', 'warning');
    return false;
  }
  const snapshot = {};
  BACKUP_KEYS.forEach(key => {
    const raw = localStorage.getItem('px_' + key);
    if (raw) snapshot[key] = raw;
  });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'fullBackup',
        backupJson: JSON.stringify(snapshot),
        version: CFG.APP_VERSION,
        device: navigator.userAgent.substring(0, 120),
      }),
    });
    const data = await res.json();
    if (data.ok) {
      ls('last_backup', Date.now());
      if (!silent) toast('All data backed up to cloud', 'success');
      return true;
    }
  } catch {}
  if (!silent) toast('Backup failed — check internet connection', 'error');
  return false;
}

async function autoBackupIfNeeded() {
  const url = ls('script_url') || CFG.SCRIPT_URL;
  if (!url) return;
  const last = ls('last_backup') || 0;
  if ((Date.now() - last) >= 24 * 3600 * 1000) {
    await backupAll(true);
  }
}

async function restoreFromBackup() {
  const url = ls('script_url') || CFG.SCRIPT_URL;
  if (!url) { toast('Set Google Sheets URL in Settings first', 'warning'); return; }
  if (!confirm('Restore all data from your last cloud backup?\n\nThis will overwrite your current local data. The page will reload.')) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'getLatestBackup' }),
    });
    const data = await res.json();
    if (!data.ok || !data.result?.backupJson) { toast('No backup found in cloud', 'error'); return; }
    const snapshot = JSON.parse(data.result.backupJson);
    Object.entries(snapshot).forEach(([key, val]) => localStorage.setItem('px_' + key, val));
    toast(`Restored from ${data.result.timestamp}`, 'success');
    setTimeout(() => location.reload(), 1500);
  } catch {
    toast('Restore failed — check internet connection', 'error');
  }
}

// ─── GOOGLE SHEETS API ────────────────────────────────────
async function apiCall(action, payload = {}) {
  const url = ls('script_url') || CFG.SCRIPT_URL;
  if (!url) {
    // Offline mode — store to local queue
    const queue = ls('offline_queue') || [];
    queue.push({ action, payload, timestamp: Date.now() });
    ls('offline_queue', queue);
    toast('Saved locally (no Sheets URL set)', 'warning');
    return { ok: false, offline: true };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    return { ok: true, data };
  } catch (e) {
    // Queue for retry
    const queue = ls('offline_queue') || [];
    queue.push({ action, payload, timestamp: Date.now() });
    ls('offline_queue', queue);
    toast('Saved locally — will sync when online', 'warning');
    return { ok: false, offline: true };
  }
}

async function syncOfflineQueue() {
  const queue = ls('offline_queue') || [];
  if (!queue.length) return;
  const url = ls('script_url') || CFG.SCRIPT_URL;
  if (!url) return;
  const failed = [];
  for (const item of queue) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: item.action, ...item.payload }),
      });
    } catch {
      failed.push(item);
    }
  }
  ls('offline_queue', failed);
  if (queue.length !== failed.length) toast(`Synced ${queue.length - failed.length} offline records`, 'success');
}

// ─── LOCAL DATA STORES ────────────────────────────────────
function getSalesLog() { return ls('sales_log') || []; }
function saveSalesLog(d) { ls('sales_log', d); }

function getReconLog() { return ls('recon_log') || []; }
function saveReconLog(d) { ls('recon_log', d); }

function getAttendanceLog() { return ls('attendance_log') || []; }
function saveAttendanceLog(d) { ls('attendance_log', d); }

function getExpenses() { return ls('expenses') || []; }
function saveExpenses(d) { ls('expenses', d); }

function getVendors() { return ls('vendors') || DEFAULT_VENDORS; }
function saveVendors(d) { ls('vendors', d); }

const DEFAULT_VENDORS = [
  {id:'v001',name:'Hyperpure',contact:'Zomato Hyperpure',phone:'1800-103-7373',email:'',categories:'Dairy, Dry Goods, Sauces',notes:'Online ordering via app'},
  {id:'v002',name:'Blinkit',contact:'Blinkit App',phone:'',email:'',categories:'Fresh Produce, Dairy',notes:'Quick delivery, order via app'},
  {id:'v003',name:'Pepiccacy',contact:'Parth',phone:'9833402731',email:'',categories:'Pizza Pops',notes:''},
  {id:'v004',name:'Iraqui Bakery',contact:'',phone:'09821230301',email:'',categories:'Bread',notes:'Also: 07860275865'},
  {id:'v005',name:'Jaffe',contact:'Raj',phone:'09822973797',email:'',categories:'Slurrrps - Fruit Flavours',notes:''},
  {id:'v006',name:'Oishii Foods',contact:'Raj',phone:'08425981612',email:'',categories:'Passion Fruit Syrup, Raspberry Boba',notes:''},
  {id:'v007',name:'Nutaste / Uni Foods / Premiyumm Food',contact:'Aditya',phone:'07007673552',email:'',categories:'Seasonings, Syrups',notes:''},
  {id:'v008',name:'MS Traders',contact:'Furqan Shaikh',phone:'09987620726',email:'',categories:'Kokum Syrup',notes:''},
  {id:'v009',name:'Biour Hygiene Solutions',contact:'Dakshita',phone:'09082501930',email:'',categories:'Cups, Lids, Bowls',notes:''},
  {id:'v010',name:'Crafeo',contact:'',phone:'',email:'',categories:'Packaging - Boxes, Tissue',notes:''},
  {id:'v011',name:'Masjid Bunder - Liberty Traders',contact:'',phone:'9870513352',email:'',categories:'PP Straws',notes:''},
  {id:'v012',name:'Eco Mitra',contact:'',phone:'9785677770',email:'',categories:'White Straws',notes:''},
  {id:'v013',name:'Crawford Market - Swaad Shop No. 525',contact:'Bhavesh Gala',phone:'07977132658',email:'',categories:'Truffle, Tajin, Crawford Market items',notes:'Shop No. 525'},
  {id:'v014',name:'Chenab Impex',contact:'',phone:'8291466419',email:'',categories:'White Truffle Oil',notes:''},
  {id:'v015',name:'Urban Platter',contact:'Janesh',phone:'09820560664',email:'',categories:'Wasabi Powder',notes:''},
  {id:'v016',name:'A1 Surat',contact:'Aslam',phone:'09377712360',email:'',categories:'Coco Powder',notes:''},
  {id:'v017',name:'Zohaib Khan',contact:'Zohaib',phone:'8898551496',email:'',categories:'Jain Frozen Fries',notes:''},
  {id:'v018',name:'Raju Ki Chai',contact:'',phone:'',email:'',categories:'Peri Peri Powder Jain',notes:''},
  {id:'v019',name:'Veeba',contact:'',phone:'',email:'',categories:'Sauces, Condiments',notes:''},
  {id:'v020',name:'Zepto',contact:'',phone:'',email:'',categories:'Butter Croissants',notes:'Quick delivery app'},
];

function getProducts() { return ls('products') || DEFAULT_PRODUCTS; }
function saveProducts(d) { ls('products', d); }
function getProductLog() { return ls('product_log') || []; }
function saveProductLog(d) { ls('product_log', d); }

const DEFAULT_PRODUCTS = [
  {
    id:'prod001', name:'Pizza Pops (Box of 2)', category:'Pizza Pops',
    avgSellingPrice:114.28, fixedCostPerUnit:10, servingLabel:'box', active:true,
    ingredients:[
      {id:'pi1',name:'Pizza Pop',costPerPc:21.51,qtyPerUnit:2,unit:'pc',isPackaging:false},
      {id:'pi2',name:'Oregano Sachet',costPerPc:0.54,qtyPerUnit:1,unit:'pc',isPackaging:false},
      {id:'pi3',name:'Chilli Flakes Sachet',costPerPc:0.54,qtyPerUnit:1,unit:'pc',isPackaging:false},
      {id:'pi4',name:'Ketchup',costPerPc:0.95,qtyPerUnit:1,unit:'pc',isPackaging:false},
      {id:'pi5',name:'Blue Lunch Box',costPerPc:6.62,qtyPerUnit:1,unit:'pc',isPackaging:true},
      {id:'pi6',name:'Butter Paper',costPerPc:2.00,qtyPerUnit:1,unit:'pc',isPackaging:true},
      {id:'pi7',name:'Single Ply Tissue Paper',costPerPc:2.00,qtyPerUnit:4,unit:'pc',isPackaging:true},
    ]
  },
  {
    id:'prod002', name:'Classic Blue Slushy', category:'Slushies',
    avgSellingPrice:99, fixedCostPerUnit:5, servingLabel:'cup', active:true,
    ingredients:[
      {id:'si1',name:'Slushy Syrup (Blue)',costPerPc:8,qtyPerUnit:1,unit:'serving',isPackaging:false},
      {id:'si2',name:'Slushy Cup (Large)',costPerPc:5,qtyPerUnit:1,unit:'pc',isPackaging:true},
      {id:'si3',name:'Dome Lid',costPerPc:2,qtyPerUnit:1,unit:'pc',isPackaging:true},
      {id:'si4',name:'Straw',costPerPc:0.5,qtyPerUnit:1,unit:'pc',isPackaging:true},
    ]
  },
  {
    id:'prod003', name:'Rose Milk Slushy', category:'Slushies',
    avgSellingPrice:99, fixedCostPerUnit:5, servingLabel:'cup', active:true,
    ingredients:[
      {id:'ri1',name:'Rose Syrup',costPerPc:6,qtyPerUnit:1,unit:'serving',isPackaging:false},
      {id:'ri2',name:'Milk',costPerPc:4,qtyPerUnit:1,unit:'serving',isPackaging:false},
      {id:'ri3',name:'Slushy Cup (Large)',costPerPc:5,qtyPerUnit:1,unit:'pc',isPackaging:true},
      {id:'ri4',name:'Dome Lid',costPerPc:2,qtyPerUnit:1,unit:'pc',isPackaging:true},
      {id:'ri5',name:'Straw',costPerPc:0.5,qtyPerUnit:1,unit:'pc',isPackaging:true},
    ]
  },
];

function getTaskTemplates() { return ls('task_templates') || DEFAULT_TASKS; }
function saveTaskTemplates(d) { ls('task_templates', d); }

function getDailyTaskLog() { return ls('daily_task_log') || []; }
function saveDailyTaskLog(d) { ls('daily_task_log', d); }

// Load or generate today's task instances
function getTodayTasks() {
  const templates = getTaskTemplates();
  const log = getDailyTaskLog();
  // Get or create instances for today
  const todayInstances = log.filter(t => t.date === STATE.today);
  const existingIds = new Set(todayInstances.map(t => t.templateId));
  // Add missing templates as fresh instances
  const fresh = templates
    .filter(t => t.active !== false && !existingIds.has(t.id))
    .map(t => ({ date: STATE.today, templateId: t.id, title: t.title, shift: t.shift, done: false, doneBy: '', doneAt: '' }));
  if (fresh.length) {
    const updated = [...log, ...fresh];
    saveDailyTaskLog(updated);
    return [...todayInstances, ...fresh];
  }
  return todayInstances;
}

const DEFAULT_TASKS = [
  {id:'t01',title:'Unlock shop & turn on all lights',shift:'opening',active:true},
  {id:'t02',title:'Turn on slushy machine (30 min warm-up)',shift:'opening',active:true},
  {id:'t03',title:'Check all equipment — fridge, blender, EDC machine',shift:'opening',active:true},
  {id:'t04',title:'Check stock levels for syrups, milk & cups',shift:'opening',active:true},
  {id:'t05',title:'Wipe down counter, tables & serving surfaces',shift:'opening',active:true},
  {id:'t06',title:'Check Petpooja POS is working',shift:'opening',active:true},
  {id:'t07',title:'Confirm float cash is in the drawer',shift:'opening',active:true},
  {id:'t08',title:'Mosambee EDC charged & online',shift:'opening',active:true},
  {id:'t09',title:'Clock in on app',shift:'opening',active:true},
  {id:'t10',title:'Mid-shift cash count (matches POS?)',shift:'shift',active:true},
  {id:'t11',title:'Restock cups, straws, tissue on counter',shift:'shift',active:true},
  {id:'t12',title:'Wipe down machine nozzle & counter',shift:'shift',active:true},
  {id:'t13',title:'Check slushy machine levels — refill if needed',shift:'shift',active:true},
  {id:'t14',title:'Take out trash if full',shift:'shift',active:true},
  {id:'t15',title:'Enter today\'s sales from Petpooja into app',shift:'closing',active:true},
  {id:'t16',title:'Count cash — denomination-wise',shift:'closing',active:true},
  {id:'t17',title:'Complete Cash Reconciliation in app',shift:'closing',active:true},
  {id:'t18',title:'Drain & clean slushy machine',shift:'closing',active:true},
  {id:'t19',title:'Clean blender, lids & all utensils',shift:'closing',active:true},
  {id:'t20',title:'Wipe all surfaces with sanitizer',shift:'closing',active:true},
  {id:'t21',title:'Empty & clean ice bin',shift:'closing',active:true},
  {id:'t22',title:'Dispose waste — separate wet & dry',shift:'closing',active:true},
  {id:'t23',title:'Turn off all equipment (slushy machine LAST)',shift:'closing',active:true},
  {id:'t24',title:'Lock cash drawer & all cabinets',shift:'closing',active:true},
  {id:'t25',title:'Clock out all staff on app',shift:'closing',active:true},
  {id:'t26',title:'Lock shop & check front door is secure',shift:'closing',active:true},
];

function getInventory() {
  return ls('inventory') || DEFAULT_INVENTORY;
}

const DEFAULT_INVENTORY = [
  {id:"inv001",name:"OG Margherita",category:"Pizza Pops",section:"Kitchen",unit:"6 Pcs",stock:0,reorder:0,price:122.9,tax:6.15,totalCost:129.05,supplier:"Pepiccacy",sku:"",contact:"Parth - 9833402731"},
  {id:"inv002",name:"OG Margherita (Jain)",category:"Pizza Pops",section:"Kitchen",unit:"6 Pcs",stock:0,reorder:0,price:122.9,tax:6.15,totalCost:129.05,supplier:"Pepiccacy",sku:"",contact:""},
  {id:"inv003",name:"Hot Pepper",category:"Pizza Pops",section:"Kitchen",unit:"6 Pcs",stock:0,reorder:0,price:122.9,tax:6.15,totalCost:129.05,supplier:"Pepiccacy",sku:"",contact:""},
  {id:"inv004",name:"Indie Paneer",category:"Pizza Pops",section:"Kitchen",unit:"6 Pcs",stock:0,reorder:0,price:122.9,tax:6.15,totalCost:129.05,supplier:"Pepiccacy",sku:"",contact:""},
  {id:"inv005",name:"Truffle Shroom",category:"Pizza Pops",section:"Kitchen",unit:"6 Pcs",stock:0,reorder:0,price:153.67,tax:7.68,totalCost:161.35,supplier:"Pepiccacy",sku:"",contact:""},
  {id:"inv006",name:"Round Bread",category:"UFO Bombs",section:"Kitchen",unit:"1 Loaf",stock:0,reorder:0,price:90,tax:0,totalCost:90,supplier:"Iraqui Bakery",sku:"",contact:"09821230301 / 07860275865"},
  {id:"inv007",name:"Onions",category:"UFO Bombs",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:35,tax:0,totalCost:35,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv008",name:"Bell Peppers",category:"UFO Bombs",section:"Kitchen",unit:"250G",stock:0,reorder:0,price:25,tax:0,totalCost:25,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv009",name:"Tomatoes",category:"UFO Bombs",section:"Kitchen",unit:"500G",stock:0,reorder:0,price:30,tax:0,totalCost:30,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv010",name:"Corriander",category:"UFO Bombs",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:25,tax:0,totalCost:25,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv011",name:"Amul - Diced Mozzarella Cheese",category:"UFO Bombs",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:530,tax:0,totalCost:530,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv012",name:"Snapin - Oregano",category:"UFO Bombs",section:"Kitchen",unit:"500G",stock:0,reorder:0,price:200,tax:0,totalCost:200,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv013",name:"Snapin - Chilli Flakes",category:"UFO Bombs",section:"Kitchen",unit:"500G",stock:0,reorder:0,price:200,tax:0,totalCost:200,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv014",name:"Button Mushrooms",category:"UFO Bombs",section:"Kitchen",unit:"180G",stock:0,reorder:0,price:55,tax:0,totalCost:55,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv015",name:"Basil",category:"UFO Bombs",section:"Kitchen",unit:"50G",stock:0,reorder:0,price:15,tax:0,totalCost:15,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv016",name:"Green Chillies",category:"UFO Bombs",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:12,tax:0,totalCost:12,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv017",name:"Amul - Frozen Fries",category:"Polar Fries",section:"Kitchen",unit:"2500G",stock:0,reorder:0,price:315,tax:0,totalCost:315,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv018",name:"Jain - Frozen Fries",category:"Polar Fries",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:350,tax:0,totalCost:350,supplier:"Zohaib Khan",sku:"",contact:"8898551496"},
  {id:"inv019",name:"Veeba - Cheesy Melt Chilli Paprika",category:"Polar Fries",section:"Kitchen",unit:"200G",stock:0,reorder:0,price:115,tax:0,totalCost:115,supplier:"Veeba",sku:"",contact:""},
  {id:"inv020",name:"Sarovar - Za'atar Powder",category:"Polar Fries",section:"Kitchen",unit:"400G",stock:0,reorder:0,price:500,tax:0,totalCost:500,supplier:"Amazon",sku:"",contact:""},
  {id:"inv021",name:"Saffola - Sunflower Oil",category:"Polar Fries",section:"Kitchen",unit:"13000G",stock:0,reorder:0,price:2700,tax:0,totalCost:2700,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv022",name:"Castor Sugar",category:"Polar Fries",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:100,tax:0,totalCost:100,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv023",name:"Nutaste - All Purpose Seasoning",category:"Polar Fries",section:"Kitchen",unit:"500G",stock:0,reorder:0,price:158.4,tax:7.92,totalCost:166.32,supplier:"Nutaste / Uni Foods / Premiyumm Food",sku:"",contact:"Aditya - 07007673552"},
  {id:"inv024",name:"Moi Soi - Shezwan Sauce",category:"Polar Fries",section:"Kitchen",unit:"575G",stock:0,reorder:0,price:151,tax:0,totalCost:151,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv025",name:"Chings - Shezwan Sauce (Jain)",category:"Polar Fries",section:"Kitchen",unit:"250G",stock:0,reorder:0,price:95,tax:0,totalCost:95,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv026",name:"Cremica - Chilli Garlic Sauce",category:"Polar Fries",section:"Kitchen",unit:"pcs",stock:0,reorder:0,price:0,tax:0,totalCost:0,supplier:"",sku:"",contact:""},
  {id:"inv027",name:"Spring Onions",category:"Polar Fries",section:"Kitchen",unit:"150G",stock:0,reorder:0,price:30,tax:0,totalCost:30,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv028",name:"Chef's Art - Peri Peri Powder",category:"Polar Fries",section:"Kitchen",unit:"250G",stock:0,reorder:0,price:150,tax:0,totalCost:150,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv029",name:"Raju Ki Chai - Peri Peri Powder (Jain)",category:"Polar Fries",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:275,tax:13.75,totalCost:288.75,supplier:"Raju Ki Chai",sku:"",contact:""},
  {id:"inv030",name:"Wasabi Powder",category:"Polar Fries",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:132.14,tax:6.61,totalCost:138.75,supplier:"Urban Platter",sku:"",contact:"Janesh - 09820560664"},
  {id:"inv031",name:"Amul - Cheese Block",category:"Others",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:550,tax:0,totalCost:550,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv032",name:"Amul - Butter",category:"Others",section:"Kitchen",unit:"500G",stock:0,reorder:0,price:290,tax:0,totalCost:290,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv033",name:"Peeled Garlic",category:"Others",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:40,tax:0,totalCost:40,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv034",name:"Kissan - Ketchup",category:"Others",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:204.75,tax:0,totalCost:204.75,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv035",name:"Urbani - White Truffle Oil",category:"Others",section:"Kitchen",unit:"250G",stock:0,reorder:0,price:1650,tax:82.5,totalCost:1732.5,supplier:"Chenab Impex",sku:"",contact:"8291466419"},
  {id:"inv036",name:"Thai Bird Eye Chilli",category:"Others",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:20,tax:0,totalCost:20,supplier:"Local Market",sku:"",contact:""},
  {id:"inv037",name:"Mayonnaise",category:"Others",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:140,tax:0,totalCost:140,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv038",name:"Salt",category:"Others",section:"Kitchen",unit:"1000G",stock:0,reorder:0,price:30,tax:0,totalCost:30,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv039",name:"Pepper",category:"Others",section:"Kitchen",unit:"100G",stock:0,reorder:0,price:161,tax:0,totalCost:161,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv040",name:"English Mustard Sauce",category:"Others",section:"Kitchen",unit:"250G",stock:0,reorder:0,price:79,tax:0,totalCost:79,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv041",name:"Wasabi Paste",category:"Others",section:"Kitchen",unit:"43G",stock:0,reorder:0,price:100,tax:0,totalCost:100,supplier:"Crawford Market - Swaad Shop No. 525",sku:"",contact:"Bhavesh Gala - 07977132658"},
  {id:"inv042",name:"Veeba - Oregano",category:"Condiments",section:"Kitchen",unit:"300 Sachets",stock:0,reorder:0,price:190,tax:0,totalCost:190,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv043",name:"Veeba - Chilli Flakes",category:"Condiments",section:"Kitchen",unit:"300 Sachets",stock:0,reorder:0,price:182,tax:0,totalCost:182,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv044",name:"Veeba - Ketchup",category:"Condiments",section:"Kitchen",unit:"100 Sachets",stock:0,reorder:0,price:95,tax:0,totalCost:95,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv045",name:"Veeba - Ketchup (Jain)",category:"Condiments",section:"Kitchen",unit:"100 Sachets",stock:0,reorder:0,price:81,tax:0,totalCost:81,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv046",name:"Passion Fruit Syrup",category:"Slurrrps",section:"Bar",unit:"450ml",stock:0,reorder:0,price:300,tax:15,totalCost:315,supplier:"Oishii Foods",sku:"",contact:"Raj - 08425981612"},
  {id:"inv047",name:"Berry Cooler Syrup",category:"Slurrrps",section:"Bar",unit:"1000ml",stock:0,reorder:0,price:560.4,tax:28.02,totalCost:588.42,supplier:"Nutaste / Uni Foods / Premiyumm Food",sku:"",contact:"Aditya - 07007673552"},
  {id:"inv048",name:"Lime & Lemon",category:"Slurrrps",section:"Bar",unit:"Box of 4",stock:0,reorder:0,price:266.67,tax:13.33,totalCost:280,supplier:"Jaffe",sku:"",contact:"Raj - 09822973797"},
  {id:"inv049",name:"Mango Thick",category:"Slurrrps",section:"Bar",unit:"Box of 2",stock:0,reorder:0,price:371.43,tax:18.57,totalCost:390,supplier:"Jaffe",sku:"",contact:""},
  {id:"inv050",name:"Blueberry",category:"Slurrrps",section:"Bar",unit:"Box of 4",stock:0,reorder:0,price:285.71,tax:14.29,totalCost:300,supplier:"Jaffe",sku:"",contact:""},
  {id:"inv051",name:"Pineapple",category:"Slurrrps",section:"Bar",unit:"Box of 4",stock:0,reorder:0,price:285.71,tax:14.29,totalCost:300,supplier:"Jaffe",sku:"",contact:""},
  {id:"inv052",name:"Orange",category:"Slurrrps",section:"Bar",unit:"Box of 4",stock:0,reorder:0,price:285.71,tax:14.29,totalCost:300,supplier:"Jaffe",sku:"",contact:""},
  {id:"inv053",name:"Mala's - Kokum",category:"Slurrrps",section:"Bar",unit:"750ml",stock:0,reorder:0,price:115,tax:5.75,totalCost:120.75,supplier:"MS Traders",sku:"",contact:"Furqan Shaikh - 09987620726"},
  {id:"inv054",name:"David Off - Fine Aroma",category:"Slurrrps",section:"Bar",unit:"100G",stock:0,reorder:0,price:660,tax:0,totalCost:660,supplier:"Crawford Market - Swaad Shop No. 525",sku:"",contact:"Bhavesh Gala - 07977132658"},
  {id:"inv055",name:"Sugar",category:"Slurrrps",section:"Bar",unit:"5000G",stock:0,reorder:0,price:248,tax:12.4,totalCost:260.4,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv056",name:"Coco Powder",category:"Coco",section:"Bar",unit:"200G",stock:0,reorder:0,price:56,tax:0,totalCost:56,supplier:"A1 Surat",sku:"",contact:"Aslam - 09377712360"},
  {id:"inv057",name:"Gokul - Full Cream Milk",category:"Coco",section:"Bar",unit:"500ml",stock:0,reorder:0,price:38,tax:0,totalCost:38,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv058",name:"Tajin Powder",category:"Add Ons",section:"Bar",unit:"142G",stock:0,reorder:0,price:500,tax:0,totalCost:500,supplier:"Crawford Market - Swaad Shop No. 525",sku:"",contact:"Bhavesh Gala - 07977132658"},
  {id:"inv059",name:"Magic Pops - Popping Candy",category:"Add Ons",section:"Bar",unit:"Box of 40",stock:0,reorder:0,price:150,tax:0,totalCost:150,supplier:"Crawford Market - Swaad Shop No. 525",sku:"",contact:""},
  {id:"inv060",name:"Kyo World - Raspberry Boba",category:"Add Ons",section:"Bar",unit:"1200G",stock:0,reorder:0,price:425,tax:21.25,totalCost:446.25,supplier:"Oishii Foods",sku:"",contact:"Raj - 08425981612"},
  {id:"inv061",name:"Nutaste - Butterfly Lemonade Syrup",category:"Add Ons",section:"Bar",unit:"1000ml",stock:0,reorder:0,price:590.4,tax:29.52,totalCost:619.92,supplier:"Nutaste / Uni Foods / Premiyumm Food",sku:"",contact:"Aditya - 7007673552"},
  {id:"inv062",name:"Habit - Squeezed Lemon Juice",category:"Add Ons",section:"Bar",unit:"1000ml",stock:0,reorder:0,price:125,tax:0,totalCost:125,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv063",name:"Tropilite - Whipped Cream",category:"Add Ons",section:"Bar",unit:"1000G",stock:0,reorder:0,price:163,tax:0,totalCost:163,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv064",name:"Amul Gold - Vanilla Ice Cream",category:"Add Ons",section:"Bar",unit:"1000ml",stock:0,reorder:0,price:230,tax:0,totalCost:230,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv065",name:"Milk Maid - Condensed Milk",category:"Add Ons",section:"Bar",unit:"5000G",stock:0,reorder:0,price:1670,tax:0,totalCost:1670,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv066",name:"Thumbs Up",category:"Add Ons",section:"Bar",unit:"Pack of 28",stock:0,reorder:0,price:514,tax:0,totalCost:514,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv067",name:"Green Chillies",category:"Add Ons",section:"Bar",unit:"100G",stock:0,reorder:0,price:12,tax:0,totalCost:12,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv068",name:"Cashews",category:"Add Ons",section:"Bar",unit:"200G",stock:0,reorder:0,price:220,tax:0,totalCost:220,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv069",name:"Butter Croissants",category:"Add Ons",section:"Bar",unit:"60",stock:0,reorder:0,price:130,tax:0,totalCost:130,supplier:"Zepto",sku:"",contact:""},
  {id:"inv070",name:"Lemons",category:"Add Ons",section:"Bar",unit:"200G",stock:0,reorder:0,price:60,tax:0,totalCost:60,supplier:"Blinkit",sku:"",contact:""},
  {id:"inv071",name:"Chaat Masala",category:"Add Ons",section:"Bar",unit:"100G",stock:0,reorder:0,price:70,tax:0,totalCost:70,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv072",name:"Blue Lunch Box",category:"Packaging",section:"Packaging",unit:"750ml",stock:0,reorder:0,price:6.3,tax:0.32,totalCost:6.62,supplier:"Crafeo",sku:"",contact:""},
  {id:"inv073",name:"Single Ply Tissue Paper (12x12)",category:"Packaging",section:"Packaging",unit:"(12x12)",stock:0,reorder:0,price:0.3,tax:0.01,totalCost:0.32,supplier:"Crafeo",sku:"",contact:""},
  {id:"inv074",name:"Butter Paper (12x12)",category:"Packaging",section:"Packaging",unit:"1 Pc",stock:0,reorder:0,price:2.25,tax:0.4,totalCost:2.65,supplier:"Crafeo",sku:"",contact:""},
  {id:"inv075",name:"Wooden Forks",category:"Packaging",section:"Packaging",unit:"NA",stock:0,reorder:0,price:0.6,tax:0.11,totalCost:0.71,supplier:"Crafeo",sku:"",contact:""},
  {id:"inv076",name:"White Salad Bowl",category:"Packaging",section:"Packaging",unit:"1000ml",stock:0,reorder:0,price:10,tax:1.8,totalCost:11.8,supplier:"Biour Hygiene Solutions",sku:"",contact:"Dakshita - 09082501930"},
  {id:"inv077",name:"Salad Bowl Lid",category:"Packaging",section:"Packaging",unit:"NA",stock:0,reorder:0,price:3.5,tax:0.63,totalCost:4.13,supplier:"Biour Hygiene Solutions",sku:"",contact:""},
  {id:"inv078",name:"PET U-Shaped Cup",category:"Packaging",section:"Packaging",unit:"360ml",stock:0,reorder:0,price:7.5,tax:1.35,totalCost:8.85,supplier:"Biour Hygiene Solutions",sku:"",contact:""},
  {id:"inv079",name:"Dome Lids",category:"Packaging",section:"Packaging",unit:"90mm",stock:0,reorder:0,price:2,tax:0.36,totalCost:2.36,supplier:"Biour Hygiene Solutions",sku:"",contact:""},
  {id:"inv080",name:"2pc Cup Holder",category:"Packaging",section:"Packaging",unit:"2pc",stock:0,reorder:0,price:4.5,tax:0.23,totalCost:4.72,supplier:"Biour Hygiene Solutions",sku:"",contact:""},
  {id:"inv081",name:"10MM PP Straws",category:"Packaging",section:"Packaging",unit:"10mm",stock:0,reorder:0,price:1,tax:0,totalCost:1,supplier:"Masjid Bunder - Liberty Traders",sku:"",contact:"9870513352"},
  {id:"inv082",name:"White Straws",category:"Packaging",section:"Packaging",unit:"8mm",stock:0,reorder:0,price:0.6,tax:0.11,totalCost:0.71,supplier:"Eco Mitra",sku:"",contact:"9785677770"},
  {id:"inv083",name:"Doggy Bags - Small",category:"Packaging",section:"Packaging",unit:"Small",stock:0,reorder:0,price:1.78,tax:0.09,totalCost:1.87,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv084",name:"Doggy Bags - Large",category:"Packaging",section:"Packaging",unit:"Large",stock:0,reorder:0,price:1.85,tax:0.09,totalCost:1.94,supplier:"Hyperpure",sku:"",contact:""},
  {id:"inv085",name:"Insulated Bags",category:"Packaging",section:"Packaging",unit:"Small",stock:0,reorder:0,price:8.86,tax:1.59,totalCost:10.45,supplier:"Hyperpure",sku:"",contact:""},
];
function saveInventory(d) { ls('inventory', d); }

function getSOPs() {
  return ls('sops') || DEFAULT_SOPS;
}
function saveSOPs(d) { ls('sops', d); }

// ─── DEFAULT SOPs ─────────────────────────────────────────
const DEFAULT_SOPS = [
  {
    id: 'sop1', category: 'opening', title: 'Opening Checklist',
    type: 'checklist',
    steps: [
      'Unlock the shop and turn on all lights',
      'Check that all equipment is plugged in (slushy machine, blender, fridge)',
      'Turn on slushy machine — allow 30 min warm-up before serving',
      'Check stock levels for all syrups, milk, and cups',
      'Wipe down counter, tables, and all serving surfaces',
      'Check that the POS (Petpooja) is working — test a dummy order',
      'Ensure the float cash (opening cash) is in the drawer',
      'Check that the Mosambee EDC machine is charged and online',
      'Switch on social media / open sign',
      'Log in to this app and clock in',
    ]
  },
  {
    id: 'sop2', category: 'closing', title: 'Closing Checklist',
    type: 'checklist',
    steps: [
      'Stop accepting orders 15 minutes before closing time',
      'Count cash in drawer — note denomination-wise total',
      'Enter today\'s settlement from Petpooja into this app',
      'Complete Cash Reconciliation in this app',
      'Empty and clean the slushy machine (drain, rinse, wipe)',
      'Clean blender jar, lids, and all utensils',
      'Wipe down counter and all surfaces with sanitizer',
      'Empty and clean the ice bin',
      'Dispose of all waste — separate wet and dry',
      'Turn off all equipment — slushy machine LAST',
      'Lock all cabinets and the cash drawer',
      'Clock out all staff in this app',
      'Log tomorrow\'s opening float in Expense Log if cash is left',
      'Lock shop — check front door is secure',
    ]
  },
  {
    id: 'sop3', category: 'cleaning', title: 'Slushy Machine Cleaning',
    type: 'steps',
    steps: [
      'Turn off the machine and wait 10 minutes',
      'Remove the dispensing nozzle and hopper lid',
      'Drain remaining slush into a container (discard or refrigerate)',
      'Rinse the hopper with warm water — drain again',
      'Mix 1 cap sanitizing solution with 2L warm water — pour into hopper',
      'Run the machine briefly to circulate the solution through the nozzle',
      'Drain completely — rinse twice with clean water',
      'Wipe down exterior with a damp cloth + sanitizer',
      'Dry all parts before reassembling',
      'Refill with fresh slush mix for next day',
    ]
  },
  {
    id: 'sop4', category: 'handling', title: 'Cash Handling Protocol',
    type: 'steps',
    steps: [
      'Always count cash in front of the customer before processing',
      'Never leave the cash drawer open between transactions',
      'For UPI payments — wait for the payment app confirmation sound/notification',
      'For card payments — always check the Mosambee EDC machine shows "Approved"',
      'Large notes (₹2000, ₹500) — check with UV light or feel the security thread',
      'If a customer disputes a payment — call Pranav immediately, don\'t argue',
      'At every 2 hours, count cash in drawer and note if it matches POS',
      'Never carry personal money in the cash drawer',
    ]
  },
  {
    id: 'sop5', category: 'recipes', title: 'Classic Blue Slushy',
    type: 'steps',
    steps: [
      'Add 30ml Blue Curacao syrup to cup',
      'Add 20ml lime cordial',
      'Fill with slushy machine ice (300ml)',
      'Add 60ml soda water — stir gently',
      'Garnish with lemon slice on rim',
      'Seal with lid, insert straw at angle',
      'Serve immediately — slushies melt fast',
    ]
  },
  {
    id: 'sop6', category: 'recipes', title: 'Rose Milk Slushy',
    type: 'steps',
    steps: [
      'Add 25ml rose syrup to cup',
      'Add 100ml chilled full cream milk',
      'Fill with slushy machine ice (250ml)',
      'Stir gently — do not over-mix or it separates',
      'Serve immediately with straw',
      'Do NOT add soda water to milk-based slushies',
    ]
  },
  {
    id: 'sop7', category: 'handling', title: 'Customer Complaint Protocol',
    type: 'steps',
    steps: [
      'Listen to the customer without interrupting',
      'Apologize sincerely regardless of fault — "I\'m sorry for the trouble"',
      'Offer to remake the order OR give store credit',
      'Do not offer refunds > ₹100 without calling Pranav',
      'Log the complaint in the Expense Log as "Complaints" category with details',
      'If customer gets aggressive — stay calm, call Pranav, do not escalate',
      'Thank the customer for the feedback before they leave',
    ]
  },
];

// ─── ROUTER ──────────────────────────────────────────────
function navigate(page) {
  // Refresh today's date in case the app was left open overnight
  STATE.today = todayStr();

  // Close any open overlays
  el('more-overlay').classList.add('hidden');
  el('modal-overlay').classList.add('hidden');

  STATE.page = page;

  // Update nav active state
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  // Update header
  const titles = {
    dashboard:      ['Dashboard', ''],
    sales:          ['Daily Sales', 'Enter POS settlement data'],
    reconciliation: ['Cash Reconciliation', 'Count & verify cash'],
    staff:          ['Staff Tracker', 'Attendance & clock in/out'],
    expenses:       ['Expense Log', 'Petty cash & daily expenses'],
    inventory:      ['Inventory', 'Stock levels & consumption'],
    sops:           ['SOPs', 'Checklists & procedures'],
    tasks:          ['Task Tracker', 'Opening, shift & closing checklists'],
    vendors:        ['Vendors', 'Supplier contacts & details'],
    manage:         ['Manage Items', 'Edit or delete inventory, expenses & SOPs'],
    settings:       ['Settings', 'Staff, PINs & config'],
    history:        ['Sales History', ''],
    pnl:            ['Profit & Loss', 'Revenue, expenses & net margins'],
    products:       ['Product Tracker', 'Daily sales, food cost & packaging'],
  };
  const [title, sub] = titles[page] || [page, ''];
  el('page-title').textContent = title;
  el('page-subtitle').textContent = sub;

  // Render page
  const main = el('main-content');
  main.innerHTML = '';
  const pages = {
    dashboard, sales, reconciliation, staff, expenses, inventory, sops, tasks, vendors, manage, settings, pnl, products
  };
  if (pages[page]) pages[page](main);
  else main.innerHTML = `<p class="text-muted text-center" style="padding:40px">Page not found</p>`;

  // Scroll to top
  main.scrollTop = 0;
  window.scrollTo(0, 0);
}

// ════════════════════════════════════════════════════════════
//   PAGE: DASHBOARD
// ════════════════════════════════════════════════════════════
function dashboard(main) {
  const todaySales = getSalesLog().filter(s => s.date === STATE.today);
  const todayExpenses = getExpenses().filter(e => e.date === STATE.today);
  const todayRecon = getReconLog().find(r => r.date === STATE.today);
  const attendance = getAttendanceLog().filter(a => a.date === STATE.today);
  const clocked = attendance.filter(a => a.clockIn && !a.clockOut);
  const inventory = getInventory();
  const lowStock = inventory.filter(i => i.reorder > 0 && i.stock <= i.reorder);

  const totalSales = todaySales.reduce((s, e) => s + (parseFloat(e.totalSales) || 0), 0);
  const totalCash = todaySales.reduce((s, e) => s + (parseFloat(e.cash) || 0), 0);
  const totalCard = todaySales.reduce((s, e) => s + (parseFloat(e.card) || 0), 0);
  const totalUpi = todaySales.reduce((s, e) => s + (parseFloat(e.upi) || 0), 0);
  const totalExpense = todayExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const todayProfit = totalSales - totalExpense;

  const monthStart = STATE.today.slice(0, 7) + '-01';
  const allSales = getSalesLog();
  const allExpenses = getExpenses();
  const monthRevenue = allSales.filter(s => s.date >= monthStart && s.date <= STATE.today).reduce((s, e) => s + (parseFloat(e.totalSales) || 0), 0);
  const monthExpTotal = allExpenses.filter(e => e.date >= monthStart && e.date <= STATE.today).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const monthProfit = monthRevenue - monthExpTotal;

  let reconBadge = '';
  if (todayRecon) {
    const diff = parseFloat(todayRecon.difference) || 0;
    if (diff === 0) reconBadge = `<span class="badge badge-green">✓ Matched</span>`;
    else if (diff < 0) reconBadge = `<span class="badge badge-red">Short ${formatCurrency(Math.abs(diff))}</span>`;
    else reconBadge = `<span class="badge badge-yellow">Over ${formatCurrency(diff)}</span>`;
  } else {
    reconBadge = `<span class="badge badge-gray">Pending</span>`;
  }

  main.innerHTML = `
    <div class="greeting">${greetingWord()}, ${STATE.user.name} 👋</div>
    <div class="greeting-sub">${new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>

    ${lowStock.length ? `<div class="alert-banner alert-warning">⚠ ${lowStock.length} item${lowStock.length > 1 ? 's' : ''} low on stock — check Inventory</div>` : ''}
    ${!todaySales.length ? `<div class="alert-banner alert-warning">📊 Today's sales not entered yet</div>` : ''}

    <div class="stat-grid">
      <div class="stat-card ${todaySales.length ? 'accent' : ''}">
        <div class="stat-label">Today's Sales</div>
        <div class="stat-value text-accent">${formatCurrency(totalSales)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cash</div>
        <div class="stat-value">${formatCurrency(totalCash)}</div>
      </div>
      <div class="stat-card ${totalExpense > 0 ? 'red' : ''}">
        <div class="stat-label">Expenses</div>
        <div class="stat-value text-red">${formatCurrency(totalExpense)}</div>
      </div>
      <div class="stat-card ${todayProfit < 0 ? 'red' : (todaySales.length ? 'accent' : '')}">
        <div class="stat-label">Today's Profit</div>
        <div class="stat-value ${todayProfit < 0 ? 'text-red' : 'text-accent'}">${formatCurrency(todayProfit)}</div>
      </div>
    </div>

    ${isOwner() ? `
    <div class="section-header" style="margin-top:4px">
      <span class="section-title">This Month</span>
      <button class="btn btn-sm btn-secondary" onclick="navigate('pnl')">Full P&L →</button>
    </div>
    <div class="stat-grid">
      <div class="stat-card accent">
        <div class="stat-label">Revenue</div>
        <div class="stat-value text-accent">${formatCurrency(monthRevenue)}</div>
      </div>
      <div class="stat-card ${monthExpTotal > 0 ? 'red' : ''}">
        <div class="stat-label">Expenses</div>
        <div class="stat-value text-red">${formatCurrency(monthExpTotal)}</div>
      </div>
      <div class="stat-card ${monthProfit < 0 ? 'red' : 'accent'}" style="grid-column:span 2">
        <div class="stat-label">Net Profit</div>
        <div class="stat-value ${monthProfit < 0 ? 'text-red' : 'text-accent'}">${formatCurrency(monthProfit)} ${monthRevenue ? `<span style="font-size:0.85rem;font-weight:500;color:var(--text2)">(${(monthProfit/monthRevenue*100).toFixed(1)}%)</span>` : ''}</div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="flex justify-between items-center">
        <span class="card-title" style="margin:0">Cash Reconciliation</span>
        ${reconBadge}
      </div>
      ${todayRecon ? `<p class="text-sm text-muted mt-1">Last counted: ${todayRecon.time || ''} by ${todayRecon.by || ''}</p>` : `<p class="text-sm text-muted mt-1">Enter sales first, then count cash</p>`}
    </div>

    <div class="section-header">
      <span class="section-title">Quick Actions</span>
    </div>
    <div class="action-grid">
      <button class="action-btn" onclick="navigate('sales')">
        <span class="action-icon">₹</span>
        <span>Enter Sales</span>
      </button>
      <button class="action-btn" onclick="navigate('reconciliation')">
        <span class="action-icon">💵</span>
        <span>Count Cash</span>
      </button>
      <button class="action-btn" onclick="navigate('expenses')">
        <span class="action-icon">📋</span>
        <span>Log Expense</span>
      </button>
      <button class="action-btn" onclick="navigate('staff')">
        <span class="action-icon">👥</span>
        <span>Staff</span>
      </button>
      <button class="action-btn" onclick="navigate('sops')">
        <span class="action-icon">📄</span>
        <span>SOPs</span>
      </button>
      <button class="action-btn" onclick="navigate('inventory')">
        <span class="action-icon">📦</span>
        <span>Stock</span>
      </button>
    </div>

    <div class="section-header" style="margin-top:8px">
      <span class="section-title">Staff on Duty Today</span>
    </div>
    <div class="card">
      ${clocked.length
        ? clocked.map(a => `
            <div class="list-item">
              <div class="staff-avatar" style="width:36px;height:36px;font-size:0.9rem">${getInitials(a.name)}</div>
              <div class="list-item-body">
                <div class="list-item-title">${a.name}</div>
                <div class="list-item-sub">Clocked in: ${a.clockIn}</div>
              </div>
              <span class="badge badge-green">In</span>
            </div>`).join('')
        : `<p class="text-muted text-sm">No staff clocked in yet today</p>`
      }
    </div>

    ${isOwner() ? `
    <div class="section-header" style="margin-top:8px">
      <span class="section-title">This Week</span>
    </div>
    <div class="card">${weekSummaryHTML()}</div>
    ` : ''}
  `;
}

function weekSummaryHTML() {
  const sales = getSalesLog();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const daySales = sales.filter(s => s.date === ds);
    const total = daySales.reduce((s, e) => s + (parseFloat(e.totalSales) || 0), 0);
    days.push({ ds, label: d.toLocaleDateString('en-IN', { weekday:'short' }), total });
  }
  const max = Math.max(...days.map(d => d.total), 1);
  return `
    <div style="display:flex;gap:6px;align-items:flex-end;height:80px;padding:4px 0">
      ${days.map(d => `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
          <div style="width:100%;background:${d.ds===STATE.today?'var(--accent)':'var(--bg3)'};border-radius:4px 4px 0 0;height:${Math.max(4,Math.round((d.total/max)*64))}px"></div>
          <span style="font-size:0.62rem;color:var(--text3)">${d.label}</span>
        </div>`).join('')}
    </div>
    <p class="text-xs text-dim text-right mt-1">7-day sales chart</p>
  `;
}

// ════════════════════════════════════════════════════════════
//   PAGE: SALES
// ════════════════════════════════════════════════════════════
function sales(main) {
  const log = getSalesLog();
  const todaySales = log.filter(s => s.date === STATE.today);
  const staffList = getStaffList().filter(s => s.active);

  main.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" id="tab-entry" onclick="switchSalesTab('entry')">Enter Sales</button>
      <button class="tab-btn" id="tab-history" onclick="switchSalesTab('history')">History</button>
    </div>

    <div id="sales-entry-tab">
      <div class="card">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="sales-date" value="${STATE.today}" max="${STATE.today}">
        </div>

        <div class="section-header">
          <span class="section-title">Billing Station</span>
          <button class="btn btn-sm btn-secondary" onclick="addSalesRow()">+ Add User</button>
        </div>
        <div id="sales-rows"></div>

        <div class="section-header" style="margin-top:8px">
          <span class="section-title">Mosambee EDC (Card Machine)</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Orders</label>
            <input type="number" id="edc-orders" placeholder="0" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">Card Amount (₹)</label>
            <input type="number" id="edc-amount" placeholder="0.00" min="0">
          </div>
        </div>

        <div class="recon-result" id="sales-totals-box" style="display:none">
          <div class="recon-row">
            <span class="text-muted">Total Orders</span><strong id="sum-orders">0</strong>
          </div>
          <div class="recon-row">
            <span class="text-muted">Total Sales</span><strong id="sum-total">₹0</strong>
          </div>
          <div class="recon-row">
            <span class="text-muted">Cash</span><span id="sum-cash">₹0</span>
          </div>
          <div class="recon-row">
            <span class="text-muted">Card</span><span id="sum-card">₹0</span>
          </div>
          <div class="recon-row">
            <span class="text-muted">UPI</span><span id="sum-upi">₹0</span>
          </div>
          <div class="recon-row">
            <span class="text-muted">Other</span><span id="sum-other">₹0</span>
          </div>
        </div>

        <button class="btn btn-primary btn-lg mt-2" onclick="submitSales()" id="sales-submit-btn">Save Sales Entry</button>
      </div>
    </div>

    <div id="sales-history-tab" class="hidden">
      ${renderSalesHistory(log)}
    </div>
  `;

  salesRowCount = 0;

  // Wire up live totals
  el('sales-date').addEventListener('change', loadSalesForDate);
  document.getElementById('sales-rows').addEventListener('input', updateSalesTotals);
  el('edc-orders').addEventListener('input', updateSalesTotals);
  el('edc-amount').addEventListener('input', updateSalesTotals);

  // Silently load saved data (or add fresh default row)
  loadSalesForDate(true);
}

let salesRowCount = 0;
function addSalesRow(defaultName = '', silent = false) {
  salesRowCount++;
  const id = 'sr' + salesRowCount;
  const staffList = getStaffList().filter(s => s.active);
  const opts = staffList.map(s => `<option value="${s.name}" ${s.name===defaultName?'selected':''}>${s.name}</option>`).join('');
  const row = document.createElement('div');
  row.id = id;
  row.style = 'background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;margin-bottom:10px';
  row.innerHTML = `
    <div class="flex justify-between items-center mb-2">
      <select style="width:auto;min-width:130px" class="sales-user" data-row="${id}">
        ${opts}
      </select>
      <button onclick="document.getElementById('${id}').remove();updateSalesTotals()" class="btn btn-sm btn-danger">✕</button>
    </div>
    <div class="form-row">
      <div class="form-group" style="margin:0">
        <label class="form-label">Orders</label>
        <input type="number" class="sales-orders" placeholder="0" min="0" data-row="${id}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Net Sales (₹)</label>
        <input type="number" class="sales-net" placeholder="0" min="0" data-row="${id}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Total Sales (₹)</label>
        <input type="number" class="sales-total" placeholder="0" min="0" data-row="${id}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Cash (₹)</label>
        <input type="number" class="sales-cash" placeholder="0" min="0" data-row="${id}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">UPI (₹)</label>
        <input type="number" class="sales-upi" placeholder="0" min="0" data-row="${id}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Other (₹)</label>
        <input type="number" class="sales-other" placeholder="0" min="0" data-row="${id}">
      </div>
    </div>
    <div class="form-row" style="margin-top:6px">
      <div class="form-group" style="margin:0">
        <label class="form-label">Waived Off (₹)</label>
        <input type="number" class="sales-waived" placeholder="0" min="0" data-row="${id}">
      </div>
      <div class="form-group" style="margin:0">
        <label class="form-label">Not Paid (₹)</label>
        <input type="number" class="sales-notpaid" placeholder="0" min="0" data-row="${id}">
      </div>
    </div>
  `;
  el('sales-rows').appendChild(row);
  updateSalesTotals();
}

function updateSalesTotals() {
  let orders = 0, total = 0, cash = 0, card = 0, upi = 0, other = 0;
  document.querySelectorAll('#sales-rows > div').forEach(row => {
    orders += parseFloat(row.querySelector('.sales-orders')?.value) || 0;
    total  += parseFloat(row.querySelector('.sales-total')?.value)  || 0;
    cash   += parseFloat(row.querySelector('.sales-cash')?.value)   || 0;
    upi    += parseFloat(row.querySelector('.sales-upi')?.value)    || 0;
    other  += parseFloat(row.querySelector('.sales-other')?.value)  || 0;
  });
  const edcOrders = parseFloat(el('edc-orders')?.value) || 0;
  const edcAmt    = parseFloat(el('edc-amount')?.value) || 0;
  orders += edcOrders;
  total  += edcAmt;
  card   += edcAmt;

  el('sum-orders').textContent = orders;
  el('sum-total').textContent  = formatCurrency(total);
  el('sum-cash').textContent   = formatCurrency(cash);
  el('sum-card').textContent   = formatCurrency(card);
  el('sum-upi').textContent    = formatCurrency(upi);
  el('sum-other').textContent  = formatCurrency(other);
  el('sales-totals-box').style.display = (orders || total) ? 'flex' : 'none';
}

function loadSalesForDate(silent = false) {
  const date = el('sales-date')?.value;
  if (!date) return;
  const staffList = getStaffList().filter(s => s.active);
  const existing = getSalesLog().filter(s => s.date === date);

  // Always reset rows so switching dates never shows stale data
  el('sales-rows').innerHTML = '';
  salesRowCount = 0;
  el('edc-orders').value = '';
  el('edc-amount').value = '';

  if (existing.length) {
    if (!silent) toast(`Loaded saved data for ${formatDate(date)}`, 'info');
    existing.filter(e => e.billingUser !== 'Mosambee EDC').forEach(e => {
      addSalesRow(e.billingUser);
      const lastRow = el('sales-rows').lastElementChild;
      if (lastRow) {
        const setVal = (cls, v) => { const inp = lastRow.querySelector(cls); if(inp) inp.value = v||''; };
        const sel = lastRow.querySelector('select');
        if (sel) sel.value = e.billingUser;
        setVal('.sales-orders', e.orders);
        setVal('.sales-net', e.netSales);
        setVal('.sales-total', e.totalSales);
        setVal('.sales-cash', e.cash);
        setVal('.sales-upi', e.upi);
        setVal('.sales-other', e.other);
        setVal('.sales-waived', e.waived);
        setVal('.sales-notpaid', e.notPaid);
      }
    });
    const edc = existing.find(e => e.billingUser === 'Mosambee EDC');
    if (edc) {
      el('edc-orders').value = edc.orders || '';
      el('edc-amount').value = edc.totalSales || '';
    }
  } else {
    // No saved data — add one fresh default row
    addSalesRow(staffList[0]?.name || '');
  }
  updateSalesTotals();
}

async function submitSales() {
  const date = el('sales-date').value;
  if (!date) { toast('Select a date', 'error'); return; }

  const entries = [];
  let hasData = false;

  document.querySelectorAll('#sales-rows > div').forEach(row => {
    const user   = row.querySelector('.sales-user')?.value || '';
    const orders = parseFloat(row.querySelector('.sales-orders')?.value) || 0;
    const net    = parseFloat(row.querySelector('.sales-net')?.value) || 0;
    const total  = parseFloat(row.querySelector('.sales-total')?.value) || 0;
    if (orders || total) {
      hasData = true;
      entries.push({
        billingUser: user, orders, netSales: net, totalSales: total,
        cash:    parseFloat(row.querySelector('.sales-cash')?.value) || 0,
        upi:     parseFloat(row.querySelector('.sales-upi')?.value) || 0,
        other:   parseFloat(row.querySelector('.sales-other')?.value) || 0,
        waived:  parseFloat(row.querySelector('.sales-waived')?.value) || 0,
        notPaid: parseFloat(row.querySelector('.sales-notpaid')?.value) || 0,
        card: 0,
      });
    }
  });

  const edcOrders = parseFloat(el('edc-orders').value) || 0;
  const edcAmt    = parseFloat(el('edc-amount').value) || 0;
  if (edcOrders || edcAmt) {
    hasData = true;
    entries.push({ billingUser: 'Mosambee EDC', orders: edcOrders, netSales: edcAmt, totalSales: edcAmt, card: edcAmt, cash:0, upi:0, other:0, waived:0, notPaid:0 });
  }

  if (!hasData) { toast('Enter at least one sale amount', 'error'); return; }

  // Save locally
  const log = getSalesLog().filter(s => s.date !== date);
  entries.forEach(e => log.push({ ...e, date, submittedBy: STATE.user.name, timestamp: Date.now() }));
  saveSalesLog(log);

  // Sync to Sheets
  apiCall('logSales', { date, entries, submittedBy: STATE.user.name });

  toast('Sales saved!', 'success');
  navigate('reconciliation');
}

function switchSalesTab(tab) {
  el('tab-entry').classList.toggle('active', tab === 'entry');
  el('tab-history').classList.toggle('active', tab === 'history');
  el('sales-entry-tab').classList.toggle('hidden', tab !== 'entry');
  el('sales-history-tab').classList.toggle('hidden', tab !== 'history');
}

function renderSalesHistory(log) {
  if (!log.length) return `<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No sales recorded yet</h3><p>Enter your first sales entry above</p></div>`;
  const grouped = {};
  log.forEach(e => { if (!grouped[e.date]) grouped[e.date] = []; grouped[e.date].push(e); });
  const dates = Object.keys(grouped).sort().reverse().slice(0, 14);
  return dates.map(date => {
    const entries = grouped[date];
    const total = entries.reduce((s,e)=>s+(parseFloat(e.totalSales)||0),0);
    const cash  = entries.reduce((s,e)=>s+(parseFloat(e.cash)||0),0);
    const card  = entries.reduce((s,e)=>s+(parseFloat(e.card)||0),0);
    const upi   = entries.reduce((s,e)=>s+(parseFloat(e.upi)||0),0);
    return `
      <div class="card" style="margin-bottom:10px">
        <div class="flex justify-between items-center mb-2">
          <strong>${formatDate(date)}</strong>
          <strong class="text-accent">${formatCurrency(total)}</strong>
        </div>
        <div class="flex gap-2 text-sm text-muted">
          <span>Cash: ${formatCurrency(cash)}</span>
          <span>Card: ${formatCurrency(card)}</span>
          <span>UPI: ${formatCurrency(upi)}</span>
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//   PAGE: CASH RECONCILIATION
// ════════════════════════════════════════════════════════════
function reconciliation(main) {
  const todaySales = getSalesLog().filter(s => s.date === STATE.today);
  const expectedCash = todaySales.reduce((s, e) => s + (parseFloat(e.cash) || 0), 0);
  const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

  main.innerHTML = `
    <div class="card">
      <div class="card-title">Expected Cash from POS</div>
      <div class="card-value text-accent">${formatCurrency(expectedCash)}</div>
      <div class="card-sub">Based on today's sales entry · ${formatDate(STATE.today)}</div>
      ${!todaySales.length ? `<div class="alert-banner alert-warning" style="margin-top:10px">⚠ Enter today's sales first for accurate reconciliation</div>` : ''}
    </div>

    <div class="card">
      <div class="card-title">Count Cash in Drawer</div>
      <div class="denom-grid" id="denom-grid">
        ${DENOMS.map(d => `
          <div class="denom-row">
            <span class="denom-label">₹${d}</span>
            <input type="number" class="denom-input" data-denom="${d}" placeholder="0" min="0" id="dn${d}" oninput="calcRecon()">
            <span class="denom-total" id="dt${d}">—</span>
          </div>`).join('')}
        <div class="denom-row" style="grid-column:1/-1">
          <span class="denom-label">Coins</span>
          <input type="number" class="denom-input" id="dn-coins" placeholder="0" min="0" oninput="calcRecon()" style="width:80px">
          <span class="denom-total" id="dt-coins">—</span>
        </div>
      </div>
    </div>

    <div class="recon-result" id="recon-summary">
      <div class="recon-row">
        <span class="text-muted">Total Counted</span>
        <strong id="recon-counted" class="text-accent">₹0</strong>
      </div>
      <div class="recon-row">
        <span class="text-muted">Expected (POS)</span>
        <strong id="recon-expected">${formatCurrency(expectedCash)}</strong>
      </div>
      <div class="recon-row total">
        <span>Difference</span>
        <strong id="recon-diff">—</strong>
      </div>
    </div>

    <div class="form-group mt-2">
      <label class="form-label">Notes (optional)</label>
      <textarea id="recon-notes" placeholder="e.g. Short ₹50 — possible Swiggy payout pending"></textarea>
    </div>

    <button class="btn btn-primary btn-lg" onclick="submitRecon(${expectedCash})">Save Reconciliation</button>
  `;
}

function calcRecon() {
  const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  let counted = 0;
  DENOMS.forEach(d => {
    const qty = parseFloat(el('dn'+d)?.value) || 0;
    const sub = qty * d;
    counted += sub;
    const dt = el('dt'+d);
    if (dt) dt.textContent = sub > 0 ? '₹'+sub.toLocaleString('en-IN') : '—';
  });
  const coins = parseFloat(el('dn-coins')?.value) || 0;
  counted += coins;
  const coinsEl = el('dt-coins');
  if (coinsEl) coinsEl.textContent = coins > 0 ? '₹'+coins.toLocaleString('en-IN') : '—';

  const expectedEl = el('recon-expected');
  const expected = expectedEl ? parseFloat(expectedEl.textContent.replace(/[₹,]/g,'')) || 0 : 0;
  const diff = counted - expected;

  el('recon-counted').textContent = formatCurrency(counted);
  const diffEl = el('recon-diff');
  if (diffEl) {
    if (counted === 0 && expected === 0) { diffEl.textContent = '—'; diffEl.className = ''; }
    else if (diff === 0) { diffEl.textContent = 'Matched ✓'; diffEl.className = 'text-green'; }
    else if (diff < 0) { diffEl.textContent = `Short ${formatCurrency(Math.abs(diff))} ⚠`; diffEl.className = 'text-red'; }
    else { diffEl.textContent = `Over ${formatCurrency(diff)}`; diffEl.className = 'text-yellow'; }
  }
}

async function submitRecon(expected) {
  const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  let counted = 0;
  const denomData = {};
  DENOMS.forEach(d => {
    const qty = parseFloat(el('dn'+d)?.value) || 0;
    denomData['note_'+d] = qty;
    counted += qty * d;
  });
  const coins = parseFloat(el('dn-coins')?.value) || 0;
  denomData['coins'] = coins;
  counted += coins;

  if (counted === 0) { toast('Count the cash first', 'error'); return; }

  const diff = counted - expected;
  const notes = el('recon-notes')?.value || '';
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });

  const entry = {
    date: STATE.today,
    time,
    counted,
    expected,
    difference: diff,
    notes,
    by: STATE.user.name,
    ...denomData,
    timestamp: Date.now(),
  };

  const log = getReconLog().filter(r => r.date !== STATE.today);
  log.push(entry);
  saveReconLog(log);

  apiCall('logReconciliation', entry);

  const msg = diff === 0 ? 'Cash matched perfectly! ✓' : diff < 0 ? `Short by ${formatCurrency(Math.abs(diff))} — saved` : `Over by ${formatCurrency(diff)} — saved`;
  toast(msg, diff === 0 ? 'success' : 'warning');
  navigate('dashboard');
}

// ════════════════════════════════════════════════════════════
//   PAGE: STAFF
// ════════════════════════════════════════════════════════════
function staff(main) {
  const attendance = getAttendanceLog();
  const todayLogs = attendance.filter(a => a.date === STATE.today);
  const staffList = getStaffList().filter(s => s.active);

  main.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" id="tab-today" onclick="switchStaffTab('today')">Today</button>
      <button class="tab-btn" id="tab-history-s" onclick="switchStaffTab('history')">History</button>
      ${isOwner() ? `<button class="tab-btn" id="tab-summary-s" onclick="switchStaffTab('summary')">Summary</button>` : ''}
    </div>

    <div id="staff-today-tab">
      <div class="section-header">
        <span class="section-title">${formatDate(STATE.today)}</span>
      </div>
      ${staffList.map(s => {
        const log = todayLogs.find(l => l.staffId === s.id);
        const isIn  = log && log.clockIn && !log.clockOut;
        const isOut = log && log.clockIn && log.clockOut;
        const statusText = isIn  ? `Clocked in: ${log.clockIn}`
                         : isOut ? `${log.clockIn} — ${log.clockOut} (${calcHours(log.clockIn, log.clockOut)} hrs)`
                         : 'Not clocked in';
        return `
          <div class="staff-card" id="staff-card-${s.id}">
            <div class="staff-avatar">${getInitials(s.name)}</div>
            <div class="staff-info">
              <div class="staff-name">${s.name}</div>
              <div class="staff-role">${statusText}</div>
            </div>
            <div class="staff-actions">
              ${!log ? `<button class="btn btn-sm btn-success" onclick="clockIn('${s.id}','${s.name}')">Clock In</button>` : ''}
              ${isIn  ? `<button class="btn btn-sm btn-secondary" onclick="clockOut('${s.id}','${s.name}')">Clock Out</button>` : ''}
              ${isOut ? `<span class="badge badge-gray">Done</span>` : ''}
              ${isOwner() && log ? `
                <button class="btn btn-sm btn-secondary" onclick="editAttendanceEntry('${s.id}','${STATE.today}')">Edit</button>
                <button class="btn btn-sm btn-danger"    onclick="deleteAttendanceEntry('${s.id}','${STATE.today}','${s.name}')">Delete</button>
              ` : ''}
            </div>
          </div>`;
      }).join('')}

      <div class="card mt-2">
        <div class="card-title">Add Note for Today</div>
        <textarea id="staff-note" placeholder="Any staff notes — late arrival, early leave, extra work, etc." style="margin-bottom:10px"></textarea>
        <button class="btn btn-secondary btn-sm" onclick="saveStaffNote()">Save Note</button>
      </div>
    </div>

    <div id="staff-history-tab" class="hidden">
      ${renderAttendanceHistory(attendance, staffList)}
    </div>

    ${isOwner() ? `
    <div id="staff-summary-tab" class="hidden">
      ${renderStaffSummary(attendance, staffList)}
    </div>` : ''}
  `;
}

function calcHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const [ih, im] = clockIn.split(':').map(Number);
  const [oh, om] = clockOut.split(':').map(Number);
  let mins = (oh*60+om) - (ih*60+im);
  if (mins < 0) mins += 24 * 60; // handle overnight shifts
  return parseFloat((mins / 60).toFixed(1));
}

function clockIn(staffId, staffName) {
  const log = getAttendanceLog();
  const existing = log.find(l => l.date === STATE.today && l.staffId === staffId);
  if (existing) { toast('Already clocked in today', 'warning'); return; }
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: false });
  log.push({ date: STATE.today, staffId, name: staffName, clockIn: time, clockOut: null, notes:'', timestamp: Date.now() });
  saveAttendanceLog(log);
  apiCall('clockIn', { date: STATE.today, staffId, staffName, time, submittedBy: STATE.user.name });
  toast(`${staffName} clocked in at ${time}`, 'success');
  navigate('staff');
}

function clockOut(staffId, staffName) {
  const log = getAttendanceLog();
  const entry = log.find(l => l.date === STATE.today && l.staffId === staffId && l.clockIn && !l.clockOut);
  if (!entry) { toast('No active clock-in found', 'error'); return; }
  const now = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12: false });
  entry.clockOut = time;
  entry.hours = calcHours(entry.clockIn, time);
  saveAttendanceLog(log);
  apiCall('clockOut', { date: STATE.today, staffId, staffName, time, hours: entry.hours, submittedBy: STATE.user.name });
  toast(`${staffName} clocked out — ${entry.hours} hrs`, 'success');
  navigate('staff');
}

function saveStaffNote() {
  const note = el('staff-note')?.value;
  if (!note) return;
  const log = getAttendanceLog();
  log.push({ date: STATE.today, staffId: 'note', name: 'Note', note, by: STATE.user.name, timestamp: Date.now() });
  saveAttendanceLog(log);
  toast('Note saved', 'success');
  el('staff-note').value = '';
}

// Owner-only: edit a clock-in/out entry for any staff on any date
function editAttendanceEntry(staffId, date) {
  if (!isOwner()) return;
  const log   = getAttendanceLog();
  const entry = log.find(a => a.staffId === staffId && a.date === date && a.clockIn);
  if (!entry) { toast('Entry not found', 'error'); return; }
  showModal(`Edit Attendance — ${entry.name}`, `
    <p class="text-sm text-muted mb-2">${formatDate(date)}</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Clock In</label>
        <input type="time" id="ea-in" value="${entry.clockIn || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">Clock Out</label>
        <input type="time" id="ea-out" value="${entry.clockOut || ''}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Hours (auto-calculated, or override)</label>
      <input type="number" id="ea-hours" value="${entry.hours || ''}" placeholder="e.g. 8.5" min="0" step="0.5">
    </div>
    <div class="form-group">
      <label class="form-label">Note</label>
      <input type="text" id="ea-note" value="${entry.notes || ''}" placeholder="e.g. Left early — approved">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"   onclick="saveAttendanceEdit('${staffId}','${date}')">Save Changes</button>
  `);
}

function saveAttendanceEdit(staffId, date) {
  const clockInVal  = el('ea-in')?.value;
  const clockOutVal = el('ea-out')?.value;
  const hoursVal    = el('ea-hours')?.value;
  const noteVal     = el('ea-note')?.value?.trim();

  if (!clockInVal) { toast('Clock-in time is required', 'error'); return; }

  const log   = getAttendanceLog();
  const entry = log.find(a => a.staffId === staffId && a.date === date && a.clockIn);
  if (!entry) return;

  entry.clockIn  = clockInVal;
  entry.clockOut = clockOutVal || null;
  entry.hours    = hoursVal
    ? parseFloat(hoursVal)
    : (clockOutVal ? calcHours(clockInVal, clockOutVal) : null);
  entry.notes    = noteVal;
  entry.editedBy = STATE.user.name;
  entry.editedAt = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });

  saveAttendanceLog(log);
  toast('Attendance updated', 'success');
  closeModal();
  navigate('staff');
}

// Owner-only: delete an attendance entry
function deleteAttendanceEntry(staffId, date, name) {
  if (!isOwner()) return;
  if (!confirm(`Delete attendance record for ${name} on ${formatDate(date)}?\n\nThis cannot be undone.`)) return;
  const log = getAttendanceLog().filter(a => !(a.staffId === staffId && a.date === date && a.clockIn));
  saveAttendanceLog(log);
  toast(`${name}'s record deleted`, 'info');
  navigate('staff');
}

function renderAttendanceHistory(attendance, staffList) {
  const grouped = {};
  attendance.filter(a => a.clockIn).forEach(a => { if (!grouped[a.date]) grouped[a.date]=[]; grouped[a.date].push(a); });
  const dates = Object.keys(grouped).sort().reverse().slice(0, 14);
  if (!dates.length) return `<div class="empty-state"><div class="empty-state-icon">📅</div><h3>No attendance recorded yet</h3></div>`;
  return dates.map(date => `
    <div class="card">
      <div class="card-title">${formatDate(date)}</div>
      ${grouped[date].map(a => `
        <div class="list-item" id="arow-${a.staffId}-${date}">
          <div class="staff-avatar" style="width:32px;height:32px;font-size:0.8rem">${getInitials(a.name)}</div>
          <div class="list-item-body">
            <div class="list-item-title">${a.name}</div>
            <div class="list-item-sub">${a.clockIn} — ${a.clockOut || 'Not out'} ${a.hours ? `· ${a.hours} hrs` : ''}</div>
          </div>
          ${isOwner() ? `
            <div style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn btn-sm btn-secondary" onclick="editAttendanceEntry('${a.staffId}','${date}')">Edit</button>
              <button class="btn btn-sm btn-danger"    onclick="deleteAttendanceEntry('${a.staffId}','${date}','${a.name}')">Delete</button>
            </div>
          ` : (a.hours ? `<span class="badge badge-accent">${a.hours} hrs</span>` : '')}
        </div>`).join('')}
    </div>`).join('');
}

function renderStaffSummary(attendance, staffList) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthStr = now.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
  const monthEntries = attendance.filter(a => {
    const d = new Date(a.date);
    return d.getMonth() === month && d.getFullYear() === year && a.clockIn && a.clockOut;
  });
  return `
    <div class="card">
      <div class="card-title">This Month — ${monthStr}</div>
      ${staffList.map(s => {
        const entries = monthEntries.filter(a => a.staffId === s.id);
        const totalHours = entries.reduce((t,a) => t + (parseFloat(a.hours)||0), 0);
        const days = entries.length;
        return `
          <div class="list-item">
            <div class="staff-avatar">${getInitials(s.name)}</div>
            <div class="list-item-body">
              <div class="list-item-title">${s.name}</div>
              <div class="list-item-sub">${days} days · ${totalHours.toFixed(1)} hrs</div>
            </div>
            <span class="badge badge-accent">${totalHours.toFixed(1)} hrs</span>
          </div>`;
      }).join('')}
    </div>`;
}

function switchStaffTab(tab) {
  // Button IDs: tab-today, tab-history-s, tab-summary-s
  // Pane IDs:   staff-today-tab, staff-history-tab, staff-summary-tab
  const btnIds  = { today:'tab-today', history:'tab-history-s', summary:'tab-summary-s' };
  const paneIds = { today:'staff-today-tab', history:'staff-history-tab', summary:'staff-summary-tab' };
  ['today','history','summary'].forEach(t => {
    const btn  = el(btnIds[t]);
    const pane = el(paneIds[t]);
    if (btn)  btn.classList.toggle('active', t === tab);
    if (pane) pane.classList.toggle('hidden', t !== tab);
  });
}

// ════════════════════════════════════════════════════════════
//   PAGE: EXPENSES
// ════════════════════════════════════════════════════════════
const EXPENSE_CATEGORIES = [
  { name:'Raw Materials', icon:'🥛', color:'var(--accent)' },
  { name:'Syrups & Ingredients', icon:'🧃', color:'var(--purple)' },
  { name:'Supplies (Cups/Straws)', icon:'🥤', color:'var(--yellow)' },
  { name:'Packaging', icon:'📦', color:'var(--accent)' },
  { name:'Cleaning', icon:'🧹', color:'var(--green)' },
  { name:'Electricity', icon:'⚡', color:'var(--yellow)' },
  { name:'Utilities', icon:'🔌', color:'var(--yellow)' },
  { name:'Repairs & Maintenance', icon:'🔧', color:'var(--red)' },
  { name:'Transport', icon:'🚗', color:'var(--text2)' },
  { name:'Staff Food', icon:'🍱', color:'var(--green)' },
  { name:'Marketing', icon:'📣', color:'var(--purple)' },
  { name:'Marketing Team', icon:'🎯', color:'var(--purple)' },
  { name:'Rent', icon:'🏠', color:'var(--red)' },
  { name:'Salaries', icon:'💼', color:'var(--text2)' },
  { name:'Miscellaneous', icon:'📎', color:'var(--text3)' },
];

function expenses(main) {
  const log = getExpenses();
  const todayExp = log.filter(e => e.date === STATE.today).sort((a,b) => b.timestamp-a.timestamp);
  const todayTotal = todayExp.reduce((s,e) => s+(parseFloat(e.amount)||0), 0);
  const staffList = getStaffList().filter(s => s.active);
  const catOpts = EXPENSE_CATEGORIES.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  const staffOpts = staffList.map(s => `<option value="${s.name}">${s.name}</option>`).join('');

  main.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" id="etab-today" onclick="switchExpTab('today')">Add Expense</button>
      <button class="tab-btn" id="etab-history" onclick="switchExpTab('history')">History</button>
      ${isOwner() ? `<button class="tab-btn" id="etab-summary" onclick="switchExpTab('summary')">Summary</button>` : ''}
    </div>

    <div id="exp-today-tab">
      <div class="card">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="exp-date" value="${STATE.today}" max="${STATE.today}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="exp-cat">${catOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (₹)</label>
            <div class="input-prefix"><span>₹</span><input type="number" id="exp-amount" placeholder="0" min="0"></div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" id="exp-desc" placeholder="e.g. 20L milk from Morning Dairy">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Paid By</label>
            <select id="exp-paidby">${staffOpts}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Bill No. / Ref (optional)</label>
            <input type="text" id="exp-ref" placeholder="Bill #">
          </div>
        </div>
        <button class="btn btn-primary btn-lg" onclick="addExpense()">+ Log Expense</button>
      </div>

      <div class="section-header mt-2">
        <span class="section-title">Today's Expenses</span>
        <strong class="text-red">${formatCurrency(todayTotal)}</strong>
      </div>
      <div class="card">
        ${todayExp.length
          ? todayExp.map(e => renderExpenseItem(e)).join('')
          : `<p class="text-muted text-sm">No expenses logged today</p>`}
      </div>
    </div>

    <div id="exp-history-tab" class="hidden">
      ${renderExpenseHistory(log)}
    </div>

    ${isOwner() ? `
    <div id="exp-summary-tab" class="hidden">
      ${renderExpenseSummary(log)}
    </div>` : ''}
  `;
}

function renderExpenseItem(e) {
  const cat = EXPENSE_CATEGORIES.find(c => c.name === e.category) || { icon:'📎', color:'var(--text3)' };
  return `
    <div class="expense-item">
      <div class="expense-cat-icon" style="background:${cat.color}22;color:${cat.color}">${cat.icon}</div>
      <div class="expense-body">
        <div class="expense-desc">${e.description || e.category}</div>
        <div class="expense-meta">${e.category} · Paid by ${e.paidBy}</div>
      </div>
      <div class="expense-amount">${formatCurrency(e.amount)}</div>
    </div>`;
}

async function addExpense() {
  const date   = el('exp-date')?.value;
  const cat    = el('exp-cat')?.value;
  const amount = parseFloat(el('exp-amount')?.value);
  const desc   = el('exp-desc')?.value?.trim();
  const paidBy = el('exp-paidby')?.value;
  const ref    = el('exp-ref')?.value;

  if (!date || !cat || !amount || !desc) { toast('Fill in date, category, amount and description', 'error'); return; }

  const entry = { id: Date.now().toString(), date, category: cat, amount, description: desc, paidBy, ref, submittedBy: STATE.user.name, timestamp: Date.now() };
  const log = getExpenses();
  log.push(entry);
  saveExpenses(log);
  apiCall('logExpense', entry);

  toast('Expense logged!', 'success');
  navigate('expenses');
}

function renderExpenseHistory(log) {
  if (!log.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><h3>No expenses logged yet</h3></div>`;
  const grouped = {};
  log.forEach(e => { if (!grouped[e.date]) grouped[e.date]=[]; grouped[e.date].push(e); });
  const dates = Object.keys(grouped).sort().reverse().slice(0, 14);
  return dates.map(date => {
    const entries = grouped[date].sort((a,b)=>b.timestamp-a.timestamp);
    const total = entries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
    return `
      <div class="card">
        <div class="flex justify-between items-center mb-2">
          <strong>${formatDate(date)}</strong>
          <strong class="text-red">${formatCurrency(total)}</strong>
        </div>
        ${entries.map(e => renderExpenseItem(e)).join('')}
      </div>`;
  }).join('');
}

function renderExpenseSummary(log) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const monthEntries = log.filter(e => { const d = new Date(e.date); return d.getMonth()===month && d.getFullYear()===year; });
  const monthTotal = monthEntries.reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const byCat = {};
  monthEntries.forEach(e => { byCat[e.category] = (byCat[e.category]||0) + (parseFloat(e.amount)||0); });
  const cats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  return `
    <div class="card">
      <div class="card-title">This Month</div>
      <div class="card-value text-red">${formatCurrency(monthTotal)}</div>
    </div>
    <div class="card">
      <div class="card-title">By Category</div>
      ${cats.map(([cat, amt]) => {
        const c = EXPENSE_CATEGORIES.find(x=>x.name===cat)||{icon:'📎'};
        return `
          <div class="list-item">
            <span style="font-size:1.1rem">${c.icon}</span>
            <div class="list-item-body"><div class="list-item-title">${cat}</div></div>
            <strong class="text-red">${formatCurrency(amt)}</strong>
          </div>`;
      }).join('')}
    </div>`;
}

function switchExpTab(tab) {
  ['today','history','summary'].forEach(t => {
    const btn = el('etab-'+t);
    if (btn) btn.classList.toggle('active', t===tab);
    const pane = el('exp-'+t+'-tab');
    if (pane) pane.classList.toggle('hidden', t!==tab);
  });
}

// ════════════════════════════════════════════════════════════
//   PAGE: INVENTORY
// ════════════════════════════════════════════════════════════
// Track current inventory filter for search to respect
let _invFilter = 'All';

function inventory(main) {
  const inv = getInventory();
  const sections = ['All', 'Kitchen', 'Bar', 'Packaging'];
  const lowStock = inv.filter(i => i.stock > 0 && i.reorder > 0 && i.stock <= i.reorder);
  _invFilter = 'All';

  main.innerHTML = `
    <div class="tabs" id="inv-tabs" style="overflow-x:auto;flex-wrap:nowrap">
      ${sections.map((s,i) => `<button class="tab-btn ${i===0?'active':''}" onclick="filterInventory('${s}', this)">${s}</button>`).join('')}
    </div>

    <div class="inv-search-wrap">
      <input type="search" id="inv-search-input" placeholder="🔍  Search items, suppliers…" oninput="searchInventory(this.value)" autocomplete="off">
    </div>

    ${lowStock.length ? `
    <div class="alert-banner alert-danger">
      🚨 Low stock: ${lowStock.map(i=>i.name).join(', ')}
    </div>` : ''}

    <div class="section-header">
      <span class="section-title" id="inv-section-label">All Items (${inv.length})</span>
      ${isOwner() ? `<button class="btn btn-sm btn-secondary" onclick="addInventoryItem()">+ Add Item</button>` : ''}
    </div>
    <div id="inv-list">
      ${renderInventoryList(inv, 'All')}
    </div>
  `;
}

function searchInventory(query) {
  const inv = getInventory();
  const q = query.trim().toLowerCase();
  if (!q) {
    // Restore section filter
    el('inv-list').innerHTML = renderInventoryList(inv, _invFilter);
    const label = el('inv-section-label');
    const filtered = _invFilter === 'All' ? inv : inv.filter(i => (i.section||i.category) === _invFilter);
    if (label) label.textContent = `${_invFilter} (${filtered.length})`;
    return;
  }
  const results = inv.filter(i =>
    i.name.toLowerCase().includes(q) ||
    (i.supplier||'').toLowerCase().includes(q) ||
    (i.category||'').toLowerCase().includes(q) ||
    (i.contact||'').toLowerCase().includes(q)
  );
  const label = el('inv-section-label');
  if (label) label.textContent = `Results (${results.length})`;
  // Show as flat list (no section grouping) when searching
  el('inv-list').innerHTML = results.length
    ? renderInventoryList(results, 'All')
    : `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>No results for "${query}"</h3><p>Try supplier name, category or item name</p></div>`;
}

function renderInventoryList(inv, filter) {
  const filtered = filter === 'All' ? inv : inv.filter(i => (i.section || i.category) === filter);
  if (!filtered.length) return `<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No items</h3></div>`;
  // Group by category within section
  const grouped = {};
  filtered.forEach(i => { if (!grouped[i.category]) grouped[i.category]=[]; grouped[i.category].push(i); });
  return Object.entries(grouped).map(([cat, items]) => `
    <div style="margin-bottom:4px">
      <div style="font-size:0.7rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;padding:8px 2px 4px">${cat}</div>
      ${items.map(i => {
        const hasReorder = i.reorder > 0;
        const status = hasReorder ? (i.stock <= i.reorder ? 'low' : i.stock <= i.reorder * 1.5 ? 'medium' : 'ok') : 'ok';
        const badgeClass = status === 'low' ? 'badge-red' : status === 'medium' ? 'badge-yellow' : 'badge-green';
        const safeName = (i.name||'').replace(/'/g,"\\'");
        return `
        <div class="inventory-item ${status}" id="irow-${i.id}">
          <div style="flex:1;min-width:0">
            <div class="inv-name">${i.name}</div>
            <div class="inv-stock">
              ${i.totalCost ? `₹${i.totalCost} / ${i.unit}` : i.unit}
            </div>
          </div>
          <div class="inv-right" style="margin:0 8px">
            <div class="inv-qty">${i.stock || 0}</div>
            <div class="inv-unit">${i.unit}</div>
            ${hasReorder ? `<span class="badge ${badgeClass}" style="margin-top:4px">${status}</span>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
            <button class="btn btn-sm btn-secondary" onclick="showUpdateStock('${i.id}','${safeName}','${i.unit}',${i.stock||0})">Stock</button>
            <button class="btn btn-sm btn-secondary" onclick="editInventoryItem('${i.id}')">Edit</button>
          </div>
        </div>`}).join('')}
    </div>`).join('');
}

function filterInventory(filter, btn) {
  document.querySelectorAll('#inv-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _invFilter = filter;
  // Clear search when switching tabs
  const searchInput = el('inv-search-input');
  if (searchInput) searchInput.value = '';
  const inv = getInventory();
  const filtered = filter === 'All' ? inv : inv.filter(i => (i.section || i.category) === filter);
  const label = el('inv-section-label');
  if (label) label.textContent = `${filter} (${filtered.length})`;
  el('inv-list').innerHTML = renderInventoryList(inv, filter);
}

function showUpdateStock(id, name, unit, currentStock) {
  showModal(`Update Stock — ${name}`, `
    <div class="form-group">
      <label class="form-label">Current Stock</label>
      <input type="number" id="inv-old" value="${currentStock}" readonly style="background:var(--bg3);opacity:0.6">
    </div>
    <div class="form-group">
      <label class="form-label">New Stock (${unit})</label>
      <input type="number" id="inv-new" value="${currentStock}" min="0">
    </div>
    <div class="form-group">
      <label class="form-label">Note (optional)</label>
      <input type="text" id="inv-note" placeholder="e.g. Received delivery">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="updateStock('${id}','${unit}')">Save</button>
  `);
}

function updateStock(id, unit) {
  const newStock = parseFloat(el('inv-new')?.value);
  const note = el('inv-note')?.value;
  if (isNaN(newStock) || newStock < 0) { toast('Enter a valid stock level', 'error'); return; }
  const inv = getInventory();
  const item = inv.find(i => i.id === id);
  if (!item) return;
  const oldStock = item.stock;
  item.stock = newStock;
  saveInventory(inv);
  apiCall('updateInventory', { id, name: item.name, oldStock, newStock, unit, note, by: STATE.user.name, date: STATE.today });
  toast(`${item.name} updated to ${newStock} ${unit}`, 'success');
  closeModal();
  navigate('inventory');
}

function addInventoryItem() {
  const catOpts = INV_CATEGORIES.map(c => `<option>${c}</option>`).join('');
  const secOpts = INV_SECTIONS.map(s => `<option>${s}</option>`).join('');
  showModal('Add Inventory Item', `
    <div class="form-group">
      <label class="form-label">Item Name</label>
      <input type="text" id="new-inv-name" placeholder="e.g. Green Apple Syrup">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Section</label>
        <select id="new-inv-section">${secOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="new-inv-cat">${catOpts}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Unit of Measure</label>
        <input type="text" id="new-inv-unit" placeholder="kg, L, btl, pkt…">
      </div>
      <div class="form-group">
        <label class="form-label">SKU / Code (optional)</label>
        <input type="text" id="new-inv-sku" placeholder="">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Unit Cost (₹)</label>
        <input type="number" id="new-inv-price" placeholder="0" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Tax (₹)</label>
        <input type="number" id="new-inv-tax" placeholder="0" min="0" step="0.01">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Supplier / Vendor</label>
      <input type="text" id="new-inv-supplier" placeholder="e.g. Hyperpure">
    </div>
    <div class="form-group">
      <label class="form-label">Vendor Contact</label>
      <input type="text" id="new-inv-contact" placeholder="Name - 9876543210">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Current Stock</label>
        <input type="number" id="new-inv-stock" placeholder="0" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Reorder Level</label>
        <input type="number" id="new-inv-reorder" placeholder="0" min="0">
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"   onclick="saveNewInventoryItem()">Add Item</button>
  `);
}

function saveNewInventoryItem() {
  const name     = el('new-inv-name')?.value?.trim();
  const section  = el('new-inv-section')?.value;
  const cat      = el('new-inv-cat')?.value;
  const unit     = el('new-inv-unit')?.value?.trim();
  const sku      = el('new-inv-sku')?.value?.trim();
  const price    = parseFloat(el('new-inv-price')?.value) || 0;
  const tax      = parseFloat(el('new-inv-tax')?.value) || 0;
  const supplier = el('new-inv-supplier')?.value?.trim();
  const contact  = el('new-inv-contact')?.value?.trim();
  const stock    = parseFloat(el('new-inv-stock')?.value) || 0;
  const reorder  = parseFloat(el('new-inv-reorder')?.value) || 0;
  if (!name || !unit) { toast('Name and unit are required', 'error'); return; }
  const inv = getInventory();
  inv.push({ id: 'i' + Date.now().toString(36), name, section, category: cat, unit, sku, price, tax, totalCost: price+tax, supplier, contact, stock, reorder });
  saveInventory(inv);
  toast(`${name} added`, 'success');
  closeModal();
  if (STATE.page === 'manage') navigate('manage');
  else navigate('inventory');
}

// ════════════════════════════════════════════════════════════
//   PAGE: SOPs
// ════════════════════════════════════════════════════════════
const SOP_CATEGORIES = [
  { id:'opening',  label:'Opening',    icon:'🌅' },
  { id:'closing',  label:'Closing',    icon:'🌙' },
  { id:'cleaning', label:'Cleaning',   icon:'🧹' },
  { id:'recipes',  label:'Recipes',    icon:'🧋' },
  { id:'handling', label:'Handling',   icon:'📋' },
];

function sops(main) {
  main.innerHTML = `
    <div class="sop-category-grid" id="sop-categories">
      ${SOP_CATEGORIES.map(c => `
        <button class="sop-category-btn" onclick="showSOPCategory('${c.id}', this)">
          <span class="cat-icon">${c.icon}</span>
          <span class="cat-name">${c.label}</span>
        </button>`).join('')}
    </div>
    <div id="sop-content">
      <div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <h3>Select a category</h3>
        <p>Tap a category above to view SOPs</p>
      </div>
    </div>
    ${isOwner() ? `
    <div class="flex" style="margin-top:16px;gap:10px">
      <button class="btn btn-secondary btn-sm" onclick="addSOP()">+ Add SOP</button>
    </div>` : ''}
  `;
}

function showSOPCategory(catId, btn) {
  document.querySelectorAll('.sop-category-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const allSOPs = getSOPs().filter(s => s.category === catId);
  const content = el('sop-content');
  if (!allSOPs.length) {
    content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><h3>No SOPs in this category</h3>${isOwner()?`<button class="btn btn-primary btn-sm mt-2" onclick="addSOP('${catId}')">+ Add SOP</button>`:''}</div>`;
    return;
  }
  content.innerHTML = allSOPs.map(s => `
    <div class="sop-item" onclick="viewSOP('${s.id}')">
      <div class="flex justify-between items-center">
        <div class="sop-item-title">${s.title}</div>
        <span class="badge ${s.type==='checklist'?'badge-accent':'badge-gray'}">${s.type==='checklist'?'Checklist':'Steps'}</span>
      </div>
      <div class="sop-item-meta">${s.steps.length} ${s.type==='checklist'?'items':'steps'}</div>
    </div>`).join('');
}

function viewSOP(id) {
  const sop = getSOPs().find(s => s.id === id);
  if (!sop) return;
  const bodyHtml = sop.type === 'checklist'
    ? `<div id="sop-checklist">${sop.steps.map((step, i) => `
        <div class="checklist-item" id="ci${i}">
          <input type="checkbox" id="chk${i}" onchange="toggleCheck(${i})">
          <label for="chk${i}">${step}</label>
        </div>`).join('')}</div>
        <p class="text-xs text-dim mt-2">Tap items to check them off. Unchecked when you close.</p>`
    : `<div>${sop.steps.map((step, i) => `
        <div class="sop-step">
          <span class="sop-step-num">${i+1}</span>
          <span>${step}</span>
        </div>`).join('')}</div>`;

  showModal(sop.title, bodyHtml,
    isOwner()
      ? `<button class="btn btn-secondary" onclick="editSOP('${id}')">Edit</button><button class="btn btn-danger" onclick="deleteSOP('${id}')">Delete</button><button class="btn btn-primary" onclick="closeModal()">Done</button>`
      : `<button class="btn btn-primary" onclick="closeModal()">Done</button>`
  );
}

function toggleCheck(i) {
  const item = document.getElementById('ci'+i);
  if (item) item.classList.toggle('done');
}

function addSOP(defaultCat = '') {
  const catOpts = SOP_CATEGORIES.map(c => `<option value="${c.id}" ${c.id===defaultCat?'selected':''}>${c.label}</option>`).join('');
  showModal('Add New SOP', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input type="text" id="sop-title" placeholder="e.g. Evening Cleaning Protocol">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="sop-cat">${catOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="sop-type">
          <option value="steps">Steps</option>
          <option value="checklist">Checklist</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Steps (one per line)</label>
      <textarea id="sop-steps" placeholder="Step 1 description&#10;Step 2 description&#10;Step 3 description" style="min-height:180px"></textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveSOP()">Save SOP</button>
  `);
}

function saveSOP() {
  const title = el('sop-title')?.value?.trim();
  const cat   = el('sop-cat')?.value;
  const type  = el('sop-type')?.value;
  const steps = el('sop-steps')?.value?.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!title || !steps?.length) { toast('Title and at least one step required', 'error'); return; }
  const all = getSOPs();
  all.push({ id: 'sop'+Date.now().toString(36), category: cat, title, type, steps });
  saveSOPs(all);
  apiCall('saveSOP', { category: cat, title, type, steps, by: STATE.user.name });
  toast('SOP saved!', 'success');
  closeModal();
  navigate('sops');
}

function editSOP(id) {
  const sop = getSOPs().find(s => s.id === id);
  if (!sop) return;
  closeModal();
  const catOpts = SOP_CATEGORIES.map(c => `<option value="${c.id}" ${c.id===sop.category?'selected':''}>${c.label}</option>`).join('');
  showModal('Edit SOP', `
    <div class="form-group">
      <label class="form-label">Title</label>
      <input type="text" id="sop-title" value="${sop.title}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="sop-cat">${catOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Type</label>
        <select id="sop-type">
          <option value="steps" ${sop.type==='steps'?'selected':''}>Steps</option>
          <option value="checklist" ${sop.type==='checklist'?'selected':''}>Checklist</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Steps (one per line)</label>
      <textarea id="sop-steps" style="min-height:180px">${sop.steps.join('\n')}</textarea>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="updateSOP('${id}')">Save Changes</button>
  `);
}

function updateSOP(id) {
  const title = el('sop-title')?.value?.trim();
  const cat   = el('sop-cat')?.value;
  const type  = el('sop-type')?.value;
  const steps = el('sop-steps')?.value?.split('\n').map(s=>s.trim()).filter(Boolean);
  if (!title || !steps?.length) { toast('Title and steps required', 'error'); return; }
  const all = getSOPs();
  const idx = all.findIndex(s => s.id === id);
  if (idx !== -1) all[idx] = { ...all[idx], title, category: cat, type, steps };
  saveSOPs(all);
  toast('SOP updated!', 'success');
  closeModal();
  navigate('sops');
}

function deleteSOP(id) {
  if (!confirm('Delete this SOP? This cannot be undone.')) return;
  const all = getSOPs().filter(s => s.id !== id);
  saveSOPs(all);
  toast('SOP deleted', 'info');
  closeModal();
  navigate('sops');
}

// ════════════════════════════════════════════════════════════
//   PAGE: TASK TRACKER
// ════════════════════════════════════════════════════════════
const SHIFTS = [
  { id:'opening', label:'Opening',    icon:'🌅' },
  { id:'shift',   label:'During Shift', icon:'☀️' },
  { id:'closing', label:'Closing',    icon:'🌙' },
];

function tasks(main) {
  const todayTasks = getTodayTasks();
  const templates  = getTaskTemplates();
  const done  = todayTasks.filter(t => t.done).length;
  const total = todayTasks.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  main.innerHTML = `
    <div class="card" style="padding:14px 16px">
      <div class="flex justify-between items-center mb-1">
        <span class="card-title" style="margin:0">Today's Progress</span>
        <span class="font-bold text-accent">${done} / ${total}</span>
      </div>
      <div class="task-progress-bar"><div class="task-progress-fill" style="width:${pct}%"></div></div>
      <div class="text-xs text-dim mt-1">${pct}% complete · ${formatDate(STATE.today)}</div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" id="ttab-opening" onclick="switchTaskTab('opening')">🌅 Opening</button>
      <button class="tab-btn" id="ttab-shift"   onclick="switchTaskTab('shift')">☀️ Shift</button>
      <button class="tab-btn" id="ttab-closing" onclick="switchTaskTab('closing')">🌙 Closing</button>
    </div>

    <div id="task-opening-tab">${renderTaskList(todayTasks, 'opening')}</div>
    <div id="task-shift-tab"  class="hidden">${renderTaskList(todayTasks, 'shift')}</div>
    <div id="task-closing-tab" class="hidden">${renderTaskList(todayTasks, 'closing')}</div>

    ${isOwner() ? `
    <div class="section-header" style="margin-top:16px">
      <span class="section-title">Manage Tasks</span>
      <button class="btn btn-sm btn-primary" onclick="addTaskTemplate()">+ Add Task</button>
    </div>
    <div id="task-template-list">${renderTaskTemplates(templates)}</div>
    ` : ''}
  `;
}

function renderTaskList(todayTasks, shift) {
  const shiftTasks = todayTasks.filter(t => t.shift === shift);
  if (!shiftTasks.length) return `<div class="empty-state" style="padding:24px"><div class="empty-state-icon">✓</div><h3>No tasks for this shift</h3>${isOwner()?`<button class="btn btn-primary btn-sm mt-2" onclick="addTaskTemplate('${shift}')">+ Add Task</button>`:''}</div>`;
  const done = shiftTasks.filter(t => t.done).length;
  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:10px 14px;background:var(--bg3);font-size:0.75rem;color:var(--text3);display:flex;justify-content:space-between">
        <span>${SHIFTS.find(s=>s.id===shift)?.label} Checklist</span>
        <span>${done}/${shiftTasks.length} done</span>
      </div>
      ${shiftTasks.map(t => `
        <div class="task-row ${t.done ? 'task-done' : ''}" id="trow-${t.templateId}">
          <button class="task-check-btn ${t.done ? 'checked' : ''}" onclick="toggleTask('${t.templateId}','${shift}')">
            ${t.done ? '✓' : ''}
          </button>
          <div class="task-body">
            <div class="task-title">${t.title}</div>
            ${t.done ? `<div class="task-meta">✓ ${t.doneBy} · ${t.doneAt}</div>` : ''}
          </div>
          ${isOwner() && t.done ? `<button class="btn btn-sm" style="color:var(--text3);font-size:0.7rem" onclick="undoTask('${t.templateId}')">Undo</button>` : ''}
        </div>`).join('')}
    </div>`;
}

function toggleTask(templateId, shift) {
  const log = getDailyTaskLog();
  const entry = log.find(t => t.date === STATE.today && t.templateId === templateId);
  if (!entry || entry.done) return;
  const now = new Date();
  entry.done   = true;
  entry.doneBy = STATE.user.name;
  entry.doneAt = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  saveDailyTaskLog(log);
  apiCall('logTask', { date: STATE.today, templateId, title: entry.title, shift, doneBy: entry.doneBy, doneAt: entry.doneAt });
  // Update just the row without full re-render
  const row = el('trow-' + templateId);
  if (row) {
    row.classList.add('task-done');
    const btn = row.querySelector('.task-check-btn');
    if (btn) { btn.classList.add('checked'); btn.textContent = '✓'; }
    const body = row.querySelector('.task-body');
    if (body) body.innerHTML = `<div class="task-title">${entry.title}</div><div class="task-meta">✓ ${entry.doneBy} · ${entry.doneAt}</div>`;
    if (isOwner()) {
      const undo = document.createElement('button');
      undo.className = 'btn btn-sm'; undo.style.cssText = 'color:var(--text3);font-size:0.7rem';
      undo.textContent = 'Undo'; undo.onclick = () => undoTask(templateId);
      row.appendChild(undo);
    }
  }
  updateTaskProgress();
  toast(`"${entry.title}" checked off!`, 'success');
}

function undoTask(templateId) {
  const log = getDailyTaskLog();
  const entry = log.find(t => t.date === STATE.today && t.templateId === templateId);
  if (!entry) return;
  entry.done = false; entry.doneBy = ''; entry.doneAt = '';
  saveDailyTaskLog(log);
  navigate('tasks');
}

function updateTaskProgress() {
  const todayTasks = getTodayTasks();
  const done = todayTasks.filter(t => t.done).length;
  const total = todayTasks.length;
  const pct = total ? Math.round((done/total)*100) : 0;
  const fill = document.querySelector('.task-progress-fill');
  if (fill) fill.style.width = pct + '%';
  const countEl = document.querySelector('.card .font-bold.text-accent');
  if (countEl) countEl.textContent = `${done} / ${total}`;
  const pctEl = document.querySelector('.task-progress-bar + .text-xs');
  if (pctEl) pctEl.textContent = `${pct}% complete · ${formatDate(STATE.today)}`;
}

function switchTaskTab(shift) {
  SHIFTS.forEach(s => {
    const btn  = el('ttab-' + s.id);
    const pane = el('task-' + s.id + '-tab');
    if (btn)  btn.classList.toggle('active', s.id === shift);
    if (pane) pane.classList.toggle('hidden', s.id !== shift);
  });
}

function renderTaskTemplates(templates) {
  if (!templates.length) return `<div class="empty-state"><h3>No tasks yet</h3></div>`;
  const grouped = { opening:[], shift:[], closing:[] };
  templates.forEach(t => { if (grouped[t.shift]) grouped[t.shift].push(t); });
  return SHIFTS.map(s => `
    <div style="margin-bottom:12px">
      <div style="font-size:0.72rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">${s.icon} ${s.label}</div>
      ${grouped[s.id].map(t => `
        <div class="manage-item-row" style="padding:10px 12px">
          <div class="manage-item-info">
            <div class="manage-item-name" style="${t.active===false?'opacity:0.4;text-decoration:line-through':''}">${t.title}</div>
          </div>
          <div class="manage-item-actions">
            <button class="btn btn-sm btn-secondary" onclick="editTaskTemplate('${t.id}')">Edit</button>
            <button class="btn btn-sm btn-danger"    onclick="deleteTaskTemplate('${t.id}')">✕</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
}

function addTaskTemplate(defaultShift = 'opening') {
  const shiftOpts = SHIFTS.map(s => `<option value="${s.id}" ${s.id===defaultShift?'selected':''}>${s.label}</option>`).join('');
  showModal('Add Task', `
    <div class="form-group">
      <label class="form-label">Task Description</label>
      <input type="text" id="nt-title" placeholder="e.g. Check expiry dates on dairy">
    </div>
    <div class="form-group">
      <label class="form-label">Shift</label>
      <select id="nt-shift">${shiftOpts}</select>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"   onclick="saveTaskTemplate()">Add</button>
  `);
}

function saveTaskTemplate() {
  const title = el('nt-title')?.value?.trim();
  const shift = el('nt-shift')?.value;
  if (!title) { toast('Enter a task description', 'error'); return; }
  const templates = getTaskTemplates();
  templates.push({ id: 't' + Date.now().toString(36), title, shift, active: true });
  saveTaskTemplates(templates);
  toast('Task added!', 'success');
  closeModal();
  navigate('tasks');
}

function editTaskTemplate(id) {
  const templates = getTaskTemplates();
  const t = templates.find(x => x.id === id);
  if (!t) return;
  const shiftOpts = SHIFTS.map(s => `<option value="${s.id}" ${s.id===t.shift?'selected':''}>${s.label}</option>`).join('');
  showModal('Edit Task', `
    <div class="form-group">
      <label class="form-label">Task Description</label>
      <input type="text" id="et-title" value="${t.title.replace(/"/g,'&quot;')}">
    </div>
    <div class="form-group">
      <label class="form-label">Shift</label>
      <select id="et-shift">${shiftOpts}</select>
    </div>
  `, `
    <button class="btn btn-danger btn-sm"  onclick="deleteTaskTemplate('${id}')">Delete</button>
    <button class="btn btn-secondary"      onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"        onclick="updateTaskTemplate('${id}')">Save</button>
  `);
}

function updateTaskTemplate(id) {
  const title = el('et-title')?.value?.trim();
  const shift = el('et-shift')?.value;
  if (!title) { toast('Enter a task description', 'error'); return; }
  const templates = getTaskTemplates();
  const t = templates.find(x => x.id === id);
  if (t) { t.title = title; t.shift = shift; }
  saveTaskTemplates(templates);
  toast('Task updated', 'success');
  closeModal();
  navigate('tasks');
}

function deleteTaskTemplate(id) {
  if (!confirm('Delete this task from all future shifts?')) return;
  saveTaskTemplates(getTaskTemplates().filter(t => t.id !== id));
  toast('Task deleted', 'info');
  closeModal();
  navigate('tasks');
}

// ════════════════════════════════════════════════════════════
//   PAGE: VENDORS
// ════════════════════════════════════════════════════════════
function vendors(main) {
  const list = getVendors();

  main.innerHTML = `
    <div class="inv-search-wrap">
      <input type="search" id="vendor-search" placeholder="🔍  Search vendors, contacts…" oninput="searchVendors(this.value)" autocomplete="off">
    </div>

    <div class="section-header">
      <span class="section-title">All Vendors (${list.length})</span>
      <button class="btn btn-sm btn-primary" onclick="addVendor()">+ Add Vendor</button>
    </div>
    <div id="vendor-list">${renderVendorList(list)}</div>
  `;
}

function renderVendorList(list) {
  if (!list.length) return `<div class="empty-state"><div class="empty-state-icon">🏪</div><h3>No vendors yet</h3><p>Tap "+ Add Vendor" to add your first</p></div>`;
  return list.map(v => `
    <div class="vendor-card" id="vc-${v.id}">
      <div class="vendor-avatar">${getInitials(v.name)}</div>
      <div class="vendor-info">
        <div class="vendor-name">${v.name}</div>
        ${v.contact ? `<div class="vendor-meta">📋 ${v.contact}</div>` : ''}
        ${v.phone   ? `<div class="vendor-meta"><a href="tel:${v.phone.replace(/[^0-9+]/g,'')}" class="vendor-call">📞 ${v.phone}</a></div>` : ''}
        ${v.categories ? `<div class="vendor-cats">${v.categories}</div>` : ''}
        ${v.notes ? `<div class="vendor-notes">${v.notes}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn btn-sm btn-secondary" onclick="editVendor('${v.id}')">Edit</button>
        <button class="btn btn-sm btn-danger"    onclick="deleteVendor('${v.id}','${v.name.replace(/'/g,"\\'")}')">Delete</button>
      </div>
    </div>`).join('');
}

function searchVendors(query) {
  const q = query.trim().toLowerCase();
  const list = q
    ? getVendors().filter(v =>
        v.name.toLowerCase().includes(q) ||
        (v.contact||'').toLowerCase().includes(q) ||
        (v.phone||'').includes(q) ||
        (v.categories||'').toLowerCase().includes(q))
    : getVendors();
  el('vendor-list').innerHTML = renderVendorList(list);
}

function addVendor() {
  showModal('Add Vendor', vendorForm(), `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"   onclick="saveNewVendor()">Add Vendor</button>
  `);
}

function vendorForm(v = {}) {
  return `
    <div class="form-group">
      <label class="form-label">Vendor / Company Name</label>
      <input type="text" id="vf-name" value="${(v.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. Hyperpure">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Contact Person</label>
        <input type="text" id="vf-contact" value="${(v.contact||'').replace(/"/g,'&quot;')}" placeholder="e.g. Raj">
      </div>
      <div class="form-group">
        <label class="form-label">Phone Number</label>
        <input type="tel" id="vf-phone" value="${v.phone||''}" placeholder="9876543210">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Email (optional)</label>
      <input type="email" id="vf-email" value="${v.email||''}" placeholder="vendor@email.com">
    </div>
    <div class="form-group">
      <label class="form-label">What do they supply?</label>
      <input type="text" id="vf-cats" value="${(v.categories||'').replace(/"/g,'&quot;')}" placeholder="e.g. Dairy, Sauces">
    </div>
    <div class="form-group">
      <label class="form-label">Notes</label>
      <textarea id="vf-notes" placeholder="Order process, payment terms, timing…">${v.notes||''}</textarea>
    </div>`;
}

function saveNewVendor() {
  const name = el('vf-name')?.value?.trim();
  if (!name) { toast('Vendor name is required', 'error'); return; }
  const list = getVendors();
  list.push({
    id: 'v' + Date.now().toString(36),
    name,
    contact:    el('vf-contact')?.value?.trim(),
    phone:      el('vf-phone')?.value?.trim(),
    email:      el('vf-email')?.value?.trim(),
    categories: el('vf-cats')?.value?.trim(),
    notes:      el('vf-notes')?.value?.trim(),
  });
  saveVendors(list);
  toast(`${name} added!`, 'success');
  closeModal();
  navigate('vendors');
}

function editVendor(id) {
  const list = getVendors();
  const v = list.find(x => x.id === id);
  if (!v) return;
  showModal(`Edit — ${v.name}`, vendorForm(v), `
    <button class="btn btn-danger btn-sm"  onclick="deleteVendor('${id}','${v.name.replace(/'/g,"\\'")}')">Delete</button>
    <button class="btn btn-secondary"      onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"        onclick="updateVendor('${id}')">Save Changes</button>
  `);
}

function updateVendor(id) {
  const name = el('vf-name')?.value?.trim();
  if (!name) { toast('Vendor name is required', 'error'); return; }
  const list = getVendors();
  const v = list.find(x => x.id === id);
  if (!v) return;
  Object.assign(v, {
    name,
    contact:    el('vf-contact')?.value?.trim(),
    phone:      el('vf-phone')?.value?.trim(),
    email:      el('vf-email')?.value?.trim(),
    categories: el('vf-cats')?.value?.trim(),
    notes:      el('vf-notes')?.value?.trim(),
  });
  saveVendors(list);
  toast(`${name} updated!`, 'success');
  closeModal();
  navigate('vendors');
}

function deleteVendor(id, name) {
  if (!confirm(`Delete "${name}"?`)) return;
  saveVendors(getVendors().filter(v => v.id !== id));
  toast(`${name} deleted`, 'info');
  closeModal();
  navigate('vendors');
}

// ════════════════════════════════════════════════════════════
//   PAGE: MANAGE ITEMS
//   Central place to edit/delete inventory, expenses & SOPs
// ════════════════════════════════════════════════════════════
function manage(main) {
  const inv  = getInventory();
  const exp  = getExpenses();
  const sops = getSOPs();

  main.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" id="mtab-inventory" onclick="switchManageTab('inventory')">📦 Items (${inv.length})</button>
      <button class="tab-btn" id="mtab-expenses"  onclick="switchManageTab('expenses')">📋 Expenses (${exp.length})</button>
      <button class="tab-btn" id="mtab-sops"      onclick="switchManageTab('sops')">📄 SOPs (${sops.length})</button>
    </div>

    <!-- INVENTORY TAB -->
    <div id="manage-inventory-tab">
      <div class="section-header">
        <span class="section-title">All Inventory Items</span>
        <button class="btn btn-sm btn-primary" onclick="addInventoryItem()">+ Add Item</button>
      </div>
      <input type="text" id="inv-search" placeholder="Search items…" oninput="filterManageInventory(this.value)" style="margin-bottom:12px">
      <div id="manage-inv-list">${renderManageInventory(inv)}</div>
    </div>

    <!-- EXPENSES TAB -->
    <div id="manage-expenses-tab" class="hidden">
      <div class="section-header">
        <span class="section-title">All Expenses</span>
        <span class="text-sm text-muted">${exp.length} entries</span>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <input type="date" id="exp-filter-from" onchange="filterManageExpenses()" placeholder="From">
        <input type="date" id="exp-filter-to"   onchange="filterManageExpenses()" placeholder="To">
      </div>
      <div id="manage-exp-list">${renderManageExpenses(exp)}</div>
    </div>

    <!-- SOPs TAB -->
    <div id="manage-sops-tab" class="hidden">
      <div class="section-header">
        <span class="section-title">All SOPs</span>
        ${isOwner() ? `<button class="btn btn-sm btn-primary" onclick="addSOP()">+ Add SOP</button>` : ''}
      </div>
      <div id="manage-sops-list">${renderManageSOPs(sops)}</div>
    </div>
  `;
}

function switchManageTab(tab) {
  ['inventory','expenses','sops'].forEach(t => {
    const btn  = el('mtab-' + t);
    const pane = el('manage-' + t + '-tab');
    if (btn)  btn.classList.toggle('active', t === tab);
    if (pane) pane.classList.toggle('hidden', t !== tab);
  });
}

// ── MANAGE: INVENTORY ──────────────────────────────────────
function renderManageInventory(inv) {
  if (!inv || !inv.length) return `<div class="empty-state"><div class="empty-state-icon">📦</div><h3>No items yet</h3><p>Tap "+ Add Item" to add your first inventory item</p></div>`;
  return inv.map(i => {
    const hasReorder = i.reorder > 0;
    const status = (hasReorder && i.stock <= i.reorder) ? 'low' : (hasReorder && i.stock <= i.reorder * 1.5) ? 'medium' : 'ok';
    const badgeClass = status === 'low' ? 'badge-red' : status === 'medium' ? 'badge-yellow' : 'badge-green';
    return `
      <div class="manage-item-row" id="mrow-${i.id}">
        <div class="manage-item-info">
          <div class="manage-item-name">${i.name}</div>
          <div class="manage-item-meta">${i.category} · ${i.stock} ${i.unit} · Reorder: ${i.reorder}</div>
        </div>
        <div class="manage-item-actions">
          <span class="badge ${badgeClass}">${i.stock} ${i.unit}</span>
          <button class="btn btn-sm btn-secondary" onclick="editInventoryItem('${i.id}')">Edit</button>
          <button class="btn btn-sm btn-danger"    onclick="deleteInventoryItem('${i.id}','${i.name.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function filterManageInventory(query) {
  const inv = getInventory();
  const filtered = query
    ? inv.filter(i => i.name.toLowerCase().includes(query.toLowerCase()) || i.category.toLowerCase().includes(query.toLowerCase()))
    : inv;
  el('manage-inv-list').innerHTML = renderManageInventory(filtered);
}

const INV_CATEGORIES = ['Pizza Pops','UFO Bombs','Polar Fries','Others','Condiments','Slurrrps','Coco','Add Ons','Packaging','Other'];
const INV_SECTIONS   = ['Kitchen','Bar','Packaging'];

function editInventoryItem(id) {
  const inv  = getInventory();
  const item = inv.find(i => i.id === id);
  if (!item) return;
  const catOpts = [...new Set([...INV_CATEGORIES, item.category])].map(c =>
    `<option ${c === item.category ? 'selected' : ''}>${c}</option>`).join('');
  const secOpts = INV_SECTIONS.map(s =>
    `<option ${s === (item.section||'Kitchen') ? 'selected' : ''}>${s}</option>`).join('');
  showModal(`Edit — ${item.name}`, `
    <div class="form-group">
      <label class="form-label">Item Name</label>
      <input type="text" id="ei-name" value="${item.name.replace(/"/g,'&quot;')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Section</label>
        <select id="ei-section">${secOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Category</label>
        <select id="ei-cat">${catOpts}</select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Unit of Measure</label>
        <input type="text" id="ei-unit" value="${item.unit}">
      </div>
      <div class="form-group">
        <label class="form-label">SKU / Code</label>
        <input type="text" id="ei-sku" value="${item.sku||''}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Unit Cost (₹ excl. tax)</label>
        <input type="number" id="ei-price" value="${item.price||0}" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Tax (₹)</label>
        <input type="number" id="ei-tax" value="${item.tax||0}" min="0" step="0.01">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Total Cost with Tax (₹) — auto or override</label>
      <input type="number" id="ei-totalcost" value="${item.totalCost||0}" min="0" step="0.01">
    </div>
    <div class="form-group">
      <label class="form-label">Supplier / Vendor</label>
      <input type="text" id="ei-supplier" value="${(item.supplier||'').replace(/"/g,'&quot;')}" placeholder="e.g. Hyperpure">
    </div>
    <div class="form-group">
      <label class="form-label">Vendor Contact</label>
      <input type="text" id="ei-contact" value="${(item.contact||'').replace(/"/g,'&quot;')}" placeholder="Name - 9876543210">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Current Stock</label>
        <input type="number" id="ei-stock" value="${item.stock||0}" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Reorder Level</label>
        <input type="number" id="ei-reorder" value="${item.reorder||0}" min="0">
      </div>
    </div>
  `, `
    <button class="btn btn-danger btn-sm"  onclick="deleteInventoryItem('${id}','${item.name.replace(/'/g,"\\'")}')">Delete</button>
    <button class="btn btn-secondary"      onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"        onclick="saveInventoryEdit('${id}')">Save Changes</button>
  `);
  // Wire cost auto-calc after modal DOM is inserted (showModal is synchronous)
  wireInvCostCalc();
}

function wireInvCostCalc() {
  const p = el('ei-price'), t = el('ei-tax'), tot = el('ei-totalcost');
  if (!p || !t || !tot) return;
  const calc = () => { tot.value = (parseFloat(p.value||0) + parseFloat(t.value||0)).toFixed(2); };
  p.addEventListener('input', calc);
  t.addEventListener('input', calc);
}

function saveInventoryEdit(id) {
  const name      = el('ei-name')?.value?.trim();
  const section   = el('ei-section')?.value;
  const cat       = el('ei-cat')?.value;
  const unit      = el('ei-unit')?.value?.trim();
  const sku       = el('ei-sku')?.value?.trim();
  const price     = parseFloat(el('ei-price')?.value) || 0;
  const tax       = parseFloat(el('ei-tax')?.value) || 0;
  const totalCost = parseFloat(el('ei-totalcost')?.value) || (price + tax);
  const supplier  = el('ei-supplier')?.value?.trim();
  const contact   = el('ei-contact')?.value?.trim();
  const stock     = parseFloat(el('ei-stock')?.value) || 0;
  const reorder   = parseFloat(el('ei-reorder')?.value) || 0;
  if (!name || !unit) { toast('Name and unit are required', 'error'); return; }
  const inv  = getInventory();
  const item = inv.find(i => i.id === id);
  if (!item) return;
  Object.assign(item, { name, section, category: cat, unit, sku, price, tax, totalCost, supplier, contact, stock, reorder });
  saveInventory(inv);
  apiCall('updateInventory', { id, name, category: cat, unit, price, supplier, contact, stock, reorder, by: STATE.user.name, date: STATE.today });
  toast(`${name} saved!`, 'success');
  closeModal();
  // Refresh whichever page we're on
  if (STATE.page === 'manage') navigate('manage');
  else navigate('inventory');
}

function deleteInventoryItem(id, name) {
  if (!confirm(`Delete "${name}" from inventory?\n\nThis cannot be undone.`)) return;
  const inv = getInventory().filter(i => i.id !== id);
  saveInventory(inv);
  toast(`${name} deleted`, 'info');
  // Remove row without full re-render; fall back to originating page
  const row = el('mrow-' + id);
  if (row) row.remove();
  else navigate(STATE.page || 'manage');
}

// ── MANAGE: EXPENSES ───────────────────────────────────────
function renderManageExpenses(exp) {
  if (!exp || !exp.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><h3>No expenses logged yet</h3></div>`;
  const sorted = [...exp].sort((a, b) => b.timestamp - a.timestamp);
  return `
    <div class="card" style="padding:0;overflow:hidden">
      ${sorted.map(e => {
        const cat = EXPENSE_CATEGORIES.find(c => c.name === e.category) || { icon:'📎', color:'var(--text3)' };
        return `
          <div class="manage-exp-row" id="mexp-${e.id}">
            <div class="expense-cat-icon" style="background:${cat.color}22;color:${cat.color};width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;flex-shrink:0">${cat.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.description || e.category}</div>
              <div style="font-size:0.73rem;color:var(--text3)">${formatDate(e.date)} · ${e.category} · ${e.paidBy}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div style="font-weight:700;color:var(--red);font-size:0.9rem">${formatCurrency(e.amount)}</div>
              <button class="btn btn-sm btn-danger" style="margin-top:4px;font-size:0.72rem;padding:3px 8px" onclick="deleteExpense('${e.id}')">Delete</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function filterManageExpenses() {
  const from = el('exp-filter-from')?.value;
  const to   = el('exp-filter-to')?.value;
  let exp    = getExpenses();
  if (from) exp = exp.filter(e => e.date >= from);
  if (to)   exp = exp.filter(e => e.date <= to);
  el('manage-exp-list').innerHTML = renderManageExpenses(exp);
}

function deleteExpense(id) {
  if (!confirm('Delete this expense? This cannot be undone.')) return;
  const log = getExpenses().filter(e => e.id !== id);
  saveExpenses(log);
  toast('Expense deleted', 'info');
  const row = el('mexp-' + id);
  if (row) row.remove();
  else navigate('manage');
}

// ── MANAGE: SOPs ───────────────────────────────────────────
function renderManageSOPs(sops) {
  if (!sops || !sops.length) return `<div class="empty-state"><div class="empty-state-icon">📄</div><h3>No SOPs yet</h3></div>`;
  const catMap = Object.fromEntries(SOP_CATEGORIES.map(c => [c.id, c]));
  return sops.map(s => {
    const cat = catMap[s.category] || { icon:'📋', label: s.category };
    return `
      <div class="manage-item-row" id="msop-${s.id}">
        <div style="font-size:1.2rem;flex-shrink:0">${cat.icon}</div>
        <div class="manage-item-info">
          <div class="manage-item-name">${s.title}</div>
          <div class="manage-item-meta">${cat.label} · ${s.steps.length} ${s.type === 'checklist' ? 'items' : 'steps'}</div>
        </div>
        <div class="manage-item-actions">
          <span class="badge badge-gray">${s.type}</span>
          <button class="btn btn-sm btn-secondary" onclick="editSOP('${s.id}')">Edit</button>
          ${isOwner() ? `<button class="btn btn-sm btn-danger" onclick="deleteSOP('${s.id}')">Delete</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ════════════════════════════════════════════════════════════
//   PAGE: SETTINGS
// ════════════════════════════════════════════════════════════
function settings(main) {
  if (!isOwner()) {
    main.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔒</div><h3>Owner access only</h3><p>This section requires an owner PIN</p></div>`;
    return;
  }

  const staffList = getStaffList();
  const scriptUrl = ls('script_url') || '';
  const offlineQueue = ls('offline_queue') || [];

  main.innerHTML = `
    <!-- STAFF MANAGEMENT -->
    <div class="settings-section">
      <div class="settings-section-title">Staff Management</div>
      <div id="staff-list-settings">
        ${renderStaffList(staffList)}
      </div>
      <button class="btn btn-primary btn-sm mt-2" onclick="showAddStaff()" style="width:100%">+ Add Staff Member</button>
    </div>

    <!-- GOOGLE SHEETS -->
    <div class="settings-section">
      <div class="settings-section-title">Google Sheets Sync</div>
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:8px">
        <label class="form-label">Apps Script Web App URL</label>
        <input type="text" id="script-url-input" value="${scriptUrl}" placeholder="https://script.google.com/macros/s/...">
        <button class="btn btn-primary btn-sm" onclick="saveScriptUrl()">Save URL</button>
        ${offlineQueue.length ? `<button class="btn btn-secondary btn-sm" onclick="syncNow()">Sync ${offlineQueue.length} pending items</button>` : ''}
      </div>
    </div>

    <!-- CLOUD BACKUP -->
    <div class="settings-section">
      <div class="settings-section-title">Cloud Backup</div>
      ${(() => {
        const lastTs = ls('last_backup') || 0;
        const lastStr = lastTs ? new Date(lastTs).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Never';
        return `
          <div class="card text-sm" style="margin-bottom:10px">
            <div class="flex justify-between items-center">
              <span class="text-muted">Last backup</span>
              <strong id="last-backup-label">${lastStr}</strong>
            </div>
            <div class="text-muted mt-1" style="font-size:0.75rem">Backs up all data (sales, expenses, attendance, inventory, vendors, SOPs, staff, tasks) once a day automatically.</div>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="runManualBackup()">Backup All Data Now</button>
            ${scriptUrl ? `<button class="btn btn-secondary btn-sm" onclick="restoreFromBackup()">Restore from Cloud</button>` : ''}
          </div>
          ${!scriptUrl ? `<p class="text-muted text-sm mt-1">Set your Sheets URL above to enable cloud backup.</p>` : ''}
        `;
      })()}
    </div>

    <!-- APP SETTINGS -->
    <div class="settings-section">
      <div class="settings-section-title">App Settings</div>
      <div class="settings-row" onclick="showChangePin()">
        <div class="settings-row-left">
          <span class="settings-row-label">Change Your PIN</span>
          <span class="settings-row-sub">Update your personal access PIN</span>
        </div>
        <span class="settings-row-right">›</span>
      </div>
      <div class="settings-row" onclick="exportData()">
        <div class="settings-row-left">
          <span class="settings-row-label">Export to Excel</span>
          <span class="settings-row-sub">Download all data as a formatted .xlsx file (7 sheets)</span>
        </div>
        <span class="settings-row-right">›</span>
      </div>
      <div class="settings-row" onclick="clearTodayData()">
        <div class="settings-row-left">
          <span class="settings-row-label">Clear Today's Data</span>
          <span class="settings-row-sub">Reset today's entries (for correction)</span>
        </div>
        <span class="settings-row-right text-red">›</span>
      </div>
    </div>

    <!-- APP INFO -->
    <div class="settings-section">
      <div class="settings-section-title">App Info</div>
      <div class="card text-sm text-muted">
        <p>Polar Xpress Operations System</p>
        <p>Third Street Kitchen LLP</p>
        <p>Version ${CFG.APP_VERSION}</p>
        <p class="mt-1">All data stored on your device &amp; Google Sheets</p>
      </div>
    </div>
  `;
}

function renderStaffList(staffList) {
  const isMe = s => s.pin === STATE.user.pin;
  return staffList.map(s => `
    <div class="staff-card" style="margin-bottom:8px;flex-wrap:wrap">
      <div class="staff-avatar" style="background:${s.role==='owner'?'var(--accent-dim)':'var(--purple-dim)'};border-color:${s.role==='owner'?'var(--accent)':'var(--purple)'}">
        ${getInitials(s.name)}
      </div>
      <div class="staff-info">
        <div class="staff-name">${s.name} ${isMe(s) ? '<span class="badge badge-gray" style="font-size:0.65rem">You</span>' : ''}</div>
        <div class="staff-role">${s.phone || 'No phone'} · PIN: ${'•'.repeat(s.pin.length)}</div>
      </div>
      <div class="staff-actions" style="flex-wrap:wrap">
        <span class="badge ${s.role==='owner'?'badge-accent':'badge-purple'}">${s.role}</span>
        <button class="btn btn-sm btn-secondary" onclick="editStaff('${s.id}')">Edit</button>
        ${!isMe(s) && s.active  ? `<button class="btn btn-sm btn-danger"    onclick="toggleStaff('${s.id}')">Deactivate</button>` : ''}
        ${!isMe(s) && !s.active ? `<button class="btn btn-sm btn-success"   onclick="toggleStaff('${s.id}')">Activate</button>` : ''}
        ${!isMe(s)              ? `<button class="btn btn-sm btn-danger"     onclick="deleteStaff('${s.id}','${s.name.replace(/'/g,"\\'")}')">Delete</button>` : ''}
      </div>
    </div>`).join('');
}

function showAddStaff() {
  showModal('Add Staff Member', `
    <div class="form-group">
      <label class="form-label">Full Name</label>
      <input type="text" id="ns-name" placeholder="e.g. Ramesh Kumar">
    </div>
    <div class="form-group">
      <label class="form-label">Phone (optional)</label>
      <input type="tel" id="ns-phone" placeholder="9876543210">
    </div>
    <div class="form-group">
      <label class="form-label">Role</label>
      <select id="ns-role">
        <option value="owner">Owner / Manager (full access)</option>
        <option value="staff">Staff (limited access)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">PIN (4 digits)</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="ns-pin" placeholder="e.g. 4567">
      <p class="form-hint">Staff will use this to log in</p>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="saveNewStaff()">Add Staff</button>
  `);
}

function saveNewStaff() {
  const name  = el('ns-name')?.value?.trim();
  const phone = el('ns-phone')?.value?.trim();
  const role  = el('ns-role')?.value;
  const pin   = el('ns-pin')?.value?.trim();
  if (!name || !pin) { toast('Name and PIN are required', 'error'); return; }
  if (pin.length !== 4) { toast('PIN must be exactly 4 digits', 'error'); return; }
  const list = getStaffList();
  if (list.find(s => s.pin === pin)) { toast('That PIN is already in use', 'error'); return; }
  list.push({ id: 's'+Date.now().toString(36), name, phone, role, pin, active: true, createdBy: STATE.user.name, createdAt: Date.now() });
  saveStaffList(list);
  toast(`${name} added!`, 'success');
  closeModal();
  navigate('settings');
}

function editStaff(id) {
  const list = getStaffList();
  const s = list.find(x => x.id === id);
  if (!s) return;
  const isMe = s.pin === STATE.user.pin;
  showModal(`Edit — ${s.name}`, `
    <div class="form-group">
      <label class="form-label">Full Name</label>
      <input type="text" id="es-name" value="${s.name}">
    </div>
    <div class="form-group">
      <label class="form-label">Phone</label>
      <input type="tel" id="es-phone" value="${s.phone||''}">
    </div>
    <div class="form-group">
      <label class="form-label">Role</label>
      <select id="es-role">
        <option value="owner" ${s.role==='owner'?'selected':''}>Owner / Manager (full access)</option>
        <option value="staff"  ${s.role==='staff' ?'selected':''}>Staff (limited access)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">New PIN (leave blank to keep current)</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="es-pin" placeholder="Leave blank to keep current">
    </div>
  `, `
    ${!isMe ? `<button class="btn btn-danger btn-sm" onclick="deleteStaff('${id}','${s.name.replace(/'/g,"\\'")}')">Delete</button>` : ''}
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary"   onclick="updateStaff('${id}')">Save Changes</button>
  `);
}

function updateStaff(id) {
  const list   = getStaffList();
  const s      = list.find(x => x.id === id);
  if (!s) return;
  const name   = el('es-name')?.value?.trim();
  const phone  = el('es-phone')?.value?.trim();
  const role   = el('es-role')?.value;
  const newPin = el('es-pin')?.value?.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  if (newPin && newPin.length !== 4) { toast('PIN must be exactly 4 digits', 'error'); return; }
  if (newPin && list.find(x => x.id !== id && x.pin === newPin)) { toast('That PIN is already in use', 'error'); return; }
  // Capture whether we're editing ourselves BEFORE changing the pin
  const editingSelf = s.pin === STATE.user.pin;
  s.name  = name;
  s.phone = phone;
  s.role  = role;
  if (newPin) s.pin = newPin;
  saveStaffList(list);
  // Update live session only if we just edited our own record
  if (newPin && editingSelf) {
    STATE.user.pin = newPin;
    const session = JSON.parse(sessionStorage.getItem('px_session') || '{}');
    session.pin   = newPin;
    sessionStorage.setItem('px_session', JSON.stringify(session));
  }
  toast('Staff updated!', 'success');
  closeModal();
  navigate('settings');
}

function toggleStaff(id) {
  const list = getStaffList();
  const s    = list.find(x => x.id === id);
  if (!s) return;
  if (s.pin === STATE.user.pin) { toast("You can't deactivate yourself", 'error'); return; }
  s.active = !s.active;
  saveStaffList(list);
  toast(`${s.name} ${s.active ? 'activated' : 'deactivated'}`, 'info');
  navigate('settings');
}

function deleteStaff(id, name) {
  if (!isOwner()) { toast('Owner access only', 'error'); return; }
  const list = getStaffList();
  const s    = list.find(x => x.id === id);
  if (!s) return;
  if (s.pin === STATE.user.pin) { toast("You can't delete yourself", 'error'); return; }
  if (!confirm(`Permanently delete ${name}?\n\nThis removes them from the staff list. Their attendance history is kept.`)) return;
  saveStaffList(list.filter(x => x.id !== id));
  toast(`${name} deleted`, 'info');
  closeModal();
  navigate('settings');
}

function showChangePin() {
  showModal('Change Your PIN', `
    <div class="form-group">
      <label class="form-label">Current PIN</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="cp-current" placeholder="Current PIN">
    </div>
    <div class="form-group">
      <label class="form-label">New PIN</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="cp-new" placeholder="New 4-digit PIN">
    </div>
    <div class="form-group">
      <label class="form-label">Confirm New PIN</label>
      <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="cp-confirm" placeholder="Repeat new PIN">
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn btn-primary" onclick="changePin()">Change PIN</button>
  `);
}

function changePin() {
  const current = el('cp-current')?.value;
  const newPin  = el('cp-new')?.value;
  const confirmPin = el('cp-confirm')?.value;
  if (current !== STATE.user.pin) { toast('Current PIN is incorrect', 'error'); return; }
  if (!newPin || newPin.length !== 4) { toast('New PIN must be exactly 4 digits', 'error'); return; }
  if (newPin !== confirmPin) { toast('PINs do not match', 'error'); return; }
  const list = getStaffList();
  const me = list.find(s => s.pin === STATE.user.pin);
  if (me) {
    if (list.find(s => s.id !== me.id && s.pin === newPin)) { toast('That PIN is already in use', 'error'); return; }
    me.pin = newPin;
    saveStaffList(list);
    STATE.user.pin = newPin;
    const session = JSON.parse(sessionStorage.getItem('px_session') || '{}');
    session.pin = newPin;
    sessionStorage.setItem('px_session', JSON.stringify(session));
    toast('PIN changed successfully!', 'success');
    closeModal();
  }
}

function saveScriptUrl() {
  const url = el('script-url-input')?.value?.trim();
  ls('script_url', url);
  CFG.SCRIPT_URL = url;
  toast('Google Sheets URL saved!', 'success');
  syncNow();
}

async function syncNow() {
  toast('Syncing...', 'info');
  await syncOfflineQueue();
}

function exportData() {
  if (typeof XLSX === 'undefined') {
    toast('Excel library not loaded — check internet and try again', 'error');
    return;
  }

  const wb = XLSX.utils.book_new();
  const num = v => parseFloat(v) || 0;

  // ── helper: build a worksheet with auto column widths ──────
  function ws(headers, rows) {
    const data = [headers, ...rows];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = headers.map((h, i) => {
      const maxLen = Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
    });
    sheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    return sheet;
  }

  // ── 1. DAILY SALES ────────────────────────────────────────
  const sales = getSalesLog().slice().sort((a,b) => b.date.localeCompare(a.date));
  XLSX.utils.book_append_sheet(wb, ws(
    ['Date','Billing User','Orders','Net Sales (₹)','Total Sales (₹)','Cash (₹)','Card (₹)','UPI (₹)','Other (₹)','Waived (₹)','Not Paid (₹)','Submitted By'],
    sales.map(s => [
      s.date, s.billingUser||'',
      num(s.orders), num(s.netSales), num(s.totalSales),
      num(s.cash), num(s.card), num(s.upi), num(s.other),
      num(s.waived), num(s.notPaid),
      s.submittedBy||'',
    ])
  ), 'Daily Sales');

  // ── 2. EXPENSES ───────────────────────────────────────────
  const expenses = getExpenses().slice().sort((a,b) => b.date.localeCompare(a.date));
  XLSX.utils.book_append_sheet(wb, ws(
    ['Date','Category','Description','Amount (₹)','Paid By','Bill Ref','Added By'],
    expenses.map(e => [
      e.date, e.category||'', e.description||'',
      num(e.amount), e.paidBy||'', e.ref||'', e.addedBy||'',
    ])
  ), 'Expenses');

  // ── 3. CASH RECONCILIATION ────────────────────────────────
  const recon = getReconLog().slice().sort((a,b) => b.date.localeCompare(a.date));
  XLSX.utils.book_append_sheet(wb, ws(
    ['Date','Time','Total Counted (₹)','Expected (₹)','Difference (₹)','₹500','₹200','₹100','₹50','₹20','₹10','₹5','₹2','₹1','Coins','Notes','By'],
    recon.map(r => [
      r.date, r.time||'',
      num(r.counted), num(r.expected), num(r.difference),
      num(r.note_500), num(r.note_200), num(r.note_100), num(r.note_50),
      num(r.note_20), num(r.note_10), num(r.note_5), num(r.note_2), num(r.note_1),
      num(r.coins), r.notes||'', r.by||'',
    ])
  ), 'Cash Reconciliation');

  // ── 4. ATTENDANCE ─────────────────────────────────────────
  const att = getAttendanceLog().filter(a => a.clockIn).slice().sort((a,b) => b.date.localeCompare(a.date));
  XLSX.utils.book_append_sheet(wb, ws(
    ['Date','Staff Name','Clock In','Clock Out','Hours','Notes','Edited By'],
    att.map(a => [
      a.date, a.name||'', a.clockIn||'', a.clockOut||'',
      num(a.hours), a.notes||'', a.editedBy||'',
    ])
  ), 'Attendance');

  // ── 5. INVENTORY ──────────────────────────────────────────
  const inv = getInventory().slice().sort((a,b) => (a.section+a.name).localeCompare(b.section+b.name));
  XLSX.utils.book_append_sheet(wb, ws(
    ['Section','Category','Item Name','SKU','Unit','Stock (qty)','Reorder Level','Unit Cost (₹)','Tax (₹)','Total Cost (₹)','Supplier','Contact'],
    inv.map(i => [
      i.section||'', i.category||'', i.name||'', i.sku||'', i.unit||'',
      num(i.stock), num(i.reorder),
      num(i.price), num(i.tax), num(i.totalCost),
      i.supplier||'', i.contact||'',
    ])
  ), 'Inventory');

  // ── 6. VENDORS ────────────────────────────────────────────
  const vendors = getVendors().slice().sort((a,b) => a.name.localeCompare(b.name));
  XLSX.utils.book_append_sheet(wb, ws(
    ['Vendor Name','Contact Person','Phone','Email','Supplies','Notes'],
    vendors.map(v => [
      v.name||'', v.contact||'', v.phone||'', v.email||'',
      v.categories||'', v.notes||'',
    ])
  ), 'Vendors');

  // ── 7. MONTHLY SUMMARY ────────────────────────────────────
  const allMonths = [...new Set([
    ...getSalesLog().map(s => s.date.slice(0,7)),
    ...getExpenses().map(e => e.date.slice(0,7)),
  ])].sort().reverse();
  const summaryRows = allMonths.map(m => {
    const mSales   = getSalesLog().filter(s => s.date.startsWith(m));
    const mExp     = getExpenses().filter(e => e.date.startsWith(m));
    const revenue  = mSales.reduce((s,e) => s + num(e.totalSales), 0);
    const cash     = mSales.reduce((s,e) => s + num(e.cash), 0);
    const card     = mSales.reduce((s,e) => s + num(e.card), 0);
    const upi      = mSales.reduce((s,e) => s + num(e.upi), 0);
    const expTotal = mExp.reduce((s,e) => s + num(e.amount), 0);
    return [m, revenue, cash, card, upi, expTotal, revenue - expTotal];
  });
  XLSX.utils.book_append_sheet(wb, ws(
    ['Month','Total Revenue (₹)','Cash (₹)','Card (₹)','UPI (₹)','Total Expenses (₹)','Net (₹)'],
    summaryRows
  ), 'Monthly Summary');

  // ── Write file ────────────────────────────────────────────
  const filename = `PolarXpress-Export-${STATE.today}.xlsx`;
  XLSX.writeFile(wb, filename);
  toast('Excel file downloaded!', 'success');
}

function clearTodayData() {
  if (!confirm(`Clear ALL data for today (${formatDate(STATE.today)})? This cannot be undone.`)) return;
  saveSalesLog(getSalesLog().filter(s => s.date !== STATE.today));
  saveReconLog(getReconLog().filter(r => r.date !== STATE.today));
  saveExpenses(getExpenses().filter(e => e.date !== STATE.today));
  saveAttendanceLog(getAttendanceLog().filter(a => a.date !== STATE.today));
  toast("Today's data cleared", 'warning');
  navigate('dashboard');
}

// ─── FIRST RUN SETUP ──────────────────────────────────────
function showFirstRun() {
  document.body.innerHTML = `
    <div id="setup-screen">
      <div class="setup-card">
        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:2.5rem;margin-bottom:8px">❄</div>
          <h2>Welcome to Polar Xpress Ops</h2>
          <p>Let's set up your team. You can change these anytime in Settings.</p>
        </div>
        <div class="setup-step">
          <p><span class="step-num">1</span><strong>Pranav's PIN</strong></p>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="setup-pin-pranav" placeholder="Enter your PIN (e.g. 1234)">

          <p><span class="step-num">2</span><strong>Raj's PIN</strong></p>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="setup-pin-raj" placeholder="Raj's PIN">

          <p><span class="step-num">3</span><strong>Tej's PIN</strong></p>
          <input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="setup-pin-tej" placeholder="Tej's PIN">

          <button class="btn btn-primary btn-lg" style="margin-top:8px" onclick="completeSetup()">Set Up & Start</button>
        </div>
      </div>
    </div>
  `;
}

function completeSetup() {
  const pinP = document.getElementById('setup-pin-pranav')?.value?.trim();
  const pinR = document.getElementById('setup-pin-raj')?.value?.trim();
  const pinT = document.getElementById('setup-pin-tej')?.value?.trim();

  if (!pinP || !pinR || !pinT) { alert('Please set a PIN for all three team members'); return; }
  if (pinP.length !== 4 || pinR.length !== 4 || pinT.length !== 4) { alert('PINs must be exactly 4 digits'); return; }
  const pins = [pinP, pinR, pinT];
  if (new Set(pins).size !== 3) { alert('Each person must have a unique PIN'); return; }

  const staff = [
    { id: 's1', name: 'Pranav', role: 'owner', pin: pinP, phone: '', active: true },
    { id: 's2', name: 'Raj',    role: 'owner', pin: pinR, phone: '', active: true },
    { id: 's3', name: 'Tej',    role: 'owner', pin: pinT, phone: '', active: true },
  ];
  saveStaffList(staff);
  ls('setup_done', true);
  location.reload();
}

// ════════════════════════════════════════════════════════════
//   PAGE: PROFIT & LOSS
// ════════════════════════════════════════════════════════════
function pnl(main) {
  if (!isOwner()) {
    main.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔒</div><h3>Owner access only</h3></div>`;
    return;
  }

  const COGS_CATS = ['Raw Materials','Syrups & Ingredients','Supplies (Cups/Straws)','Packaging'];

  function getPnlRange(period) {
    const today = STATE.today;
    const d = new Date(today + 'T00:00:00');
    let start, end = today;
    if (period === 'today') {
      start = today;
    } else if (period === 'week') {
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      start = mon.toISOString().split('T')[0];
    } else if (period === 'month') {
      start = today.slice(0, 7) + '-01';
    } else if (period === 'lastmonth') {
      const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lme = new Date(d.getFullYear(), d.getMonth(), 0);
      start = lm.toISOString().split('T')[0];
      end = lme.toISOString().split('T')[0];
    }
    return { start, end };
  }

  function computePnl(start, end) {
    const sLog = getSalesLog().filter(s => s.date >= start && s.date <= end);
    const eLog = getExpenses().filter(e => e.date >= start && e.date <= end);
    const totalRevenue = sLog.reduce((s, e) => s + (parseFloat(e.totalSales) || 0), 0);
    const cashRev  = sLog.reduce((s, e) => s + (parseFloat(e.cash) || 0), 0);
    const cardRev  = sLog.reduce((s, e) => s + (parseFloat(e.card) || 0), 0);
    const upiRev   = sLog.reduce((s, e) => s + (parseFloat(e.upi) || 0), 0);
    const otherRev = sLog.reduce((s, e) => s + (parseFloat(e.other) || 0), 0);
    const byCat = {};
    EXPENSE_CATEGORIES.forEach(c => {
      const total = eLog.filter(x => x.category === c.name).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      if (total > 0) byCat[c.name] = { total, icon: c.icon, isCogs: COGS_CATS.includes(c.name) };
    });
    const cogs = Object.values(byCat).filter(v => v.isCogs).reduce((s, v) => s + v.total, 0);
    const opex = Object.values(byCat).filter(v => !v.isCogs).reduce((s, v) => s + v.total, 0);
    const grossProfit = totalRevenue - cogs;
    const netProfit = grossProfit - opex;
    const salesDays = [...new Set(sLog.map(s => s.date))].length;
    return { totalRevenue, cashRev, cardRev, upiRev, otherRev, byCat, cogs, opex, grossProfit, netProfit, salesDays };
  }

  function renderPnlContent(period) {
    const { start, end } = getPnlRange(period);
    const d = computePnl(start, end);
    const grossMargin = d.totalRevenue ? (d.grossProfit / d.totalRevenue * 100) : 0;
    const netMargin   = d.totalRevenue ? (d.netProfit  / d.totalRevenue * 100) : 0;
    const cogsCats = Object.entries(d.byCat).filter(([,v]) => v.isCogs);
    const opexCats = Object.entries(d.byCat).filter(([,v]) => !v.isCogs);

    let compHTML = '';
    if (period === 'month') {
      const lmr = getPnlRange('lastmonth');
      const lm  = computePnl(lmr.start, lmr.end);
      const revDiff  = lm.totalRevenue ? ((d.totalRevenue - lm.totalRevenue) / lm.totalRevenue * 100) : 0;
      const profDiff = lm.netProfit    ? ((d.netProfit - lm.netProfit) / Math.abs(lm.netProfit) * 100) : 0;
      compHTML = `
        <div class="section-header mt-2"><span class="section-title">vs Last Month</span></div>
        <div class="pnl-section">
          <div class="pnl-row pnl-sub">
            <span>Revenue (was ${formatCurrency(lm.totalRevenue)})</span>
            <span class="badge ${revDiff >= 0 ? 'badge-green' : 'badge-red'}">${revDiff >= 0 ? '▲' : '▼'} ${Math.abs(revDiff).toFixed(1)}%</span>
          </div>
          <div class="pnl-row pnl-sub">
            <span>Net Profit (was ${formatCurrency(lm.netProfit)})</span>
            <span class="badge ${profDiff >= 0 ? 'badge-green' : 'badge-red'}">${profDiff >= 0 ? '▲' : '▼'} ${Math.abs(profDiff).toFixed(1)}%</span>
          </div>
        </div>`;
    }

    el('pnl-content').innerHTML = `
      <div class="pnl-section">
        <div class="pnl-header">Revenue</div>
        <div class="pnl-row pnl-total"><span>Total Revenue</span><span class="text-accent">${formatCurrency(d.totalRevenue)}</span></div>
        ${d.cashRev  ? `<div class="pnl-row pnl-sub"><span>💵 Cash</span><span>${formatCurrency(d.cashRev)}</span></div>` : ''}
        ${d.cardRev  ? `<div class="pnl-row pnl-sub"><span>💳 Card (EDC)</span><span>${formatCurrency(d.cardRev)}</span></div>` : ''}
        ${d.upiRev   ? `<div class="pnl-row pnl-sub"><span>📱 UPI</span><span>${formatCurrency(d.upiRev)}</span></div>` : ''}
        ${d.otherRev ? `<div class="pnl-row pnl-sub"><span>Other</span><span>${formatCurrency(d.otherRev)}</span></div>` : ''}
        <div class="pnl-row pnl-sub" style="color:var(--text3)"><span>Days with sales</span><span>${d.salesDays}</span></div>
      </div>

      <div class="pnl-section">
        <div class="pnl-header">Cost of Goods (COGS)</div>
        <div class="pnl-row pnl-total"><span>Total COGS</span><span class="text-red">(${formatCurrency(d.cogs)})</span></div>
        ${cogsCats.length ? cogsCats.map(([n, v]) => `<div class="pnl-row pnl-sub"><span>${v.icon} ${n}</span><span>${formatCurrency(v.total)}</span></div>`).join('') : '<div class="pnl-row pnl-sub" style="color:var(--text3)"><span>No COGS logged yet</span><span>₹0</span></div>'}
      </div>

      <div class="pnl-section pnl-highlight ${d.grossProfit >= 0 ? 'pnl-green' : 'pnl-red'}">
        <div class="pnl-row pnl-total"><span>Gross Profit</span><span>${formatCurrency(d.grossProfit)}</span></div>
        <div class="pnl-row pnl-sub"><span>Gross Margin</span><span>${grossMargin.toFixed(1)}%</span></div>
      </div>

      <div class="pnl-section">
        <div class="pnl-header">Operating Expenses</div>
        <div class="pnl-row pnl-total"><span>Total OpEx</span><span class="text-red">(${formatCurrency(d.opex)})</span></div>
        ${opexCats.length ? opexCats.map(([n, v]) => `<div class="pnl-row pnl-sub"><span>${v.icon} ${n}</span><span>${formatCurrency(v.total)}</span></div>`).join('') : '<div class="pnl-row pnl-sub" style="color:var(--text3)"><span>No OpEx logged yet</span><span>₹0</span></div>'}
      </div>

      <div class="pnl-section pnl-highlight ${d.netProfit >= 0 ? 'pnl-green' : 'pnl-red'}">
        <div class="pnl-row pnl-total"><span>Net Profit</span><span>${formatCurrency(d.netProfit)}</span></div>
        <div class="pnl-row pnl-sub"><span>Net Margin</span><span>${netMargin.toFixed(1)}%</span></div>
      </div>

      ${compHTML}
      <div style="height:24px"></div>
    `;
  }

  STATE.pnlPeriod = STATE.pnlPeriod || 'month';

  main.innerHTML = `
    <div class="tabs" id="pnl-tabs">
      <button class="tab-btn ${STATE.pnlPeriod==='today'?'active':''}" data-period="today" onclick="switchPnlPeriod('today')">Today</button>
      <button class="tab-btn ${STATE.pnlPeriod==='week'?'active':''}" data-period="week" onclick="switchPnlPeriod('week')">Week</button>
      <button class="tab-btn ${STATE.pnlPeriod==='month'?'active':''}" data-period="month" onclick="switchPnlPeriod('month')">Month</button>
      <button class="tab-btn ${STATE.pnlPeriod==='lastmonth'?'active':''}" data-period="lastmonth" onclick="switchPnlPeriod('lastmonth')">Last Month</button>
    </div>
    <div id="pnl-content"></div>
  `;

  renderPnlContent(STATE.pnlPeriod);
  window._renderPnlContent = renderPnlContent;
}

function switchPnlPeriod(period) {
  STATE.pnlPeriod = period;
  document.querySelectorAll('#pnl-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.period === period)
  );
  if (window._renderPnlContent) window._renderPnlContent(period);
}

// ════════════════════════════════════════════════════════════
//   PAGE: PRODUCT TRACKER
// ════════════════════════════════════════════════════════════
function products(main) {
  STATE.productTab = STATE.productTab || 'daily';
  main.innerHTML = `
    <div class="tabs" id="product-tabs">
      <button class="tab-btn ${STATE.productTab==='daily'?'active':''}" id="pt-tab-daily" onclick="switchProductTab('daily')">Daily Entry</button>
      <button class="tab-btn ${STATE.productTab==='cost'?'active':''}" id="pt-tab-cost" onclick="switchProductTab('cost')">Food Cost</button>
      <button class="tab-btn ${STATE.productTab==='packaging'?'active':''}" id="pt-tab-packaging" onclick="switchProductTab('packaging')">Packaging</button>
      <button class="tab-btn ${STATE.productTab==='list'?'active':''}" id="pt-tab-list" onclick="switchProductTab('list')">Products</button>
    </div>
    <div id="product-tab-content"></div>
  `;
  renderProductTab(STATE.productTab);
}

function switchProductTab(tab) {
  STATE.productTab = tab;
  document.querySelectorAll('#product-tabs .tab-btn').forEach(b =>
    b.classList.toggle('active', b.id === 'pt-tab-' + tab)
  );
  renderProductTab(tab);
}

function renderProductTab(tab) {
  const c = el('product-tab-content');
  if (!c) return;
  if (tab === 'daily')     renderDailyProductEntry(c);
  else if (tab === 'cost') renderFoodCostSheet(c);
  else if (tab === 'packaging') renderPackagingTracker(c);
  else if (tab === 'list') renderProductList(c);
}

function calcProductCost(p) {
  const ingCost = (p.ingredients || []).reduce((s, i) => s + (parseFloat(i.costPerPc) || 0) * (parseFloat(i.qtyPerUnit) || 0), 0);
  return ingCost + (parseFloat(p.fixedCostPerUnit) || 0);
}

// ── Daily Entry Tab ──
function renderDailyProductEntry(container) {
  const prodList = getProducts().filter(p => p.active !== false);
  const today = STATE.today;
  const todayLog = getProductLog().filter(l => l.date === today);
  const entryMap = {};
  todayLog.forEach(l => { entryMap[l.productId] = l.unitsSold; });

  if (!prodList.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏷</div><h3>No products set up</h3><p>Go to the Products tab to add your menu items</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="form-group">
        <label class="form-label">Date</label>
        <input type="date" id="prod-entry-date" value="${today}" max="${today}" onchange="reloadDailyProductEntry()">
      </div>
    </div>
    <div class="section-header">
      <span class="section-title">Units Sold</span>
    </div>
    ${prodList.map(p => {
      const cost = calcProductCost(p);
      const margin = p.avgSellingPrice ? ((p.avgSellingPrice - cost) / p.avgSellingPrice * 100) : 0;
      const sold = entryMap[p.id] || 0;
      return `
        <div class="card" style="margin-bottom:10px">
          <div class="flex justify-between items-center">
            <div>
              <div style="font-weight:600">${p.name}</div>
              <div class="text-muted" style="font-size:0.8rem">₹${p.avgSellingPrice} / ${p.servingLabel||'unit'} · Cost ₹${cost.toFixed(2)} · Margin ${margin.toFixed(1)}%</div>
            </div>
          </div>
          <div class="flex" style="gap:12px;align-items:center;margin-top:10px">
            <div style="flex:1">
              <label class="form-label">Units sold (${p.servingLabel||'unit'}s)</label>
              <input type="number" class="prod-units-input" data-pid="${p.id}" data-price="${p.avgSellingPrice}" data-cost="${cost}" value="${sold}" min="0" placeholder="0" oninput="updateProductEntryCalc('${p.id}')">
            </div>
            <div id="prod-calc-${p.id}" style="text-align:right;min-width:110px;font-size:0.85rem">
              ${sold ? `<div style="font-weight:600;color:var(--accent)">${formatCurrency(sold * p.avgSellingPrice)}</div><div style="color:var(--text2)">Rev</div><div style="color:var(--red)">${formatCurrency(sold * cost)} COGS</div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('')}
    <div class="card" id="prod-entry-totals" style="border:2px solid var(--accent)">
      ${renderProductEntryTotalsHTML(prodList, entryMap)}
    </div>
    <button class="btn btn-primary btn-lg" onclick="saveProductEntry()" style="margin-top:12px;width:100%">Save Daily Entry</button>
    <div style="height:20px"></div>
  `;
}

function renderProductEntryTotalsHTML(prodList, entryMap) {
  let totalRevenue = 0, totalCogs = 0, totalUnits = 0;
  prodList.forEach(p => {
    const sold = parseFloat(entryMap[p.id]) || 0;
    totalUnits += sold;
    totalRevenue += sold * (parseFloat(p.avgSellingPrice) || 0);
    totalCogs += sold * calcProductCost(p);
  });
  const grossProfit = totalRevenue - totalCogs;
  if (!totalUnits) return `<p class="text-muted text-sm text-center" style="padding:8px 0">Enter units sold to see live totals</p>`;
  return `
    <div class="pnl-row pnl-sub"><span>Total Units Sold</span><span>${totalUnits}</span></div>
    <div class="pnl-row pnl-sub"><span>Total Revenue</span><span class="text-accent">${formatCurrency(totalRevenue)}</span></div>
    <div class="pnl-row pnl-sub"><span>Total COGS</span><span class="text-red">${formatCurrency(totalCogs)}</span></div>
    <div class="pnl-row pnl-total"><span>Gross Profit</span><span class="${grossProfit >= 0 ? 'text-accent' : 'text-red'}">${formatCurrency(grossProfit)}</span></div>
    ${totalRevenue ? `<div class="pnl-row pnl-sub" style="color:var(--text3)"><span>Margin</span><span>${(grossProfit/totalRevenue*100).toFixed(1)}%</span></div>` : ''}
  `;
}

function updateProductEntryCalc(pid) {
  const inp = document.querySelector(`[data-pid="${pid}"]`);
  if (!inp) return;
  const sold  = parseFloat(inp.value) || 0;
  const price = parseFloat(inp.dataset.price) || 0;
  const cost  = parseFloat(inp.dataset.cost) || 0;
  const calcDiv = el('prod-calc-' + pid);
  if (calcDiv) {
    calcDiv.innerHTML = sold ? `<div style="font-weight:600;color:var(--accent)">${formatCurrency(sold * price)}</div><div style="color:var(--text2)">Rev</div><div style="color:var(--red)">${formatCurrency(sold * cost)} COGS</div>` : '';
  }
  const prodList = getProducts().filter(p => p.active !== false);
  const entryMap = {};
  document.querySelectorAll('.prod-units-input').forEach(i => { entryMap[i.dataset.pid] = parseFloat(i.value) || 0; });
  const tot = el('prod-entry-totals');
  if (tot) tot.innerHTML = renderProductEntryTotalsHTML(prodList, entryMap);
}

function reloadDailyProductEntry() {
  const date = el('prod-entry-date')?.value || STATE.today;
  const todayLog = getProductLog().filter(l => l.date === date);
  const entryMap = {};
  todayLog.forEach(l => { entryMap[l.productId] = l.unitsSold; });
  document.querySelectorAll('.prod-units-input').forEach(inp => {
    inp.value = entryMap[inp.dataset.pid] || 0;
    updateProductEntryCalc(inp.dataset.pid);
  });
}

function saveProductEntry() {
  const date = el('prod-entry-date')?.value || STATE.today;
  const entries = [];
  document.querySelectorAll('.prod-units-input').forEach(inp => {
    const sold = parseFloat(inp.value) || 0;
    if (sold > 0) entries.push({ productId: inp.dataset.pid, unitsSold: sold });
  });
  if (!entries.length) { toast('Enter at least one product sold', 'error'); return; }
  const log = getProductLog().filter(l => l.date !== date);
  entries.forEach(e => log.push({ id: Date.now().toString() + e.productId, date, productId: e.productId, unitsSold: e.unitsSold, enteredBy: STATE.user.name, timestamp: Date.now() }));
  saveProductLog(log);
  toast('Product entry saved!', 'success');
}

// ── Food Cost Sheet Tab ──
function renderFoodCostSheet(container) {
  const prodList = getProducts().filter(p => p.active !== false);
  if (!prodList.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No products set up</h3><p>Add products in the Products tab first</p></div>`;
    return;
  }
  if (!STATE.costSheetProduct) STATE.costSheetProduct = prodList[0].id;
  container.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="form-group">
        <label class="form-label">Select Product</label>
        <select id="cost-sheet-select" onchange="switchCostSheetProduct(this.value)">
          ${prodList.map(p => `<option value="${p.id}" ${p.id===STATE.costSheetProduct?'selected':''}>${p.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="cost-sheet-detail"></div>
  `;
  renderCostSheetDetail(STATE.costSheetProduct);
}

function renderCostSheetDetail(productId) {
  const p = getProducts().find(x => x.id === productId);
  const container = el('cost-sheet-detail');
  if (!p || !container) return;
  const ingCost = (p.ingredients || []).reduce((s, i) => s + (parseFloat(i.costPerPc)||0)*(parseFloat(i.qtyPerUnit)||0), 0);
  const costPerUnit = ingCost + (parseFloat(p.fixedCostPerUnit)||0);
  const profit = (parseFloat(p.avgSellingPrice)||0) - costPerUnit;
  const margin = p.avgSellingPrice ? (profit / p.avgSellingPrice * 100) : 0;
  const todaySold = getProductLog().filter(l => l.date === STATE.today && l.productId === productId).reduce((s, l) => s + (l.unitsSold||0), 0);

  container.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div style="font-weight:700;font-size:1rem;margin-bottom:14px">Food Cost Sheet — ${p.name}</div>
      <div style="overflow-x:auto">
        <table class="food-cost-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Cost/Pc</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Per ${p.servingLabel||'unit'}</th>
            </tr>
          </thead>
          <tbody>
            ${(p.ingredients||[]).map(ing => {
              const lineTotal = (parseFloat(ing.costPerPc)||0)*(parseFloat(ing.qtyPerUnit)||0);
              return `<tr>
                <td>${ing.isPackaging?'📦 ':''}${ing.name}</td>
                <td>₹${parseFloat(ing.costPerPc||0).toFixed(2)}</td>
                <td>${ing.qtyPerUnit}</td>
                <td>${ing.unit||'pc'}</td>
                <td style="font-weight:500">₹${lineTotal.toFixed(2)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">Total Ingredient Cost</td>
              <td>₹${ingCost.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="4" style="color:var(--text2)">Fixed Cost (gas/elec/etc)</td>
              <td>₹${parseFloat(p.fixedCostPerUnit||0).toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td colspan="4">Total Cost / ${p.servingLabel||'unit'}</td>
              <td style="color:var(--red)">₹${costPerUnit.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
        <div class="stat-card" style="padding:10px">
          <div class="stat-label">Avg Selling Price</div>
          <div style="font-size:1.1rem;font-weight:700;color:var(--accent)">₹${parseFloat(p.avgSellingPrice||0).toFixed(2)}</div>
        </div>
        <div class="stat-card ${profit < 0 ? 'red' : ''}" style="padding:10px">
          <div class="stat-label">Profit / ${p.servingLabel||'unit'}</div>
          <div style="font-size:1.1rem;font-weight:700;color:${profit >= 0 ? 'var(--green)' : 'var(--red)'}">₹${profit.toFixed(2)}</div>
        </div>
        <div class="stat-card" style="padding:10px">
          <div class="stat-label">Margin</div>
          <div style="font-size:1.1rem;font-weight:700;color:${margin >= 30 ? 'var(--green)' : 'var(--red)'}">${margin.toFixed(1)}%</div>
        </div>
        <div class="stat-card" style="padding:10px">
          <div class="stat-label">Sold Today</div>
          <div style="font-size:1.1rem;font-weight:700">${todaySold} ${p.servingLabel||'unit'}s</div>
        </div>
      </div>

      ${todaySold > 0 ? `
      <div style="margin-top:14px;background:var(--bg2);border-radius:var(--radius-sm);overflow:hidden">
        <div class="pnl-row pnl-sub"><span>Today's Revenue</span><span class="text-accent">${formatCurrency(todaySold*(parseFloat(p.avgSellingPrice)||0))}</span></div>
        <div class="pnl-row pnl-sub"><span>Today's COGS</span><span class="text-red">${formatCurrency(todaySold*costPerUnit)}</span></div>
        <div class="pnl-row pnl-total"><span>Today's Gross Profit</span><span class="${profit>=0?'text-accent':'text-red'}">${formatCurrency(todaySold*profit)}</span></div>
      </div>` : ''}
    </div>

    ${isOwner() ? `<button class="btn btn-secondary" style="margin-top:8px;width:100%" onclick="showEditProduct('${p.id}')">Edit Product / Recipe</button>` : ''}
    <div style="height:20px"></div>
  `;
}

function switchCostSheetProduct(productId) {
  STATE.costSheetProduct = productId;
  renderCostSheetDetail(productId);
}

// ── Packaging Tracker Tab ──
function renderPackagingTracker(container) {
  const packInventory = getInventory().filter(i => i.section === 'Packaging');
  const prodList = getProducts().filter(p => p.active !== false);
  const todayLog = getProductLog().filter(l => l.date === STATE.today);
  const usageMap = {};
  todayLog.forEach(log => {
    const p = prodList.find(x => x.id === log.productId);
    if (!p) return;
    (p.ingredients || []).filter(i => i.isPackaging).forEach(ing => {
      if (!usageMap[ing.name]) usageMap[ing.name] = { name: ing.name, unit: ing.unit||'pc', used: 0, costPerPc: parseFloat(ing.costPerPc)||0 };
      usageMap[ing.name].used += (parseFloat(ing.qtyPerUnit)||0) * (parseInt(log.unitsSold)||0);
    });
  });
  const usageList = Object.values(usageMap);
  const totalPkgCost = usageList.reduce((s, i) => s + i.used * i.costPerPc, 0);

  container.innerHTML = `
    <div class="section-header" style="margin-top:12px">
      <span class="section-title">Packaging Used Today</span>
      ${totalPkgCost > 0 ? `<strong class="text-red">${formatCurrency(totalPkgCost)}</strong>` : ''}
    </div>
    ${usageList.length ? `
    <div class="card">
      ${usageList.map(item => `
        <div class="list-item">
          <div class="list-item-body">
            <div class="list-item-title">📦 ${item.name}</div>
            <div class="list-item-sub">₹${item.costPerPc.toFixed(2)} per ${item.unit}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:600">${item.used} ${item.unit}</div>
            <div class="text-muted" style="font-size:0.8rem">${formatCurrency(item.used * item.costPerPc)}</div>
          </div>
        </div>`).join('')}
    </div>` : `<div class="card"><p class="text-muted text-sm">Enter product sales in Daily Entry to see packaging usage here.</p></div>`}

    <div class="section-header mt-2">
      <span class="section-title">Packaging Stock (Inventory)</span>
    </div>
    ${packInventory.length ? `
    <div class="card">
      ${packInventory.map(item => `
        <div class="list-item">
          <div class="list-item-body">
            <div class="list-item-title">${item.name}</div>
            <div class="list-item-sub">${item.category} · ₹${item.totalCost||item.price||0}/${item.unit||'unit'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:600;color:${item.reorder>0&&item.stock<=item.reorder?'var(--red)':'inherit'}">${item.stock||0} ${item.unit||''}</div>
            ${item.reorder>0&&item.stock<=item.reorder?`<span class="badge badge-red" style="font-size:0.65rem">Low</span>`:''}
          </div>
        </div>`).join('')}
    </div>` : `<div class="card"><p class="text-muted text-sm">No packaging items in Inventory yet. Add items to Inventory with section set to "Packaging".</p></div>`}
    <div style="height:20px"></div>
  `;
}

// ── Product List Tab (manage recipes) ──
let _ingCounter = 0;

function renderProductList(container) {
  const prodList = getProducts();
  container.innerHTML = `
    <div class="flex justify-between items-center" style="margin:12px 0">
      <span class="text-muted text-sm">${prodList.length} product${prodList.length!==1?'s':''}</span>
      ${isOwner()?`<button class="btn btn-primary btn-sm" onclick="showAddProduct()">+ Add Product</button>`:''}
    </div>
    ${prodList.map(p => {
      const cost = calcProductCost(p);
      const margin = p.avgSellingPrice ? ((p.avgSellingPrice - cost) / p.avgSellingPrice * 100) : 0;
      return `
        <div class="card" style="margin-bottom:10px;${p.active===false?'opacity:0.5':''}">
          <div class="flex justify-between items-center">
            <div>
              <div style="font-weight:600">${p.name}</div>
              <div class="text-muted" style="font-size:0.8rem">${p.category||''} · ${p.ingredients?.length||0} ingredients</div>
            </div>
            ${isOwner()?`
            <div class="flex" style="gap:6px">
              <button class="btn btn-sm btn-secondary" onclick="showEditProduct('${p.id}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
            </div>`:''}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px">
            <div class="stat-card" style="padding:8px">
              <div class="stat-label">Sell Price</div>
              <div style="font-weight:700;color:var(--accent)">₹${parseFloat(p.avgSellingPrice||0).toFixed(0)}</div>
            </div>
            <div class="stat-card" style="padding:8px">
              <div class="stat-label">Cost/unit</div>
              <div style="font-weight:700;color:var(--red)">₹${cost.toFixed(0)}</div>
            </div>
            <div class="stat-card" style="padding:8px">
              <div class="stat-label">Margin</div>
              <div style="font-weight:700;color:${margin>=30?'var(--green)':'var(--red)'}">${margin.toFixed(1)}%</div>
            </div>
          </div>
        </div>`;
    }).join('') || `<div class="empty-state"><div class="empty-state-icon">🏷</div><h3>No products yet</h3><p>Add your menu items to track food cost and margins</p></div>`}
    <div style="height:20px"></div>
  `;
}

function _buildIngredientRowHTML(ing, rowId) {
  return `
    <div id="${rowId}" class="ing-form-row">
      <div class="form-row" style="align-items:flex-end">
        <div class="form-group" style="flex:2">
          <label class="form-label">Item Name</label>
          <input type="text" class="ing-name" placeholder="e.g. Oregano Sachet" value="${ing.name||''}">
        </div>
        <div style="flex:0 0 auto;padding-bottom:2px">
          <button class="btn btn-sm btn-danger" onclick="removeIngredientRow('${rowId}')">✕</button>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Cost/Pc (₹)</label>
          <input type="number" class="ing-cost" placeholder="0.00" min="0" step="0.01" value="${ing.costPerPc||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Qty per unit</label>
          <input type="number" class="ing-qty" placeholder="1" min="0.01" step="0.01" value="${ing.qtyPerUnit||1}">
        </div>
        <div class="form-group">
          <label class="form-label">Unit</label>
          <input type="text" class="ing-unit" placeholder="pc" value="${ing.unit||'pc'}">
        </div>
      </div>
      <div class="flex" style="align-items:center;gap:8px;margin-top:4px">
        <input type="checkbox" class="ing-packaging" id="pkg-${rowId}" ${ing.isPackaging?'checked':''} style="width:auto">
        <label for="pkg-${rowId}" class="form-label" style="margin:0">Packaging item (cups, boxes, straws)</label>
      </div>
    </div>`;
}

function _productModalBody(p) {
  return `
    <div class="form-group">
      <label class="form-label">Product Name</label>
      <input type="text" id="prod-name" placeholder="e.g. Pizza Pops (Box of 2)" value="${p.name||''}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Category</label>
        <input type="text" id="prod-cat" placeholder="Pizza Pops" value="${p.category||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Serving Label</label>
        <input type="text" id="prod-label" placeholder="box / cup / plate" value="${p.servingLabel||'unit'}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Avg Selling Price (₹)</label>
        <input type="number" id="prod-price" placeholder="0.00" min="0" step="0.01" value="${p.avgSellingPrice||''}">
      </div>
      <div class="form-group">
        <label class="form-label">Fixed Cost / unit (₹)</label>
        <input type="number" id="prod-fixed" placeholder="0.00" min="0" step="0.01" value="${p.fixedCostPerUnit||''}">
      </div>
    </div>
    <div class="section-header" style="margin-top:8px">
      <span class="section-title">Ingredients & Packaging</span>
      <button class="btn btn-sm btn-secondary" onclick="addIngredientRow()">+ Add Item</button>
    </div>
    <div id="ingredients-list">
      <p id="no-ing-msg" class="text-muted text-sm" style="padding:8px 0;${p.ingredients?.length?'display:none':''}">No items added. Click + Add Item.</p>
    </div>`;
}

function _collectIngredients() {
  const ingredients = [];
  document.querySelectorAll('#ingredients-list .ing-form-row').forEach((row, i) => {
    const name = row.querySelector('.ing-name')?.value?.trim();
    if (!name) return;
    ingredients.push({
      id: 'ing_' + Date.now() + '_' + i,
      name,
      costPerPc:   parseFloat(row.querySelector('.ing-cost')?.value)  || 0,
      qtyPerUnit:  parseFloat(row.querySelector('.ing-qty')?.value)   || 1,
      unit:        row.querySelector('.ing-unit')?.value?.trim()      || 'pc',
      isPackaging: row.querySelector('.ing-packaging')?.checked       || false,
    });
  });
  return ingredients;
}

function addIngredientRow(data = {}) {
  _ingCounter++;
  const rowId = 'ingrow_' + _ingCounter;
  const noMsg = el('no-ing-msg');
  if (noMsg) noMsg.style.display = 'none';
  const div = document.createElement('div');
  div.innerHTML = _buildIngredientRowHTML(data, rowId);
  el('ingredients-list').appendChild(div.firstElementChild);
}

function removeIngredientRow(rowId) {
  el(rowId)?.remove();
  if (!document.querySelectorAll('#ingredients-list .ing-form-row').length) {
    const msg = el('no-ing-msg');
    if (msg) msg.style.display = '';
  }
}

function showAddProduct() {
  _ingCounter = 0;
  showModal('Add Product', _productModalBody({}), `<button class="btn btn-primary" onclick="saveNewProduct()">Save Product</button>`);
}

function saveNewProduct() {
  const name = el('prod-name')?.value?.trim();
  if (!name) { toast('Enter a product name', 'error'); return; }
  const prods = getProducts();
  prods.push({
    id: 'p' + Date.now(),
    name,
    category:        el('prod-cat')?.value?.trim()  || '',
    servingLabel:    el('prod-label')?.value?.trim() || 'unit',
    avgSellingPrice: parseFloat(el('prod-price')?.value) || 0,
    fixedCostPerUnit:parseFloat(el('prod-fixed')?.value) || 0,
    active: true,
    ingredients: _collectIngredients(),
  });
  saveProducts(prods);
  closeModal();
  toast('Product added!', 'success');
  navigate('products');
}

function showEditProduct(id) {
  const p = getProducts().find(x => x.id === id);
  if (!p) return;
  _ingCounter = 0;
  showModal('Edit Product', _productModalBody(p), `
    <button class="btn btn-danger" onclick="deleteProduct('${id}')">Delete</button>
    <button class="btn btn-primary" onclick="saveProductEdit('${id}')">Save Changes</button>
  `);
  (p.ingredients || []).forEach(ing => addIngredientRow(ing));
}

function saveProductEdit(id) {
  const name = el('prod-name')?.value?.trim();
  if (!name) { toast('Enter a product name', 'error'); return; }
  const prods = getProducts().map(p => p.id !== id ? p : {
    ...p,
    name,
    category:        el('prod-cat')?.value?.trim()   || '',
    servingLabel:    el('prod-label')?.value?.trim()  || 'unit',
    avgSellingPrice: parseFloat(el('prod-price')?.value)  || 0,
    fixedCostPerUnit:parseFloat(el('prod-fixed')?.value) || 0,
    ingredients: _collectIngredients(),
  });
  saveProducts(prods);
  closeModal();
  toast('Product updated!', 'success');
  navigate('products');
}

function deleteProduct(id) {
  if (!confirm('Delete this product? Daily logs will be kept.')) return;
  saveProducts(getProducts().filter(p => p.id !== id));
  closeModal();
  toast('Product deleted', 'success');
  navigate('products');
}

// ─── BOOT ────────────────────────────────────────────────
async function runManualBackup() {
  const btn = document.querySelector('[onclick="runManualBackup()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Backing up…'; }
  const ok = await backupAll(false);
  if (ok) {
    const label = document.getElementById('last-backup-label');
    if (label) label.textContent = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Backup All Data Now'; }
}

function boot() {
  // Check first run
  if (!ls('setup_done')) {
    showFirstRun();
    return;
  }

  // Check existing session
  if (loadSession()) {
    showApp();
    return;
  }

  // Show login
  el('login-screen').classList.remove('hidden');

  // PIN pad
  let pin = '';
  const updateDots = () => {
    document.querySelectorAll('.pin-dots span').forEach((dot, i) => {
      dot.classList.toggle('filled', i < pin.length);
    });
  };
  const showError = (msg) => {
    const err = el('login-error');
    err.textContent = msg;
    err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 2500);
    pin = '';
    updateDots();
  };
  const tryLogin = () => {
    if (pin.length < 4) { showError('PIN must be exactly 4 digits'); return; }
    const user = authenticate(pin);
    if (user) {
      startSession(user);
      el('login-screen').classList.add('hidden');
      showApp();
    } else {
      showError('Invalid PIN — try again');
    }
  };

  document.querySelectorAll('.pin-btn[data-digit]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (pin.length >= 4) return;
      pin += btn.dataset.digit;
      updateDots();
      if (pin.length === 4) tryLogin();
    });
  });
  el('pin-clear').addEventListener('click', () => { pin = pin.slice(0,-1); updateDots(); });
  el('pin-enter').addEventListener('click', tryLogin);
  document.addEventListener('keydown', (e) => {
    if (el('login-screen').classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') { if (pin.length < 4) { pin+=e.key; updateDots(); if(pin.length===4) tryLogin(); } }
    else if (e.key === 'Backspace') { pin=pin.slice(0,-1); updateDots(); }
    else if (e.key === 'Enter') tryLogin();
  });
}

function showApp() {
  el('login-screen').classList.add('hidden');
  el('app-shell').classList.remove('hidden');

  // Set user info
  el('user-badge').textContent = STATE.user.name;

  // Show/hide owner-only nav items
  if (isOwner()) {
    document.querySelectorAll('.owner-only').forEach(el => el.classList.add('visible'));
  }

  // Wire navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.page === 'more-menu') {
        el('more-overlay').classList.remove('hidden');
      } else {
        navigate(btn.dataset.page);
      }
    });
  });

  document.querySelectorAll('.more-item').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  el('close-more').addEventListener('click', () => el('more-overlay').classList.add('hidden'));
  el('more-overlay').addEventListener('click', (e) => { if (e.target === el('more-overlay')) el('more-overlay').classList.add('hidden'); });

  el('logout-btn').addEventListener('click', () => {
    if (confirm('Log out?')) logout();
  });

  el('modal-close').addEventListener('click', closeModal);
  el('modal-overlay').addEventListener('click', (e) => { if (e.target === el('modal-overlay')) closeModal(); });

  // Sync any offline data
  syncOfflineQueue();

  // Auto-backup all data once per day
  autoBackupIfNeeded();

  // Load dashboard
  navigate('dashboard');
}

// ─── START ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);

// Make functions global for inline handlers
window.navigate = navigate;
window.addSalesRow = addSalesRow;
window.updateSalesTotals = updateSalesTotals;
window.submitSales = submitSales;
window.switchSalesTab = switchSalesTab;
window.calcRecon = calcRecon;
window.submitRecon = submitRecon;
window.switchStaffTab = switchStaffTab;
window.clockIn = clockIn;
window.clockOut = clockOut;
window.saveStaffNote = saveStaffNote;
window.editAttendanceEntry = editAttendanceEntry;
window.saveAttendanceEdit = saveAttendanceEdit;
window.deleteAttendanceEntry = deleteAttendanceEntry;
window.switchExpTab = switchExpTab;
window.addExpense = addExpense;
window.filterInventory = filterInventory;
window.showUpdateStock = showUpdateStock;
window.updateStock = updateStock;
window.addInventoryItem = addInventoryItem;
window.saveNewInventoryItem = saveNewInventoryItem;
window.showSOPCategory = showSOPCategory;
window.viewSOP = viewSOP;
window.toggleCheck = toggleCheck;
window.addSOP = addSOP;
window.saveSOP = saveSOP;
window.editSOP = editSOP;
window.updateSOP = updateSOP;
window.deleteSOP = deleteSOP;
window.showAddStaff = showAddStaff;
window.saveNewStaff = saveNewStaff;
window.editStaff = editStaff;
window.updateStaff = updateStaff;
window.toggleStaff = toggleStaff;
window.deleteStaff = deleteStaff;
window.showChangePin = showChangePin;
window.changePin = changePin;
window.saveScriptUrl = saveScriptUrl;
window.syncNow = syncNow;
window.exportData = exportData;
window.clearTodayData = clearTodayData;
window.closeModal = closeModal;
window.loadSalesForDate = loadSalesForDate;
window.completeSetup = completeSetup;
window.manage = manage;
window.switchManageTab = switchManageTab;
window.filterManageInventory = filterManageInventory;
window.editInventoryItem = editInventoryItem;
window.saveInventoryEdit = saveInventoryEdit;
window.deleteInventoryItem = deleteInventoryItem;
window.filterManageExpenses = filterManageExpenses;
window.deleteExpense = deleteExpense;
window.renderManageSOPs = renderManageSOPs;
window.tasks = tasks;
window.switchTaskTab = switchTaskTab;
window.toggleTask = toggleTask;
window.undoTask = undoTask;
window.addTaskTemplate = addTaskTemplate;
window.saveTaskTemplate = saveTaskTemplate;
window.editTaskTemplate = editTaskTemplate;
window.updateTaskTemplate = updateTaskTemplate;
window.deleteTaskTemplate = deleteTaskTemplate;
window.vendors = vendors;
window.searchVendors = searchVendors;
window.addVendor = addVendor;
window.saveNewVendor = saveNewVendor;
window.editVendor = editVendor;
window.updateVendor = updateVendor;
window.deleteVendor = deleteVendor;
window.searchInventory = searchInventory;
window.wireInvCostCalc = wireInvCostCalc;
window.switchPnlPeriod = switchPnlPeriod;
window.switchProductTab = switchProductTab;
window.updateProductEntryCalc = updateProductEntryCalc;
window.reloadDailyProductEntry = reloadDailyProductEntry;
window.saveProductEntry = saveProductEntry;
window.switchCostSheetProduct = switchCostSheetProduct;
window.showAddProduct = showAddProduct;
window.saveNewProduct = saveNewProduct;
window.showEditProduct = showEditProduct;
window.saveProductEdit = saveProductEdit;
window.deleteProduct = deleteProduct;
window.addIngredientRow = addIngredientRow;
window.removeIngredientRow = removeIngredientRow;
window.backupAll = backupAll;
window.restoreFromBackup = restoreFromBackup;
window.runManualBackup = runManualBackup;
