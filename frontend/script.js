/* ============================================================
   SANCHAAR — shared behavior
   ============================================================ */

/* Known stops on the Sanchaar network. In a real deployment this would
   come from a live stops/geocoding API instead of a static list. */
 const API_BASE = 'https://sanchaar.onrender.com';
const SANCHAAR_STOPS = [
  { name: 'University Gate',    tag: 'Campus stop · high demand' },
  { name: 'Railway Station',    tag: 'Transit hub' },
  { name: 'Central Market',     tag: 'Market area · often crowded' },
  { name: 'City Hospital',      tag: 'Hospital' },
  { name: 'Old Square',         tag: 'Landmark' },
  { name: 'Tech Park',          tag: 'IT / office hub' },
  { name: 'Civil Lines',        tag: 'Residential' },
  { name: 'Bus Depot',          tag: 'Depot · route origin' },
  { name: 'Airport Road',       tag: 'Airport connector' },
  { name: 'Sanchaar Chowk',     tag: 'City centre' },
  { name: 'Lakeview Colony',    tag: 'Residential' },
  { name: 'Government College', tag: 'Campus stop' },
];

const STOP_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-4.4 7-11V5l-7-3-7 3v6c0 6.6 7 11 7 11Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const BUS_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 16V9a2 2 0 0 1 2-2h9l5 5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const CHECK_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const WARN_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';

function rankStops(query) {
  if (!query.trim()) {
    // No input yet: surface popular / high-demand stops as a smart default,
    // the way a generative recommendation would suggest likely picks.
    return { label: 'Suggested for you', items: SANCHAAR_STOPS.filter(s => /high demand|hub|centre/.test(s.tag)).slice(0, 4) };
  }
  const q = query.toLowerCase();
  const scored = SANCHAAR_STOPS
    .map(stop => {
      const idx = stop.name.toLowerCase().indexOf(q);
      if (idx === -1) return null;
      // earlier match position + shorter name = more relevant
      const score = idx * 10 + stop.name.length * 0.1;
      return { ...stop, idx, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);
  return { label: scored.length ? 'Matching stops' : null, items: scored };
}

function highlightMatch(name, query) {
  if (!query.trim()) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return name.slice(0, idx) + '<mark>' + name.slice(idx, idx + query.length) + '</mark>' + name.slice(idx + query.length);
}

function setupStopAutocomplete(inputId, listId) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;
  let activeIndex = -1;

  function renderList(query) {
    const { label, items } = rankStops(query);
    list.innerHTML = '';

    if (!items.length) {
      list.classList.remove('open');
      return;
    }

    if (label) {
      const lbl = document.createElement('div');
      lbl.className = 'suggest-section-label';
      lbl.textContent = label;
      list.appendChild(lbl);
    }

    items.forEach(stop => {
      const item = document.createElement('div');
      item.className = 'suggest-item';
      item.setAttribute('role', 'option');
      item.innerHTML =
        '<span class="ic">' + STOP_ICON + '</span>' +
        '<span class="meta"><span>' + highlightMatch(stop.name, query) + '</span><small>' + stop.tag + '</small></span>';
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = stop.name;
        list.classList.remove('open');
      });
      list.appendChild(item);
    });

    list.classList.add('open');
    activeIndex = -1;
  }

  function setActive(items) {
    items.forEach(it => it.classList.remove('active'));
    if (items[activeIndex]) {
      items[activeIndex].classList.add('active');
      items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('focus', () => renderList(input.value));
  input.addEventListener('input', () => renderList(input.value));
  input.addEventListener('blur', () => setTimeout(() => list.classList.remove('open'), 130));

  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('.suggest-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      setActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      setActive(items);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        items[activeIndex].dispatchEvent(new Event('mousedown'));
      }
    } else if (e.key === 'Escape') {
      list.classList.remove('open');
    }
  });
}

/* ============================================================
   Per-route bus generation
   Tries the backend first: GET /api/buses?from=..&to=..
   Falls back to a deterministic generator seeded from the From/To
   pair, so the same route always shows the same buses, and
   different routes always look different — no server required.
   ============================================================ */

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function busLevel(pct) {
  if (pct >= 90) return 'high';
  if (pct >= 50) return 'mod';
  return 'low';
}
function levelColorVar(level) {
  return level === 'high' ? 'var(--red-500)' : level === 'mod' ? 'var(--amber-500)' : 'var(--green-500)';
}
function levelBg(level) {
  return level === 'high' ? 'rgba(255,71,87,.15)' : level === 'mod' ? 'rgba(255,165,61,.15)' : 'rgba(46,204,113,.15)';
}
function levelLabel(level) {
  return level === 'high' ? 'High occupancy' : level === 'mod' ? 'Moderate occupancy' : 'Seats available';
}

function generateBuses(from, to) {
  const key = (from || '').trim().toLowerCase() + '|' + (to || '').trim().toLowerCase();
  const rand = mulberry32(hashString(key || 'default-route'));

  const count = 3 + Math.floor(rand() * 2); // 3–4 buses per route
  const usedNumbers = new Set();
  const buses = [];

  for (let i = 0; i < count; i++) {
    let num;
    do { num = 1 + Math.floor(rand() * 97); } while (usedNumbers.has(num));
    usedNumbers.add(num);

    buses.push({
      id: 'B' + String(num).padStart(2, '0'),
      eta: 2 + Math.floor(rand() * 28),   // 2–30 min
      occ: 5 + Math.floor(rand() * 95)    // 5–99 %
    });
  }

  buses.sort((a, b) => a.eta - b.eta);
  return buses;
}

/* Deterministically pick `count` distinct intermediate stop names for a
   given bus + route, so each bus's route page shows a plausible, stable
   set of stops rather than the same hardcoded four every time. */
function pickIntermediateStops(from, to, seedKey, count) {
  const rand = mulberry32(hashString(seedKey));
  const pool = SANCHAAR_STOPS
    .map(s => s.name)
    .filter(name => name !== from && name !== to);

  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function renderMeters(scope) {
  scope.querySelectorAll('.meter[data-occ]').forEach(meter => {
    const pct = parseInt(meter.getAttribute('data-occ'), 10);
    const level = meter.getAttribute('data-level') || 'low';
    const color = levelColorVar(level);
    const total = 10;
    const on = Math.round((pct / 100) * total);
    meter.style.setProperty('--fill', color);
    meter.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const seg = document.createElement('i');
      if (i < on) seg.classList.add('on');
      meter.appendChild(seg);
    }
  });
}

function busCardHTML(bus, from, to) {
  const level = busLevel(bus.occ);
  const routeUrl = 'route.html?bus=' + encodeURIComponent(bus.id) +
    '&from=' + encodeURIComponent(from) +
    '&to=' + encodeURIComponent(to) +
    '&eta=' + bus.eta +
    '&occ=' + bus.occ;
  return `
    <div class="card bus-card">
      <div class="bus-card-top">
        <div class="bus-id">
          <span class="route-tag" style="background:${levelBg(level)}; color:${levelColorVar(level)};">${BUS_ICON}</span>
          <div>
            <div class="name">${bus.id}</div>
            <div class="path">${from} → ${to}</div>
          </div>
        </div>
        <div class="bus-eta">
          <div class="t">Arrives in</div>
          <div class="v">${bus.eta} min</div>
        </div>
      </div>
      <div class="bus-card-bottom">
        <div class="bus-occ">
          <div class="meter" data-occ="${bus.occ}" data-level="${level}"></div>
          <span class="chip chip-${level}">${bus.occ}% · ${levelLabel(level)}</span>
        </div>
        <a href="${routeUrl}" class="btn btn-outline btn-sm">View route</a>
      </div>
    </div>`;
}

function renderBusCards(buses, from, to) {
  const grid = document.getElementById('busGrid');
  if (!grid) return;
  grid.innerHTML = buses.map(b => busCardHTML(b, from, to)).join('');
  renderMeters(grid);

  const label = document.getElementById('busRouteLabel');
  if (label) label.textContent = from && to ? ` · ${from} → ${to}` : '';
}

async function loadBuses(from, to) {
  if (!from || !to) return;

  // Try the real backend first
  try {
   const res = await fetch(`${API_BASE}/api/buses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { 
      signal: AbortSignal.timeout(1500)
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        renderBusCards(data, from, to);
        return;
      }
    }       
  } catch (e) {
    // backend not reachable — fall through to demo generator
  }

  // Fallback: deterministic per-route demo data, no server required
  renderBusCards(generateBuses(from, to), from, to);
}

/* ============================================================
   Route detail page (route.html)
   Reads ?bus=&from=&to=&eta=&occ= from the URL (set by the "View
   route" link on each bus card) and renders that specific bus's
   stops, ETA and occupancy status — instead of one static page.
   ============================================================ */

function getRouteParams() {
  const params = new URLSearchParams(window.location.search);
  const bus = params.get('bus') || 'B12';
  const from = params.get('from') || 'University Gate';
  const to = params.get('to') || 'Railway Station';
  const eta = parseInt(params.get('eta'), 10);
  const occRaw = parseInt(params.get('occ'), 10);

  // If occupancy wasn't passed in (e.g. page opened directly), derive a
  // stable value from the bus id so the page is still self-consistent.
  const occ = Number.isFinite(occRaw)
    ? occRaw
    : 5 + Math.floor(mulberry32(hashString(bus))() * 95);

  return {
    bus,
    from,
    to,
    eta: Number.isFinite(eta) ? eta : 2 + Math.floor(mulberry32(hashString(bus + 'eta'))() * 20),
    occ
  };
}

function renderAlertSection(bus, from, to, eta, occ) {
  const alertCard = document.getElementById('alert');
  if (!alertCard) return;
  const level = busLevel(occ);

  if (level === 'high') {
    // Recommend the least-occupied other bus on this same route.
    const alt = generateBuses(from, to)
      .filter(b => b.id !== bus)
      .sort((a, b) => a.occ - b.occ)[0] ||
      { id: 'B' + (1 + Math.floor(mulberry32(hashString(bus + 'alt'))() * 97)), eta: eta + 2, occ: Math.max(10, occ - 50) };

    alertCard.innerHTML = `
      <div class="alert-head">
        ${WARN_ICON}
        <div style="font-family:var(--font-display); font-weight:700;">High Occupancy Alert</div>
      </div>
      <div class="alert-body">
        <p style="font-size:.88rem; color:var(--ink-500);">Bus ${bus} is currently</p>
        <div class="alert-figure">${occ}% occupied</div>
        <div class="reco-box">
          <div class="panel-head" style="margin-bottom:8px;">
            <span style="font-size:.8rem; color:var(--ink-500);">Recommended alternative</span>
          </div>
          <div class="bus-card-top" style="margin-bottom:0;">
            <div class="bus-id">
              <span class="route-tag" style="background:rgba(46,204,113,.15); color:var(--green-500);">${alt.id}</span>
              <div>
                <div class="name">${alt.id}</div>
                <div class="path">Arrives in ${alt.eta} min</div>
              </div>
            </div>
            <span class="chip chip-${busLevel(alt.occ)}">${alt.occ}%</span>
          </div>
        </div>
        <button class="btn btn-teal btn-block" id="takeAltBtn" style="margin-top:14px;">Take ${alt.id} instead</button>
        <ul class="reasons">
          <li>Less crowded <span style="color:var(--green-500);">✓</span></li>
          <li>${alt.eta <= eta ? 'Faster arrival' : 'Similar arrival time'} <span style="color:var(--green-500);">✓</span></li>
          <li>Similar route <span style="color:var(--green-500);">✓</span></li>
        </ul>
      </div>`;

    const takeAltBtn = document.getElementById('takeAltBtn');
    if (takeAltBtn) {
      takeAltBtn.addEventListener('click', () => {
        takeAltBtn.textContent = `✓ Switched to Bus ${alt.id}`;
        takeAltBtn.disabled = true;
        takeAltBtn.style.opacity = '.7';
      });
    }
    return;
  }

  // Moderate / low occupancy: show a status card instead of an alert —
  // no invented "alternative" when the current bus is already fine.
  const isMod = level === 'mod';
  alertCard.innerHTML = `
    <div class="alert-head" style="background:${isMod ? 'var(--amber-500)' : 'var(--green-500)'};">
      ${CHECK_ICON}
      <div style="font-family:var(--font-display); font-weight:700;">${isMod ? 'Moderate Occupancy' : 'Comfortable Ride'}</div>
    </div>
    <div class="alert-body">
      <p style="font-size:.88rem; color:var(--ink-500);">Bus ${bus} is currently</p>
      <div class="alert-figure" style="color:${levelColorVar(level)};">${occ}% occupied</div>
      <p style="font-size:.9rem; color:var(--ink-600); margin-top:10px;">
        ${isMod ? 'Filling up, but seats are still available.' : 'Plenty of seats available right now.'}
      </p>
    </div>`;
}

function initRoutePage() {
  const busIdEl = document.getElementById('routeBusId');
  if (!busIdEl) return; // not on route.html

  const { bus, from, to, eta, occ } = getRouteParams();

  // ---- header ----
  busIdEl.textContent = bus;
  const subtitleEl = document.getElementById('routeSubtitle');
  if (subtitleEl) subtitleEl.textContent = `${from} → ${to} · Arriving in ${eta} min · ${occ}% occupied`;
  document.title = `Sanchaar — Route map ${bus}`;

  // ---- stops along the map (deterministic per bus, so re-loading the
  // same bus always shows the same stops, but different buses differ) ----
  const midStops = pickIntermediateStops(from, to, bus + '|' + from + '|' + to, 3);
  const allStops = [from, ...midStops, to];
  const dotLevelRand = mulberry32(hashString(bus + '-dots'));

  allStops.forEach((name, i) => {
    const labelEl = document.getElementById('stopLabel' + i);
    const dotEl = document.getElementById('stopDot' + i);
    if (labelEl) labelEl.textContent = name;
    // Keep start (green) and end (indigo) colors fixed; vary the
    // intermediate stop colors to reflect crowding at that stop.
    if (dotEl && i > 0 && i < allStops.length - 1) {
      const stopLevel = busLevel(5 + Math.floor(dotLevelRand() * 95));
      dotEl.setAttribute('fill', levelColorVar(stopLevel));
    }
  });

  // ---- upcoming stops list ----
  const upcoming = document.getElementById('upcomingStops');
  if (upcoming) {
    const nextEta = Math.max(1, Math.round(eta * 0.35));
    const afterEta = Math.max(nextEta + 1, Math.round(eta * 0.7));
    upcoming.innerHTML = `
      <div class="stop-row">
        <div>
          <div class="name">${midStops[0] || to}</div>
          <div class="tag">Next stop</div>
        </div>
        <div class="time">${nextEta} min</div>
      </div>
      <div class="stop-row">
        <div>
          <div class="name">${midStops[1] || to}</div>
          <div class="tag">After next</div>
        </div>
        <div class="time">${afterEta} min</div>
      </div>`;
  }

  // ---- occupancy alert / status card ----
  renderAlertSection(bus, from, to, eta, occ);
}

/* ============================================================
   Dashboard quick actions (dashboard.html)
   All state here is client-side only (no backend yet) — see the
   comment block at the bottom of initDashboardPage() for the real
   endpoints to call once a fleet/alerts API exists.
   ============================================================ */

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

function statusLabelForLevel(level) {
  return level === 'high' ? 'Critical' : level === 'mod' ? 'Moderate' : 'Normal';
}
function chipClassForLevel(level) {
  return level === 'high' ? 'chip-high' : level === 'mod' ? 'chip-mod' : 'chip-low';
}
function barColorForLevel(level) {
  return level === 'high' ? 'var(--red-500)' : level === 'mod' ? 'var(--amber-500)' : 'var(--green-500)';
}

function bumpKpi(id, delta) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent, 10) || 0;
  const next = Math.max(0, current + delta);
  el.textContent = String(next).padStart(el.textContent.length, '0');
}

/** Insert or update a bus row in every fleet table on the page (Dashboard's
    summary table and the Fleet Management panel's full table share the
    ".fleet-table-body" class so they always stay in sync). */
function upsertFleetRow(busId, route, occ, updatedLabel) {
  const level = busLevel(occ);
  const rowHTML = `
    <td class="mono">${busId}</td><td>${route}</td>
    <td style="width:120px;"><div class="progress"><span data-fill="${occ}" style="width:${occ}%; background:${barColorForLevel(level)};"></span></div></td>
    <td><span class="chip ${chipClassForLevel(level)}">${statusLabelForLevel(level)}</span></td>
    <td class="mono" style="color:var(--ink-500);">${updatedLabel || 'Just now'}</td>`;

  document.querySelectorAll('.fleet-table-body').forEach(tbody => {
    let row = tbody.querySelector(`tr[data-bus-id="${busId}"]`);
    if (row) {
      row.innerHTML = rowHTML;
    } else {
      row = document.createElement('tr');
      row.setAttribute('data-bus-id', busId);
      row.innerHTML = rowHTML;
      tbody.appendChild(row);
    }
    // The Fleet Management table has a 6th "actions" column the Dashboard
    // summary table doesn't — re-add the Remove button after innerHTML resets it.
    if (tbody.id === 'fleetManagementTableBody') {
      const actionTd = document.createElement('td');
      actionTd.innerHTML = '<button class="btn btn-outline btn-sm fleet-remove-btn" type="button">Remove</button>';
      row.appendChild(actionTd);
    }
  });
}

/** Remove a bus row from every fleet table (Fleet Management panel's "Remove" action). */
function removeFleetRow(busId) {
  document.querySelectorAll('.fleet-table-body').forEach(tbody => {
    tbody.querySelector(`tr[data-bus-id="${busId}"]`)?.remove();
  });
}

/** Insert or update a row in the Routes panel's table. */
function upsertRouteRow(name, busCount) {
  const tbody = document.getElementById('routesTableBody');
  if (!tbody) return;
  let row = tbody.querySelector(`tr[data-route-name="${CSS.escape(name)}"]`);
  const rowHTML = `
    <td>${name}</td>
    <td class="mono">${busCount}</td>
    <td><span class="chip chip-low">Active</span></td>
    <td class="mono" style="color:var(--ink-500);">Just now</td>`;
  if (row) {
    row.innerHTML = rowHTML;
  } else {
    row = document.createElement('tr');
    row.setAttribute('data-route-name', name);
    row.innerHTML = rowHTML;
    tbody.appendChild(row);
  }
}

/** Resolve the standing B07 alert wherever it appears (dashboard list + crowding panel). */
function resolveAlert(alertId, { deployedBusId, held } = {}) {
  document.querySelectorAll(`[data-alert-id="${alertId}"]`).forEach(el => {
    if (el.classList.contains('mini-alert')) {
      el.classList.add('resolved');
      const dot = el.querySelector('.dot');
      if (dot) dot.classList.toggle('monitoring', !!held);
      const t = el.querySelector('.t');
      if (t) t.textContent = held ? 'Marked for monitoring — no bus deployed' : `Resolved — ${deployedBusId} deployed`;
    }
    if (el.classList.contains('crowd-panel')) {
      // Grey out the crowding-panel detail card once acted on.
      el.style.opacity = '.55';
      el.style.pointerEvents = 'none';
    }
  });
  bumpKpi('kpiAlertCount', -1);
}

function initDashboardPage() {
  const root = document.getElementById('recentAlertsList');
  if (!root) return; // not on dashboard.html

  const ALERT_ID = 'b07-rly-uni';
  let alertResolved = false;

  function deploy(busId, occ) {
    if (alertResolved) return;
    alertResolved = true;
    upsertFleetRow(busId, 'RLY → UNI', occ, 'Just now');
    resolveAlert(ALERT_ID, { deployedBusId: busId });
    showToast(`✓ ${busId} deployed to Route RLY → UNI`);
  }

  function hold() {
    if (alertResolved) return;
    alertResolved = true;
    resolveAlert(ALERT_ID, { held: true });
    showToast('Now monitoring B07 — no bus deployed');
  }

  /* ---- Dashboard panel quick actions ---- */
  document.getElementById('qaDeployBtn')?.addEventListener('click', (e) => {
    deploy('B24', 15); // newly dispatched relief bus, starts near-empty
    e.target.textContent = '✓ Deployed';
    e.target.disabled = true;
  });
  document.getElementById('qaHoldBtn')?.addEventListener('click', (e) => {
    hold();
    e.target.textContent = '✓ Monitoring';
    e.target.disabled = true;
  });

  /* ---- Crowding panel: the two buttons already in that detail card ---- */
  document.getElementById('deployBusBtn')?.addEventListener('click', (e) => {
    deploy('B12', 58); // matches the "expected occupancy after deployment" shown in the reco box
    e.target.textContent = '✓ Bus B12 deployed to Route RLY → UNI';
    e.target.disabled = true;
  });
  document.getElementById('qaCrowdDeployB18')?.addEventListener('click', (e) => {
    deploy('B18', 78);
    e.target.textContent = '✓ Deployed';
    e.target.disabled = true;
  });
  document.getElementById('qaCrowdHold')?.addEventListener('click', (e) => {
    hold();
    e.target.textContent = '✓ Monitoring';
    e.target.disabled = true;
  });

  /* ---- Add bus / Add route modal ---- */
  const overlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalFields = document.getElementById('modalFields');
  const modalForm = document.getElementById('modalForm');
  let modalMode = null; // 'bus' | 'route'

  function openModal(mode) {
    modalMode = mode;
    if (mode === 'bus') {
      modalTitle.textContent = 'Add bus';
      modalFields.innerHTML = `
        <div class="modal-field"><label for="fBusId">Bus number</label><input id="fBusId" placeholder="e.g. B33" required></div>
        <div class="modal-field"><label for="fBusRoute">Route</label><input id="fBusRoute" placeholder="e.g. RLY → UNI" required></div>
        <div class="modal-field"><label for="fBusOcc">Starting occupancy (%)</label><input id="fBusOcc" type="number" min="0" max="100" value="0" required></div>`;
    } else {
      modalTitle.textContent = 'Add route';
      modalFields.innerHTML = `
        <div class="modal-field"><label for="fRouteName">Route name</label><input id="fRouteName" placeholder="e.g. Civil Lines → Tech Park" required></div>
        <div class="modal-field"><label for="fRouteBuses">Buses to assign initially</label><input id="fRouteBuses" type="number" min="0" value="1" required></div>`;
    }
    overlay.classList.add('open');
  }
  function closeModal() {
    overlay.classList.remove('open');
    modalForm.reset();
    modalMode = null;
  }

  document.getElementById('qaAddBusBtn')?.addEventListener('click', () => openModal('bus'));
  document.getElementById('qaAddRouteBtn')?.addEventListener('click', () => openModal('route'));
  document.getElementById('qaAddBusBtn2')?.addEventListener('click', () => openModal('bus'));
  document.getElementById('qaAddRouteBtn2')?.addEventListener('click', () => openModal('route'));
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  modalForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (modalMode === 'bus') {
      const busId = document.getElementById('fBusId').value.trim();
      const route = document.getElementById('fBusRoute').value.trim();
      const occ = parseInt(document.getElementById('fBusOcc').value, 10) || 0;
      if (!busId || !route) return;
      upsertFleetRow(busId, route, occ, 'Just now');
      bumpKpi('kpiActiveBuses', 1);
      showToast(`✓ ${busId} added to fleet on ${route}`);
    } else if (modalMode === 'route') {
      const name = document.getElementById('fRouteName').value.trim();
      const busCount = parseInt(document.getElementById('fRouteBuses').value, 10) || 0;
      if (!name) return;
      upsertRouteRow(name, busCount);
      bumpKpi('kpiActiveRoutes', 1);
      showToast(`✓ Route added: ${name}`);
    }
    closeModal();
  });

  /* ---- Fleet Management panel: "Remove" button on each row ---- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.fleet-remove-btn');
    if (!btn) return;
    const row = btn.closest('tr[data-bus-id]');
    const busId = row?.getAttribute('data-bus-id');
    if (!busId) return;
    removeFleetRow(busId);
    bumpKpi('kpiActiveBuses', -1);
    showToast(`Removed ${busId} from fleet`);
  });

  /* ---- Announcements panel ---- */
  const announceForm = document.getElementById('announceForm');
  announceForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const titleEl = document.getElementById('announceTitle');
    const msgEl = document.getElementById('announceMessage');
    const title = titleEl.value.trim();
    const message = msgEl.value.trim();
    if (!title || !message) return;

    const list = document.getElementById('announcementsList');
    const item = document.createElement('div');
    item.className = 'mini-alert';
    item.innerHTML = `
      <span class="dot" style="background:var(--indigo-500);"></span>
      <div>
        <div><strong>${title}</strong></div>
        <div class="t">${message} · Just now</div>
      </div>`;
    list?.prepend(item);

    announceForm.reset();
    showToast('✓ Announcement posted');
  });

  /* ---- Reports panel ---- */
  document.getElementById('generateReportBtn')?.addEventListener('click', () => {
    const tbody = document.getElementById('reportsTableBody');
    if (!tbody) return;
    const now = new Date();
    const dateLabel = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>Daily Fleet Summary</td>
      <td class="mono">${dateLabel}</td>
      <td class="mono" style="color:var(--ink-500);">Just now</td>
      <td><a href="#" class="btn btn-outline btn-sm" onclick="return false;">Download</a></td>`;
    tbody.prepend(row);
    showToast('✓ Report generated');
  });

  /* ---- Settings panel ---- */
  document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('settingsName').value.trim();
    const dept = document.getElementById('settingsDept').value.trim();
    if (name) document.getElementById('sideFootName').textContent = name;
    if (dept) document.getElementById('sideFootDept').textContent = dept;
    showToast('✓ Settings saved');
  });

  /* ------------------------------------------------------------
     Wiring to a real backend later:
       POST /api/fleet              { busId, route, occupancy }
       DELETE /api/fleet/:busId
       POST /api/routes             { name, initialBuses }
       POST /api/alerts/:id/deploy  { busId }
       POST /api/alerts/:id/hold
       POST /api/announcements      { title, message }
       POST /api/reports/generate   { type }
       PATCH /api/authority/profile { name, department }
     Swap the client-side DOM updates above for fetch() calls to
     those endpoints, using the same try/backend-then-fallback
     pattern as loadBuses()/loadNetwork().
     ------------------------------------------------------------ */
}

document.addEventListener('DOMContentLoaded', () => {

  /* ---- animate progress / meter bars in on load ---- */
  document.querySelectorAll('.progress > span[data-fill]').forEach(el => {
    const target = el.getAttribute('data-fill');
    el.style.width = '0%';
    requestAnimationFrame(() => {
      el.style.transition = 'width 900ms cubic-bezier(.2,.8,.2,1)';
      el.style.width = target + '%';
    });
  });

  /* ---- occupancy meter dots (segmented bars) — static cards e.g. dashboard.html ---- */
  renderMeters(document);

  /* ---- dashboard sidebar tab switching (single-page sections) ---- */
  const navLinks = document.querySelectorAll('.side-nav a[data-section]');
  const sections = document.querySelectorAll('[data-panel]');
  const dashHeaderTitle = document.getElementById('dashHeaderTitle');
  if (navLinks.length && sections.length) {
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const target = link.getAttribute('data-section');
        sections.forEach(sec => {
          sec.style.display = sec.getAttribute('data-panel') === target ? '' : 'none';
        });
        if (dashHeaderTitle) dashHeaderTitle.textContent = link.textContent.trim();
      });
    });
  }

  /* ---- mobile menu toggle on marketing/passenger pages ---- */
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinksBox = document.querySelector('.nav-links');
  if (menuToggle && navLinksBox) {
    menuToggle.addEventListener('click', () => {
      navLinksBox.classList.toggle('open');
    });
  }

  /* ---- "find buses" interaction on passenger page: re-generate results ---- */
  const findBtn = document.getElementById('findBusesBtn');
  const fromInput = document.getElementById('fromInput');
  const toInput = document.getElementById('toInput');
  if (findBtn && fromInput && toInput) {
    findBtn.addEventListener('click', () => {
      loadBuses(fromInput.value, toInput.value);
      document.getElementById('busResults')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    // populate results for the pre-filled From/To on first load
    loadBuses(fromInput.value, toInput.value);
  }

  /* ---- swap From / To values ---- */
  const swapBtn = document.getElementById('swapBtn');
  if (swapBtn && fromInput && toInput) {
    swapBtn.addEventListener('click', () => {
      const tmp = fromInput.value;
      fromInput.value = toInput.value;
      toInput.value = tmp;
      swapBtn.style.transform = 'rotate(180deg)';
      setTimeout(() => { swapBtn.style.transform = ''; }, 200);
      loadBuses(fromInput.value, toInput.value);
    });
  }

  /* ---- stop autocomplete with ranked / "AI-style" recommendations ---- */
  setupStopAutocomplete('fromInput', 'fromSuggest');
  setupStopAutocomplete('toInput', 'toSuggest');

  /* ---- route.html: render the specific bus passed in the URL ---- */
  initRoutePage();

  /* ---- dashboard.html: quick actions (deploy/hold/add bus/add route) ---- */
  initDashboardPage();

  /* ---- live dot pulse position along route line (route.html) ---- */
  const liveDot = document.getElementById('liveBusDot');
  const routePath = document.getElementById('routeLinePath');
  if (liveDot && routePath && routePath.getTotalLength) {
    const len = routePath.getTotalLength();
    let progress = 0.28; // starting position along the route
    setInterval(() => {
      progress += 0.004;
      if (progress > 1) progress = 0;
      const pt = routePath.getPointAtLength(progress * len);
      liveDot.setAttribute('cx', pt.x);
      liveDot.setAttribute('cy', pt.y);
    }, 60);
  }

});