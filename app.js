/* State and utilities */
const STATE = {
  slots: [],        // {id, type, occupied, vehicle:{number, owner, type}, entryTime}
  history: [],      // {vehicleNumber, owner, type, slotId, entryTime, exitTime, durationMs, fee}
  config: {
    totalSlots: 48, // tweak capacity
    typesByRow: ['car','bike','truck'], // for color-coding layout variety
    fee: { baseMinutes: 30, basePrice: 20, hourlyAfter: 50 },
  },
  theme: 'dark',
  timers: {},       // slotId -> interval
};

const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));
const fmtTime = ts => new Date(ts).toLocaleString();
const pad2 = n => n.toString().padStart(2,'0');
const fmtDuration = ms => {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000);
  const m = Math.floor((t % 3600000) / 60000);
  const s = Math.floor((t % 60000) / 1000);
  return `${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
};
/* Fee: First 30 min = ₹20. After 30 min = ₹50/hour, rounded up */
const computeFee = ms => {
  const { baseMinutes, basePrice, hourlyAfter } = STATE.config.fee;
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= baseMinutes) return basePrice;
  const extraMinutes = minutes - baseMinutes;
  const extraHoursRoundedUp = Math.ceil(extraMinutes / 60);
  return basePrice + extraHoursRoundedUp * hourlyAfter;
};

/* Persistence */
const load = () => {
  try {
    const data = JSON.parse(localStorage.getItem('parkingData') || '{}');
    if (data.slots && data.history) {
      Object.assign(STATE, data, { timers: {} }); // clear timers on load
    }
  } catch {}
};
const save = () => {
  const { timers, ...persist } = STATE;
  localStorage.setItem('parkingData', JSON.stringify(persist));
};

/* Init slots */
const initSlots = () => {
  if (STATE.slots.length) return;
  for (let i = 1; i <= STATE.config.totalSlots; i++) {
    const type = STATE.config.typesByRow[i % STATE.config.typesByRow.length];
    STATE.slots.push({ id: i, type, occupied: false, vehicle: null, entryTime: null });
  }
};

const nearestEmptySlot = (type) => {
  // Choose nearest empty slot of same type; if none, any empty
  const sameType = STATE.slots.filter(s => !s.occupied && s.type === type);
  const anyType = STATE.slots.filter(s => !s.occupied);
  const pool = sameType.length ? sameType : anyType;
  if (!pool.length) return null;
  return pool.sort((a,b) => a.id - b.id)[0]; // nearest = lowest id
};

/* Router */
const routes = {
  '/': renderHome,
  '/dashboard': renderDashboard,
  '/entry': renderEntryForm,
  '/history': renderHistory,
  '/analytics': renderAnalytics,
  '/contact': renderContact,
};

const setPageTitle = title => { qs('.page-title').textContent = title; };
const navigate = (path) => {
  setActiveNav(path);
  setPageTitle(pageTitleFor(path));
  routes[path]?.();
};
const pageTitleFor = (path) => ({
  '/': 'Home',
  '/dashboard': 'Parking Slot Dashboard',
  '/entry': 'Vehicle Entry',
  '/history': 'Parking History',
  '/analytics': 'Analytics',
  '/contact': 'Contact & Support',
}[path] || 'Parking');

const setActiveNav = (path) => {
  qsa('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('data-route') === path));
};

/* Toasts */
const toast = (msg, type='success') => {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  qs('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4000);
};

/* Loading and theme */
window.addEventListener('load', () => {
  // Simulate short loader
  setTimeout(() => qs('#loader').style.display = 'none', 600);
});

/* Theme toggle (dark only styling; optional light variant) */
qs('#themeToggle').addEventListener('click', () => {
  if (STATE.theme === 'dark') {
    document.documentElement.style.setProperty('--bg', '#f7f8fb');
    document.documentElement.style.setProperty('--text', '#1b2330');
    document.documentElement.style.setProperty('--muted', '#5b6472');
    document.body.style.background = 'linear-gradient(180deg, #ffffff, #e9eef5)';
    STATE.theme = 'light';
    qs('#themeToggle').innerHTML = '<i class="fa-solid fa-sun"></i>';
  } else {
    // Reset to dark defaults by reloading CSS custom properties via style removal
    document.location.reload();
  }
});

/* Reset data */
qs('#resetDataBtn').addEventListener('click', () => {
  showConfirm('Reset all data?', 'This will clear slots and history. This action cannot be undone.', () => {
    localStorage.removeItem('parkingData');
    STATE.slots = [];
    STATE.history = [];
    initSlots();
    navigate(currentPath());
    toast('Data reset', 'success');
  });
});

const currentPath = () => (location.hash.replace('#','') || '/');
window.addEventListener('hashchange', () => navigate(currentPath()));

/* Render helpers */
const view = () => qs('#view');
const clearView = () => view().innerHTML = '';

/* Home */
function renderHome() {
  clearView();
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="hero">
      <div class="hero-card glass">
        <h1>Smart Parking Allotment</h1>
        <p>Clean, modern dashboard to manage parking slots in real time. Auto-assign nearest empty slot, track durations, generate invoices, and visualize analytics—all in a smooth dark neon UI.</p>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <a href="#/entry" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Add vehicle</a>
          <a href="#/dashboard" class="btn btn-outline"><i class="fa-solid fa-gauge"></i> View dashboard</a>
        </div>
      </div>
      <div class="glass hero-card">
        <div class="slot-type badge"><i class="fa-solid fa-car-side" style="color:var(--car)"></i> Car slots</div>
        <div class="slot-type badge"><i class="fa-solid fa-motorcycle" style="color:var(--bike)"></i> Bike slots</div>
        <div class="slot-type badge"><i class="fa-solid fa-truck" style="color:var(--truck)"></i> Truck slots</div>
        <p style="margin-top:12px;">Glassmorphism cards, smooth animations, mobile-ready layout, and neon accents.</p>
      </div>
    </div>
  `;
  view().appendChild(el);
}

/* Dashboard */
function renderDashboard() {
  clearView();
  const grid = document.createElement('div');
  grid.className = 'slot-grid';

  STATE.slots.forEach(slot => {
    const card = document.createElement('div');
    card.className = `glass slot ${slot.occupied ? slot.vehicle.type : 'empty'} ${slot.occupied ? '' : 'empty'}`;

    const typeIcon = slot.occupied ? iconFor(slot.vehicle.type) : 'fa-solid fa-square-parking';
    const typeColor = colorFor(slot.occupied ? slot.vehicle.type : null);

    card.innerHTML = `
      <div class="slot-header">
        <div class="badge"><i class="fa-solid fa-hashtag"></i> Slot ${slot.id}</div>
        <div class="slot-type" style="color:${typeColor}">
          <i class="${typeIcon}"></i>
          <span>${slot.occupied ? cap(slot.vehicle.type) : 'Empty'}</span>
        </div>
      </div>
      <div class="info-row"><div class="label">Vehicle</div><div>${slot.occupied ? slot.vehicle.number : '-'}</div></div>
      <div class="info-row"><div class="label">Owner</div><div>${slot.occupied ? slot.vehicle.owner : '-'}</div></div>
      <div class="info-row"><div class="label">Parked</div><div id="time-${slot.id}">${slot.occupied ? fmtParked(slot.entryTime) : '—'}</div></div>
      <div class="slot-actions">
        <button class="btn btn-details" ${slot.occupied ? '' : 'disabled'} data-action="details" data-id="${slot.id}"><i class="fa-solid fa-eye"></i> Details</button>
        <button class="btn btn-remove" ${slot.occupied ? '' : 'disabled'} data-action="remove" data-id="${slot.id}"><i class="fa-solid fa-trash"></i> Remove</button>
      </div>
    `;
    grid.appendChild(card);

    // auto-update timers
    if (slot.occupied) {
      if (STATE.timers[slot.id]) clearInterval(STATE.timers[slot.id]);
      STATE.timers[slot.id] = setInterval(() => {
        const t = qs(`#time-${slot.id}`);
        if (t) t.textContent = fmtParked(slot.entryTime);
      }, 1000);
    }
  });

  view().appendChild(grid);

  // Actions
  qsa('.btn[data-action="details"]').forEach(btn => btn.addEventListener('click', e => {
    const id = parseInt(e.currentTarget.dataset.id);
    const s = STATE.slots.find(x => x.id === id);
    showModal('Slot details', `
      <div class="info-row"><div class="label">Slot</div><div>${s.id}</div></div>
      <div class="info-row"><div class="label">Type</div><div>${cap(s.type)}</div></div>
      <div class="info-row"><div class="label">Vehicle</div><div>${s.vehicle?.number || '-'}</div></div>
      <div class="info-row"><div class="label">Owner</div><div>${s.vehicle?.owner || '-'}</div></div>
      <div class="info-row"><div class="label">Entry</div><div>${s.entryTime ? fmtTime(s.entryTime) : '-'}</div></div>
    `, [{label:'Close', class:'btn-outline', role:'cancel'}]);
  }));

  qsa('.btn[data-action="remove"]').forEach(btn => btn.addEventListener('click', e => {
    const id = parseInt(e.currentTarget.dataset.id);
    removeVehicleFlow(id);
  }));
}

/* Entry form */
function renderEntryForm() {
  clearView();
  const el = document.createElement('div');
  el.className = 'glass';
  el.style.padding = '16px';
  el.innerHTML = `
    <h3 style="margin-top:0;">Vehicle entry</h3>
    <form id="entryForm" class="form">
      <div class="form-row">
        <label>Vehicle number</label>
        <input type="text" id="vehNumber" class="input" placeholder="TN 38 AB 1234" />
        <div class="error" id="vehNumberErr"></div>
      </div>
      <div class="form-row">
        <label>Owner name</label>
        <input type="text" id="ownerName" class="input" placeholder="Priya" />
        <div class="error" id="ownerErr"></div>
      </div>
      <div class="form-row">
        <label>Vehicle type</label>
        <select id="vehType">
          <option value="">Select type</option>
          <option value="car">Car</option>
          <option value="bike">Bike</option>
          <option value="truck">Truck</option>
        </select>
        <div class="error" id="typeErr"></div>
      </div>
      <div style="display:flex; gap:8px;">
        <button type="submit" class="btn btn-primary"><i class="fa-solid fa-square-parking"></i> Park vehicle</button>
        <a href="#/dashboard" class="btn btn-outline"><i class="fa-solid fa-gauge"></i> Go to dashboard</a>
      </div>
    </form>
  `;
  view().appendChild(el);

  qs('#entryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const number = qs('#vehNumber').value.trim().toUpperCase();
    const owner = capWords(qs('#ownerName').value.trim());
    const type = qs('#vehType').value;

    // Validation
    let valid = true;
    clearErrors();
    if (!/^[A-Z]{2}\s?\d{2}\s?[A-Z]{1,2}\s?\d{3,4}$/.test(number)) {
      showErr('#vehNumberErr', 'Enter a valid vehicle number (e.g., TN 38 AB 1234)');
      markInvalid('#vehNumber'); valid = false;
    }
    if (!owner || owner.length < 2) {
      showErr('#ownerErr', 'Enter owner name'); markInvalid('#ownerName'); valid = false;
    }
    if (!['car','bike','truck'].includes(type)) {
      showErr('#typeErr', 'Select vehicle type'); markInvalid('#vehType'); valid = false;
    }

    if (!valid) return;

    const slot = nearestEmptySlot(type);
    if (!slot) { toast('No empty slot available', 'error'); return; }

    slot.occupied = true;
    slot.vehicle = { number, owner, type };
    slot.entryTime = Date.now();

    save();

    showModal('Vehicle parked', `
      <p><strong>Slot:</strong> ${slot.id}</p>
      <p><strong>Vehicle:</strong> ${number}</p>
      <p><strong>Owner:</strong> ${owner}</p>
      <p><strong>Type:</strong> ${cap(type)}</p>
      <p><strong>Entry time:</strong> ${fmtTime(slot.entryTime)}</p>
    `, [
      {label:'OK', class:'btn-primary', role:'confirm', onClick: () => { location.hash = '#/dashboard'; }}
    ]);

    toast(`Assigned slot ${slot.id} to ${number}`, 'success');
  });

  function clearErrors() {
    ['#vehNumber','#ownerName','#vehType'].forEach(id => qs(id).classList.remove('invalid'));
    ['#vehNumberErr','#ownerErr','#typeErr'].forEach(id => qs(id).textContent = '');
  }
  function showErr(id, msg){ qs(id).textContent = msg; }
  function markInvalid(id){ qs(id).classList.add('invalid'); }
}

/* Remove vehicle + invoice */
function removeVehicleFlow(slotId) {
  const s = STATE.slots.find(x => x.id === slotId);
  if (!s?.occupied) return;

  const now = Date.now();
  const duration = now - s.entryTime;
  const fee = computeFee(duration);

  showConfirm('Remove vehicle?', `
    <div class="info-row"><div class="label">Vehicle</div><div>${s.vehicle.number}</div></div>
    <div class="info-row"><div class="label">Owner</div><div>${s.vehicle.owner}</div></div>
    <div class="info-row"><div class="label">Parked</div><div>${fmtDuration(duration)}</div></div>
    <div class="info-row"><div class="label">Fee</div><div>₹${fee}</div></div>
  `, () => {
    const exitTime = now;
    STATE.history.unshift({
      vehicleNumber: s.vehicle.number,
      owner: s.vehicle.owner,
      type: s.vehicle.type,
      slotId: s.id,
      entryTime: s.entryTime,
      exitTime,
      durationMs: duration,
      fee,
    });

    // Free slot
    s.occupied = false;
    s.vehicle = null;
    s.entryTime = null;

    // Clear timer
    if (STATE.timers[slotId]) {
      clearInterval(STATE.timers[slotId]);
      delete STATE.timers[slotId];
    }

    save();
    navigate('/dashboard');
    toast(`Removed ${s.id} — Fee ₹${fee}`, 'success');
    showInvoice({
      slotId: slotId,
      vehicleNumber: STATE.history[0].vehicleNumber,
      owner: STATE.history[0].owner,
      type: STATE.history[0].type,
      entryTime: STATE.history[0].entryTime,
      exitTime: STATE.history[0].exitTime,
      duration: fmtDuration(STATE.history[0].durationMs),
      fee,
    });
  });
}

/* History page */
function renderHistory() {
  clearView();
  const el = document.createElement('div');
  el.className = 'glass';
  el.style.padding = '16px';

  const rows = STATE.history.map(h => `
    <tr>
      <td>${h.vehicleNumber}</td>
      <td>${h.owner}</td>
      <td>${cap(h.type)}</td>
      <td>${h.slotId}</td>
      <td>${fmtTime(h.entryTime)}</td>
      <td>${fmtTime(h.exitTime)}</td>
      <td>${fmtDuration(h.durationMs)}</td>
      <td>₹${h.fee}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <h3 style="margin:0;">Parking history</h3>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-outline" id="exportCsv"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
        <button class="btn btn-outline" id="exportXls"><i class="fa-solid fa-file-excel"></i> Export Excel</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Vehicle number</th>
            <th>Owner</th>
            <th>Vehicle type</th>
            <th>Slot number</th>
            <th>Entry time</th>
            <th>Exit time</th>
            <th>Total duration</th>
            <th>Fee collected</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" style="text-align:center; color:var(--muted);">No history yet</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
  view().appendChild(el);

  qs('#exportCsv').addEventListener('click', () => exportCSV());
  qs('#exportXls').addEventListener('click', () => exportExcel());
}

/* Analytics page */
function renderAnalytics() {
  clearView();

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);

  const vehiclesToday = STATE.history.filter(h => h.exitTime >= todayStart.getTime() && h.exitTime <= todayEnd.getTime()).length;
  const totalRevenue = STATE.history.reduce((sum,h) => sum + h.fee, 0);
  const avgDuration = STATE.history.length ? Math.floor(STATE.history.reduce((sum,h)=>sum+h.durationMs,0) / STATE.history.length) : 0;
  const currentlyParked = STATE.slots.filter(s => s.occupied).length;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="kpis">
      <div class="glass kpi"><div class="label">Total vehicles today</div><div class="value">${vehiclesToday}</div></div>
      <div class="glass kpi"><div class="label">Total revenue</div><div class="value">₹${totalRevenue}</div></div>
      <div class="glass kpi"><div class="label">Average duration</div><div class="value">${fmtDuration(avgDuration)}</div></div>
      <div class="glass kpi"><div class="label">Currently parked</div><div class="value">${currentlyParked}</div></div>
    </div>
    <div class="charts">
      <canvas class="glass chart" id="barChart" height="220"></canvas>
      <canvas class="glass chart" id="pieChart" height="220"></canvas>
      <canvas class="glass chart" id="lineChart" height="220"></canvas>
    </div>
  `;
  view().appendChild(wrap);

  // Simple canvas charts (vanilla)
  drawBarChart('barChart', typeCounts());
  drawPieChart('pieChart', typeCounts());
  drawLineChart('lineChart', revenueByDay(7));
}

/* Contact page */
function renderContact() {
  clearView();
  const el = document.createElement('div');
  el.className = 'glass';
  el.style.padding = '16px';
  el.innerHTML = `
    <h3 style="margin-top:0;">Contact & Support</h3>
    <p>Questions, feedback, or feature requests? Share your thoughts.</p>
    <form id="contactForm" class="form">
      <div class="form-row">
        <label>Your name</label>
        <input type="text" id="cName" class="input" placeholder="Priya" />
        <div class="error" id="cNameErr"></div>
      </div>
      <div class="form-row">
        <label>Email</label>
        <input type="email" id="cEmail" class="input" placeholder="you@example.com" />
        <div class="error" id="cEmailErr"></div>
      </div>
      <div class="form-row">
        <label>Message</label>
        <textarea id="cMsg" class="input" rows="5" placeholder="Describe your issue or idea"></textarea>
        <div class="error" id="cMsgErr"></div>
      </div>
      <button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Send</button>
    </form>
  `;
  view().appendChild(el);

  qs('#contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = qs('#cName').value.trim();
    const email = qs('#cEmail').value.trim();
    const msg = qs('#cMsg').value.trim();
    let ok = true;

    ['#cName','#cEmail','#cMsg'].forEach(id => qs(id).classList.remove('invalid'));
    ['#cNameErr','#cEmailErr','#cMsgErr'].forEach(id => qs(id).textContent = '');

    if (name.length < 2) { qs('#cNameErr').textContent='Enter a valid name'; qs('#cName').classList.add('invalid'); ok=false; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { qs('#cEmailErr').textContent='Enter a valid email'; qs('#cEmail').classList.add('invalid'); ok=false; }
    if (msg.length < 10) { qs('#cMsgErr').textContent='Please provide more details'; qs('#cMsg').classList.add('invalid'); ok=false; }

    if (!ok) return;
    toast('Message sent. We’ll get back to you soon.', 'success');
  });
}

/* Helpers */
function fmtParked(entry) {
  return fmtDuration(Date.now() - entry);
}
function iconFor(type){
  if (type === 'car') return 'fa-solid fa-car-side';
  if (type === 'bike') return 'fa-solid fa-motorcycle';
  if (type === 'truck') return 'fa-solid fa-truck';
  return 'fa-solid fa-square-parking';
}
function colorFor(type){
  if (type === 'car') return 'var(--car)';
  if (type === 'bike') return 'var(--bike)';
  if (type === 'truck') return 'var(--truck)';
  return 'var(--muted)';
}
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const capWords = s => s.replace(/\b\w/g, c => c.toUpperCase());

/* Modal */
function showModal(title, bodyHtml, actions = []) {
  const modal = qs('#modal');
  qs('#modalTitle').textContent = title;
  qs('#modalBody').innerHTML = bodyHtml;
  const footer = qs('#modalFooter');
  footer.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = `btn ${a.class || 'btn-primary'}`;
    b.textContent = a.label || 'OK';
    b.addEventListener('click', () => {
      if (a.onClick) a.onClick();
      hideModal();
    });
    if (a.role === 'cancel') b.addEventListener('click', hideModal);
    footer.appendChild(b);
  });
  if (!actions.length) {
    const ok = document.createElement('button');
    ok.className = 'btn btn-primary'; ok.textContent = 'OK';
    ok.addEventListener('click', hideModal);
    footer.appendChild(ok);
  }
  modal.classList.remove('hidden');
  qs('#modalClose').onclick = hideModal;
  qs('#modalCancel').onclick = hideModal;
  qs('#modalConfirm').onclick = hideModal;
}
function hideModal(){ qs('#modal').classList.add('hidden'); }
function showConfirm(title, bodyHtml, onConfirm){
  showModal(title, bodyHtml, [
    {label:'Cancel', class:'btn-outline', role:'cancel'},
    {label:'Confirm', class:'btn-primary', role:'confirm', onClick:onConfirm}
  ]);
}

/* Invoice */
function showInvoice(data){
  const modal = qs('#invoice');
  qs('#invoiceBody').innerHTML = `
    <div class="info-row"><div class="label">Slot</div><div>${data.slotId}</div></div>
    <div class="info-row"><div class="label">Vehicle</div><div>${data.vehicleNumber}</div></div>
    <div class="info-row"><div class="label">Owner</div><div>${data.owner}</div></div>
    <div class="info-row"><div class="label">Type</div><div>${cap(data.type)}</div></div>
    <div class="info-row"><div class="label">Entry</div><div>${fmtTime(data.entryTime)}</div></div>
    <div class="info-row"><div class="label">Exit</div><div>${fmtTime(data.exitTime)}</div></div>
    <div class="info-row"><div class="label">Duration</div><div>${data.duration}</div></div>
    <div class="info-row"><div class="label">Total fee</div><div>₹${data.fee}</div></div>
  `;
  modal.classList.remove('hidden');

  qs('#invoiceClose').onclick = () => modal.classList.add('hidden');
  qs('#invoiceOk').onclick = () => modal.classList.add('hidden');
  qs('#invoiceDownload').onclick = () => downloadInvoicePdfLike(data);
}

function downloadInvoicePdfLike(data){
  const text = `
INVOICE
Slot: ${data.slotId}
Vehicle: ${data.vehicleNumber}
Owner: ${data.owner}
Type: ${cap(data.type)}
Entry: ${fmtTime(data.entryTime)}
Exit: ${fmtTime(data.exitTime)}
Duration: ${data.duration}
Total Fee: ₹${data.fee}
  `.trim();
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `invoice_${data.vehicleNumber}_${Date.now()}.txt`;
  a.click();
}

/* Export */
function exportCSV(){
  const rows = [
    ['Vehicle number','Owner','Vehicle type','Slot number','Entry time','Exit time','Total duration','Fee collected'],
    ...STATE.history.map(h => [
      h.vehicleNumber, h.owner, cap(h.type), h.slotId, fmtTime(h.entryTime), fmtTime(h.exitTime), fmtDuration(h.durationMs), h.fee
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `parking_history_${Date.now()}.csv`;
  a.click();
}
function exportExcel(){
  // Simple CSV with .xls extension for quick spreadsheet open
  const rows = [
    ['Vehicle number','Owner','Vehicle type','Slot number','Entry time','Exit time','Total duration','Fee collected'],
    ...STATE.history.map(h => [
      h.vehicleNumber, h.owner, cap(h.type), h.slotId, fmtTime(h.entryTime), fmtTime(h.exitTime), fmtDuration(h.durationMs), h.fee
    ])
  ];
  const tsv = rows.map(r => r.join('\t')).join('\n');
  const blob = new Blob([tsv], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `parking_history_${Date.now()}.xls`;
  a.click();
}

/* Analytics helpers */
function typeCounts(){
  const counts = { car:0, bike:0, truck:0 };
  STATE.history.forEach(h => counts[h.type]++);
  STATE.slots.filter(s=>s.occupied).forEach(s => counts[s.vehicle.type]++);
  return counts;
}
function revenueByDay(days) {
  const map = [];
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    const start = d.getTime();
    const end = start + 86400000 - 1;
    const revenue = STATE.history.filter(h => h.exitTime >= start && h.exitTime <= end).reduce((sum,h)=>sum+h.fee,0);
    map.push({ label: `${d.getMonth()+1}/${d.getDate()}`, value: revenue });
  }
  return map;
}

/* Canvas charts */
function drawBarChart(id, counts) {
  const ctx = qs(`#${id}`).getContext('2d');
  const labels = ['Car','Bike','Truck'];
  const values = [counts.car, counts.bike, counts.truck];
  const colors = ['#ff3b3b','#ff8c1a','#b26bff'];
  basicBars(ctx, labels, values, colors);
}
function drawPieChart(id, counts) {
  const ctx = qs(`#${id}`).getContext('2d');
  const values = [counts.car, counts.bike, counts.truck];
  const colors = ['#ff3b3b','#ff8c1a','#b26bff'];
  basicPie(ctx, values, colors);
}
function drawLineChart(id, series) {
  const ctx = qs(`#${id}`).getContext('2d');
  const labels = series.map(s=>s.label);
  const values = series.map(s=>s.value);
  basicLine(ctx, labels, values, '#00e5ff');
}
function basicBars(ctx, labels, values, colors){
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0,0,w,h);
  const max = Math.max(1, ...values);
  const barW = (w - 40) / values.length;
  labels.forEach((lab,i) => {
    const x = 20 + i*barW;
    const vh = (h - 40) * (values[i]/max);
    ctx.fillStyle = colors[i];
    ctx.shadowColor = colors[i];
    ctx.shadowBlur = 12;
    ctx.fillRect(x, h-20-vh, barW-20, vh);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#a3afc2';
    ctx.fillText(lab, x, h-6);
  });
}
function basicPie(ctx, values, colors){
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0,0,w,h);
  const total = values.reduce((a,b)=>a+b,0) || 1;
  let start = -Math.PI/2;
  const cx = w/2, cy = h/2, r = Math.min(w,h)/2 - 20;
  values.forEach((v,i) => {
    const ang = (v/total) * Math.PI*2;
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.arc(cx,cy,r,start,start+ang);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.shadowColor = colors[i];
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
    start += ang;
  });
}
function basicLine(ctx, labels, values, color){
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0,0,w,h);
  const max = Math.max(1, ...values);
  const stepX = (w - 40) / (labels.length - 1 || 1);
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.shadowColor = color; ctx.shadowBlur = 8;
  ctx.beginPath();
  labels.forEach((lab,i) => {
    const x = 20 + i*stepX;
    const y = h - 20 - (h-40) * (values[i]/max);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#a3afc2';
  labels.forEach((lab,i) => {
    const x = 20 + i*stepX;
    ctx.fillText(lab, x-10, h-6);
  });
}

/* Boot */
(function boot(){
  load();
  initSlots();
  // default route
  if (!location.hash) location.hash = '#/';
  navigate(currentPath());
})();