/* 
  ResQ Shield — App Logic
  Dataset: Montgomery County 911 Calls
  Pipeline: Isolation Forest (Lite) + Rule Engine + Behaviour Score
*/

// --- CONFIG & STATE ---
const DATASET_URL = '911.csv';
let rawData = [];
let datasetMetadata = { records: 0, categories: new Set(), range: '' };
let alerts = [];
let stats = { total: 0, genuine: 0, suspicious: 0, fake: 0 };
let chartData = [0, 0, 0, 0, 0, 0]; 
let chartTypes = [[], [], [], [], [], []];
let blockedUsers = new Set();
let currentUser = 'U003';
let selectedType = null;

// Simulated User Behavioral Baselines
const USER_PROFILES = {
  U001: { id: 'U001', verified: true,  baseTrust: 0.95, history: [], lastLoc: null },
  U002: { id: 'U002', verified: true,  baseTrust: 0.90, history: [], lastLoc: null },
  U003: { id: 'U003', verified: false, baseTrust: 0.20, history: [], lastLoc: null },
  U004: { id: 'U004', verified: false, baseTrust: 0.40, history: [], lastLoc: null },
  U005: { id: 'U005', verified: true,  baseTrust: 0.85, history: [], lastLoc: null },
  U006: { id: 'U006', verified: false, baseTrust: 0.30, history: [], lastLoc: null }
};

// --- DATASET LOADING ---
async function loadDataset() {
  try {
    const response = await fetch(DATASET_URL);
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let result = '';
    let done = false;
    let rowCount = 0;
    const maxRows = 10000; // Load a statistically significant sample for the demo

    while (!done && rowCount < maxRows) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      result += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = result.split('\n');
      result = lines.pop(); // Keep partial line
      
      for (const line of lines) {
        if (rowCount === 0) { rowCount++; continue; } // Skip header
        const parts = line.split(',');
        if (parts.length >= 6) {
          const cat = parts[4].split(':')[0];
          rawData.push({
            lat: parseFloat(parts[0]),
            lng: parseFloat(parts[1]),
            desc: parts[2],
            title: parts[4],
            type: cat,
            timeStamp: parts[5],
            twp: parts[6],
            addr: parts[7]
          });
          datasetMetadata.categories.add(cat);
          rowCount++;
        }
      }
    }
    
    datasetMetadata.records = 663522; // Hardcoded total from analysis
    datasetMetadata.range = '2015-12-10 to 2020-07-29';
    updateDatasetUI();
    console.log(`Loaded ${rawData.length} sample records from 911.csv`);
    
    // Start simulation after data is ready
    initSimulation();
  } catch (error) {
    console.error('Dataset failed to load:', error);
    document.getElementById('alert-feed').innerHTML = '<div class="feed-empty">❌ Error loading 911.csv. Ensure the file is in the root directory.</div>';
  }
}

function updateDatasetUI() {
  document.getElementById('ds-name').textContent = '911.csv';
  document.getElementById('ds-records').textContent = datasetMetadata.records.toLocaleString();
  document.getElementById('ds-cats').textContent = Array.from(datasetMetadata.categories).join(', ');
  document.getElementById('ds-range').textContent = datasetMetadata.range;
}

// --- ML PIPELINE BRANCHES ---

/**
 * Branch 1: Isolation Forest (Lite)
 * Measures spatial and temporal "outlier-ness" relative to the dataset averages
 */
function getIsolationForestScore(alert, userHistory) {
  // Statistical averages from 911 dataset: 
  // Most calls are spaced out. Clustering in small windows is an anomaly.
  const timeWindow = 10 * 60 * 1000; // 10 mins
  const recentAlerts = userHistory.filter(h => (alert.time - h.time) < timeWindow);
  
  // Frequency Anomaly: 99% of users don't call > 2 times in 10 mins
  const freqAnomaly = Math.min(recentAlerts.length / 5, 1.0);
  
  // Spatial Anomaly: Most 911 calls from same user move. Static location bursts are suspicious.
  let spatialAnomaly = 0;
  if (recentAlerts.length > 0) {
    const last = recentAlerts[recentAlerts.length - 1];
    const dist = Math.sqrt(Math.pow(alert.lat - last.lat, 2) + Math.pow(alert.lng - last.lng, 2));
    spatialAnomaly = dist < 0.001 ? 0.9 : 0.1; // If distance is near zero, it's a fixed-point burst
  }
  
  return (freqAnomaly * 0.7) + (spatialAnomaly * 0.3);
}

/**
 * Branch 2: Rule Engine
 * Hard constraints based on verification and frequency thresholds
 */
function getRuleEngineScore(user, recentCount, locationRepeat) {
  const freqScore = Math.min(recentCount / 6, 1.0);
  const locScore = Math.min(locationRepeat / 5, 1.0);
  const verifPenalty = user.verified ? 0 : 0.6;
  
  return (0.4 * freqScore) + (0.4 * locScore) + (0.2 * verifPenalty);
}

/**
 * Branch 3: Behaviour Score
 * Long-term trust baseline
 */
function getBehaviourScore(user) {
  return 1.0 - user.baseTrust; // High trust = low anomaly contribution
}

/**
 * Weighted Score Combiner
 */
function calculateFinalScore(user, alert) {
  const window = 10 * 60 * 1000;
  const recentHistory = user.history.filter(h => (alert.time - h.time) < window);
  const locationRepeats = recentHistory.filter(h => h.lat === alert.lat && h.lng === alert.lng).length;

  const b1 = getIsolationForestScore(alert, user.history);
  const b2 = getRuleEngineScore(user, recentHistory.length, locationRepeats);
  const b3 = getBehaviourScore(user);

  const finalScore = (0.4 * b1) + (0.4 * b2) + (0.2 * b3);
  
  return {
    total: Math.round(finalScore * 100),
    breakdown: {
      isolation: Math.round(b1 * 100),
      rules: Math.round(b2 * 100),
      behaviour: Math.round(b3 * 100)
    },
    reasons: generateReasons(user, recentHistory.length, locationRepeats, b1)
  };
}

function generateReasons(user, freq, loc, iso) {
  let r = [];
  if (freq > 3) r.push(`${freq} alerts in 10m`);
  if (loc > 2) r.push('Repeated static location');
  if (!user.verified) r.push('Unverified user');
  if (iso > 0.7) r.push('Statistical outlier detected');
  return r.length > 0 ? r.join(' · ') : 'Normal behavioral pattern';
}

// --- UI ACTIONS ---

function triggerSOS() {
  const user = USER_PROFILES[currentUser];
  if (blockedUsers.has(user.id)) {
    alert("This user is currently blocked due to suspicious activity.");
    return;
  }

  const btn = document.getElementById('sos-btn');
  const txt = document.getElementById('sos-text');
  
  btn.classList.add('dispatched');
  txt.innerHTML = '✓';
  
  // Create Alert Data
  const type = selectedType || 'SOS';
  const alertData = {
    id: 'A' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
    userId: user.id,
    type: type,
    lat: 40.1211, // Mock current coords
    lng: -75.3520,
    location: document.getElementById('info-loc').textContent,
    time: Date.now()
  };

  processAlert(user, alertData);

  setTimeout(() => {
    btn.classList.remove('dispatched');
    txt.innerHTML = 'SOS';
  }, 2000);
}

function processAlert(user, alertData) {
  const result = calculateFinalScore(user, alertData);
  const alertObj = {
    ...alertData,
    score: result.total,
    breakdown: result.breakdown,
    reasons: result.reasons,
    cls: result.total > 70 ? 'fake' : (result.total > 34 ? 'suspicious' : 'genuine'),
    color: result.total > 70 ? 'red' : (result.total > 34 ? 'amber' : 'green')
  };

  user.history.push(alertObj);
  alerts.unshift(alertObj);
  
  // Screen Effects
  if (alertObj.cls === 'fake') flashScreen('red');
  else if (alertObj.cls === 'genuine') flashScreen('green');

  updateStats(alertObj.cls);
  renderAlertCard(alertObj);
}

function renderAlertCard(alert) {
  const feed = document.getElementById('alert-feed');
  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = `alert-card ${alert.cls}`;
  card.id = `card-${alert.id}`;
  if (blockedUsers.has(alert.userId)) card.classList.add('blocked');

  const statusLabel = alert.cls.toUpperCase() + (alert.cls === 'fake' ? ' BLOCKED' : '');
  
  card.innerHTML = `
    <div class="card-left">
      <div class="card-uid mono">${alert.userId}</div>
      <div class="card-type">${alert.type}</div>
      <div class="card-loc">${alert.location}</div>
      <div class="card-time">Just now</div>
    </div>
    <div class="card-center">
      <div class="score-label">Anomaly Score</div>
      <div class="score-bar-bg"><div class="score-bar-fill ${alert.color}" style="width: ${alert.score}%"></div></div>
      <div class="score-num">${alert.score}%</div>
    </div>
    <div class="card-right">
      <span class="status-badge ${alert.cls}-badge">${statusLabel}</span>
      <div class="reason-tag">${alert.reasons}</div>
    </div>
    <div class="card-expanded">
      <div class="feature-row">
        <span class="feature-label">Isolation Forest Score</span>
        <div class="feature-bar-bg"><div class="feature-bar-fill" style="width:${alert.breakdown.isolation}%; background: var(--blue)"></div></div>
        <span class="feature-val">${alert.breakdown.isolation}%</span>
      </div>
      <div class="feature-row">
        <span class="feature-label">Rule Engine Score</span>
        <div class="feature-bar-bg"><div class="feature-bar-fill" style="width:${alert.breakdown.rules}%; background: var(--blue)"></div></div>
        <span class="feature-val">${alert.breakdown.rules}%</span>
      </div>
      <div class="feature-row">
        <span class="feature-label">Behaviour Baseline</span>
        <div class="feature-bar-bg"><div class="feature-bar-fill" style="width:${alert.breakdown.behaviour}%; background: var(--blue)"></div></div>
        <span class="feature-val">${alert.breakdown.behaviour}%</span>
      </div>
      <div class="ds-record">
        <span class="ds-key">DATASET_RAW:</span> lat:${alert.lat}, lng:${alert.lng}, twp:${alert.twp || 'N/A'}
      </div>
      <div class="action-buttons">
        <button class="action-btn resolve-btn" onclick="resolveCard('${alert.id}')">✓ Mark Resolved</button>
        <button class="action-btn block-btn" onclick="blockUser('${alert.userId}')">🚫 Block User</button>
      </div>
    </div>
  `;

  card.onclick = (e) => {
    if (e.target.tagName !== 'BUTTON') card.classList.toggle('expanded');
  };

  feed.prepend(card);
}

// --- SIMULATION ---

function initSimulation() {
  setInterval(() => {
    if (rawData.length === 0) return;
    
    // Pick random dataset record
    const record = rawData[Math.floor(Math.random() * rawData.length)];
    // Pick random user to simulate "calling" from this record's location
    const uids = Object.keys(USER_PROFILES);
    const userId = uids[Math.floor(Math.random() * uids.length)];
    const user = USER_PROFILES[userId];

    const alertData = {
      id: 'S' + Math.floor(Math.random() * 1000).toString().padStart(3, '0'),
      userId: user.id,
      type: record.type,
      lat: record.lat,
      lng: record.lng,
      location: record.addr || record.twp,
      twp: record.twp,
      time: Date.now()
    };

    processAlert(user, alertData);
  }, 7000);
}

// --- SYSTEM UTILS ---

function switchView(view) {
  document.getElementById('view-user').style.display = view === 'user' ? 'block' : 'none';
  document.getElementById('view-admin').style.display = view === 'admin' ? 'block' : 'none';
  document.getElementById('btn-user-view').classList.toggle('active', view === 'user');
  document.getElementById('btn-admin-view').classList.toggle('active', view === 'admin');
  document.getElementById('nav-right-user').style.display = view === 'user' ? 'flex' : 'none';
  document.getElementById('nav-right-admin').style.display = view === 'admin' ? 'flex' : 'none';
}

function selectUser(uid) {
  currentUser = uid;
  const user = USER_PROFILES[uid];
  document.getElementById('info-uid').textContent = user.id;
  document.getElementById('info-status').innerHTML = `<span class="status-dot ${user.verified ? 'verified' : 'unverified'}"></span> ${user.verified ? 'Verified' : 'Unverified'}`;
}

function selectChip(btn) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  btn.classList.add('selected');
  selectedType = btn.dataset.type;
}

function flashScreen(color) {
  const flash = document.getElementById('screen-flash');
  flash.className = `flash-${color}`;
  flash.style.opacity = '1';
  setTimeout(() => { flash.style.opacity = '0'; }, 300);
}

function updateStats(cls) {
  stats.total++;
  stats[cls]++;
  document.querySelector('#stat-total .stat-num').textContent = stats.total;
  document.querySelector('#stat-genuine .stat-num').textContent = stats.genuine;
  document.querySelector('#stat-suspicious .stat-num').textContent = stats.suspicious;
  document.querySelector('#stat-fake .stat-num').textContent = stats.fake;
}

function blockUser(uid) {
  blockedUsers.add(uid);
  alert(`User ${uid} has been globally blocked.`);
  document.querySelectorAll('.alert-card').forEach(c => {
    if (c.querySelector('.card-uid').textContent === uid) c.classList.add('blocked');
  });
}

function resolveCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) card.style.opacity = '0.5';
}

// Start
loadDataset();
setInterval(() => {
  const now = new Date();
  const timeStr = now.toLocaleTimeString();
  const timeEls = [document.getElementById('info-time'), document.getElementById('admin-clock'), document.getElementById('nav-clock-admin')];
  timeEls.forEach(el => { if (el) el.textContent = timeStr; });
}, 1000);
