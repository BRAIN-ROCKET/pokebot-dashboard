/* eslint-disable no-console */
(function () {
  const API = {
    base: null,
    setBase(base) { this.base = base; },
    url(path) { return `/proxy/${path.replace(/^\//, '')}`; },
    get(path, params) {
      const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
      return fetch(this.url(`${path}${qs}`), { cache: 'no-store' })
        .then(async r => {
          const txt = await r.text();
          try { return JSON.parse(txt); } catch (_) { return txt; }
        });
    },
    post(path, body) {
      return fetch(`/proxy_post/${path.replace(/^\//, '')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      }).then(r => r.json());
    }
  };

  // Elements
  const els = {
    apiBase: document.getElementById('apiBase'),
    healthChip: document.getElementById('healthChip'),
    liveFps: document.getElementById('liveFps'),
    encRate: document.getElementById('encRate'),
    phaseEnc: document.getElementById('phaseEnc'),
    totalEnc: document.getElementById('totalEnc'),
    shinyCount: document.getElementById('shinyCount'),
    // overlays
    overlayGame: document.getElementById('overlayGame'),
    overlayProfile: document.getElementById('overlayProfile'),
    overlayMode: document.getElementById('overlayMode'),
    overlaySpeed: document.getElementById('overlaySpeed'),
    // stats card
    statPhase: document.getElementById('statPhase'),
    statPhaseEnc: document.getElementById('statPhaseEnc'),
    statTotalEnc: document.getElementById('statTotalEnc'),
    statShinies: document.getElementById('statShinies'),
    statER: document.getElementById('statER'),
    statRuntime: document.getElementById('statRuntime'),
    // opponent
    oppSpecies: document.getElementById('oppSpecies'),
    oppLevel: document.getElementById('oppLevel'),
    oppShiny: document.getElementById('oppShiny'),
    oppHp: document.getElementById('oppHp'),
    oppStatus: document.getElementById('oppStatus'),
    // player
    playerName: document.getElementById('playerName'),
    playerIds: document.getElementById('playerIds'),
    playerMoney: document.getElementById('playerMoney'),
    playerLoc: document.getElementById('playerLoc'),
    playerCoords: document.getElementById('playerCoords'),
    // tables and containers
    partyTable: document.getElementById('partyTable')?.querySelector('tbody'),
    encountersTable: document.getElementById('encountersTable')?.querySelector('tbody'),
    partyCards: document.getElementById('partyCards'),
    opponentCard: document.getElementById('opponentCard'),
    shinyCards: document.getElementById('shinyCards'),
    // logs
    encounterLog: document.getElementById('encounterLog'),
    shinyLog: document.getElementById('shinyLog'),
    // controls
    speedSelect: document.getElementById('speedSelect'),
    applySpeed: document.getElementById('applySpeed'),
    botMode: document.getElementById('botMode'),
    applyMode: document.getElementById('applyMode'),
    videoEnabled: document.getElementById('videoEnabled'),
    audioEnabled: document.getElementById('audioEnabled'),
    applyVideo: document.getElementById('applyVideo'),
    applyAudio: document.getElementById('applyAudio'),
  };

  // Video
  const screenImg = document.getElementById('screenImg');
  let sse = null;

  function startVideoStream() {
    try { if (sse) sse.close(); } catch (_) {}
    // Simplest approach: let the <img> display the byte stream directly
    const fps = 30;
    // Preserve 240x160 aspect ratio by letting the browser scale the image element; our CSS sets size
    screenImg.src = `/proxy/stream_video?fps=${fps}`;
    screenImg.onerror = () => {
      // If direct image fails, fallback to SSE parsing
      try { if (sse) sse.close(); } catch (_) {}
      sse = new EventSource(`/proxy/stream_video?fps=${fps}`);
      sse.onmessage = (evt) => {
        const data = (evt.data || '').trim();
        let url = null;
        if (data.startsWith('data:image/')) url = data;
        else if (/^[A-Za-z0-9+/=]+$/.test(data)) url = `data:image/png;base64,${data}`;
        if (url) screenImg.src = url;
      };
      sse.onerror = () => { try { sse.close(); } catch (_) {}; setTimeout(startVideoStream, 2000); };
    };
  }

  // drawFrameFromUrl no longer needed

  // Charts
  const encChart = new Chart(document.getElementById('encChart'), {
    type: 'line',
    data: { labels: Array.from({ length: 60 }, (_, i) => `${i - 59}m`), datasets: [{
      label: 'Encounters/h', data: new Array(60).fill(0), borderColor: '#00e5ff', pointRadius: 0, tension: 0.2,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { suggestedMin: 0, suggestedMax: 2000, grid: { color: 'rgba(255,255,255,0.06)' } }, x: { grid: { display: false } } },
      plugins: { legend: { display: false } }
    }
  });

  const encRateHistory = new Array(60).fill(0);
  function updateEncChart(valuePerHour) {
    encRateHistory.push(Number(valuePerHour) || 0);
    while (encRateHistory.length > 60) encRateHistory.shift();
    encChart.data.datasets[0].data = encRateHistory.slice();
    encChart.update('none');
  }

  // Helpers
  function setHealth(ok) {
    els.healthChip.textContent = ok ? 'UP' : 'DOWN';
    els.healthChip.classList.toggle('ok', !!ok);
  }
  function fmtNum(n) { return typeof n === 'number' ? n.toLocaleString() : '—'; }
  function fmtBool(b) { return b ? 'Yes' : 'No'; }
  function safe(obj, path, dflt = '—') {
    try {
      const val = path.split('.').reduce((a, k) => (a ? a[k] : undefined), obj);
      return (val === undefined || val === null || val === '') ? dflt : val;
    } catch (_) { return dflt; }
  }

  function toText(value, fallback = '—') {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map(v => toText(v, '')).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      const keysByPreference = [
        'display_name', 'name', 'species_name', 'species', 'nickname', 'label', 'title', 'id', 'value', 'text'
      ];
      for (const k of keysByPreference) {
        if (k in value) return toText(value[k], fallback);
      }
      // Last resort, compact JSON
      try { return JSON.stringify(value); } catch (_) { return fallback; }
    }
    try { return String(value); } catch (_) { return fallback; }
  }

  function genderSymbol(g) {
    if (g == null) return '';
    const s = String(g).toLowerCase();
    if (s.startsWith('m')) return '♂';
    if (s.startsWith('f')) return '♀';
    return '';
  }

  function buildPokemonCard(mon, opts) {
    if (!mon) return '';
    const species = toText(mon.species?.name ?? mon.name ?? mon.species_name, '—');
    const level = mon.level ?? mon.lv ?? '?';
    const shiny = (mon.is_shiny || mon.shiny) ? '★' : '';
    const nature = toText(mon.nature?.name ?? mon.nature, '—');
    const gender = genderSymbol(mon.gender);
    const ivs = mon.ivs || mon.IVs || {};
    const ivBlock = ['hp','attack','defence','speed','special_attack','special_defence']
      .map(k => {
        const raw = ivs[k];
        const num = typeof raw === 'number' ? raw : null;
        const mod = num === 31 ? ' max' : (num === 0 ? ' zero' : '');
        return `<span class="pk-iv${mod}">${(raw ?? '?')}</span>`;
      }).join('');
    const dateHtml = opts?.dateText ? `<div class="pk-date">${opts.dateText}</div>` : '';
    return `<div class="pk-card">
      ${shiny ? '<div class="pk-star">★</div>' : ''}
      <div class="pk-main">
        <div class="pk-name">${species} ${gender}</div>
        <div class="pk-badges">
          <span class="pk-badge">Lv ${level}</span>
          <span class="pk-badge">${nature}</span>
        </div>
        <div class="pk-ivs">${ivBlock}</div>
      </div>
      ${dateHtml}
    </div>`;
  }

  function formatEncounterTime(isoLike) {
    if (!isoLike) return '';
    const d = new Date(isoLike);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const mon = String(d.getMonth()+1).padStart(2,'0');
    const yr = d.getFullYear();
    return `${hh}:${mm} ${day}/${mon}/${yr}`;
  }

  // buildShinyLogCard no longer needed

  // Load config then boot
  fetch('/config').then(r => r.json()).then(cfg => {
    els.apiBase.textContent = cfg.base;
    API.setBase(cfg.base);
    boot();
  });

  function boot() {
    startVideoStream();
    refreshHealth();
    refreshStatic();
    refreshModes();
    // Pollers
    setInterval(refreshHealth, 3000);
    setInterval(refreshStats, 1500);
    setInterval(refreshOpponent, 1500);
    setInterval(refreshParty, 3000);
    setInterval(refreshPlayer, 4000);
    setInterval(refreshMap, 3000);
    setInterval(refreshEncounters, 3500);
    setInterval(refreshLogs, 3000);
    setInterval(refreshFps, 1000);
    // Controls
    wireControls();
  }

  function wireControls() {
    // Auto-apply on change for all controls
    if (els.speedSelect) {
      els.speedSelect.addEventListener('change', async () => {
        const raw = Number(els.speedSelect.value || '1');
        const allowed = new Set([0,1,2,3,4,8,16,32]);
        const val = allowed.has(raw) ? raw : 1;
        await API.post('/emulator', { emulation_speed: val });
        refreshEmulator();
      });
    }
    if (els.botMode) {
      els.botMode.addEventListener('change', async () => {
        const mode = els.botMode.value;
        if (!mode) return;
        await API.post('/emulator', { bot_mode: mode });
        refreshEmulator();
      });
    }
    if (els.videoEnabled) {
      els.videoEnabled.addEventListener('change', async () => {
        const v = els.videoEnabled.value === 'true';
        await API.post('/emulator', { video_enabled: v });
        refreshEmulator();
      });
    }
    if (els.audioEnabled) {
      els.audioEnabled.addEventListener('change', async () => {
        const v = els.audioEnabled.value === 'true';
        await API.post('/emulator', { audio_enabled: v });
        refreshEmulator();
      });
    }
  }

  // Refreshers
  async function refreshHealth() {
    try {
      const r = await fetch('/health').then(r => r.json());
      setHealth(!!r.ok);
    } catch (_) { setHealth(false); }
  }

  async function refreshModes() {
    try {
      const modes = await API.get('/bot_modes');
      const sel = els.botMode;
      sel.innerHTML = '';
      if (Array.isArray(modes)) {
        for (const m of modes) {
          const opt = document.createElement('option');
          opt.value = m; opt.textContent = m; sel.appendChild(opt);
        }
      }
      refreshEmulator();
    } catch (e) {
      console.warn('bot_modes failed', e);
    }
  }

  async function refreshEmulator() {
    try {
      const info = await API.get('/emulator');
      const gameTitle = info?.game?.title || info?.game?.name || toText(info?.game, '—');
      els.overlayGame.textContent = gameTitle;
      els.overlayProfile.textContent = info?.profile?.name || toText(info?.profile, '—');
      els.overlayMode.textContent = toText(info?.bot_mode, '—');
      const spd = info?.emulation_speed;
      els.overlaySpeed.textContent = (typeof spd === 'number') ? (spd === 0 ? '∞' : String(spd)) : '—';
      // set dropdown to current mode
      if (els.botMode && info?.bot_mode) {
        const val = String(info.bot_mode);
        const found = Array.from(els.botMode.options).some(o => o.value === val);
        if (found) els.botMode.value = val;
      }
      // set speed dropdown to current speed
      if (typeof info?.emulation_speed === 'number' && els.speedSelect) {
        const allowed = [0,1,2,3,4,8,16,32];
        const v = allowed.includes(info.emulation_speed) ? info.emulation_speed : 1;
        els.speedSelect.value = String(v);
      }
      if (info && info.video_enabled !== undefined) {
        els.videoEnabled.value = String(!!info.video_enabled);
      }
      if (info && info.audio_enabled !== undefined) {
        els.audioEnabled.value = String(!!info.audio_enabled);
      }
    } catch (e) {
      // ignore
    }
  }

  async function refreshStats() {
    try {
      // With provided examples, the richer phase stats live under /stats (not example),
      // but we can also map encounter_rate JSON { "encounter_rate": N }
      const phaseStats = await API.get('/stats').catch(() => ({}));
      const er = await API.get('/encounter_rate').catch(() => null);

      // Totals fallbacks from example phase.json-like structure
      const totals = phaseStats.totals || {};
      const currentPhase = phaseStats.current_phase || {};

      const total = phaseStats.total_encounters ?? totals.total_encounters ?? null;
      const shinies = phaseStats.shiny_count ?? totals.shiny_encounters ?? null;
      const phaseEnc = phaseStats.phase_encounters ?? currentPhase.encounters ?? null;
      const phase = phaseStats.phase ?? phaseStats.current_phase_id ?? currentPhase.species_name ?? null;
      const rate = (er && (er.encounter_rate ?? er.rate ?? er.current)) || null;
      // runtime: derive from server field or from difference between now and current_phase.start_time
      let runtime = phaseStats.runtime;
      if (!runtime && currentPhase.start_time) {
        const start = Date.parse(currentPhase.start_time);
        if (!isNaN(start)) {
          const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
          const h = Math.floor(secs / 3600);
          const m = Math.floor((secs % 3600) / 60);
          const s = secs % 60;
          runtime = `${h}h ${m}m ${s}s`;
        }
      }
      runtime = runtime || '—';
      els.encRate.textContent = rate ? Number(rate).toFixed(0) : '—';
      els.phaseEnc.textContent = fmtNum(phaseEnc);
      els.totalEnc.textContent = fmtNum(total);
      els.shinyCount.textContent = fmtNum(shinies);
      els.statPhase.textContent = toText(phase, '—');
      els.statPhaseEnc.textContent = fmtNum(phaseEnc);
      els.statTotalEnc.textContent = fmtNum(total);
      els.statShinies.textContent = fmtNum(shinies);
      els.statER.textContent = rate ? Number(rate).toFixed(0) : '—';
      els.statRuntime.textContent = runtime;
    } catch (e) {
      // ignore
    }
  }

  async function refreshOpponent() {
    try {
      const opp = await API.get('/opponent');
      if (els.opponentCard) {
        els.opponentCard.innerHTML = buildPokemonCard(opp);
      }
      if (els.oppSpecies) {
        const speciesName = opp?.species?.name || opp?.species_name || opp?.name || '—';
        els.oppSpecies.textContent = speciesName;
        els.oppLevel.textContent = toText(opp?.level, '—');
        els.oppShiny.textContent = fmtBool(!!(opp?.is_shiny || opp?.shiny));
        const hp = (opp && opp.current_hp != null && opp.total_hp != null)
          ? `${opp.current_hp}/${opp.total_hp}`
          : (opp && opp.hp != null && opp.max_hp != null) ? `${opp.hp}/${opp.max_hp}` : '—';
        els.oppHp.textContent = hp;
        els.oppStatus.textContent = toText(opp?.status_condition ?? opp?.status, '—');
      }
    } catch (e) {
      // ignore
    }
  }

  async function refreshPlayer() {
    try {
      const p = await API.get('/player');
      const a = await API.get('/player_avatar');
      const m = await API.get('/map');
      els.playerName.textContent = toText(p?.name, '—');
      const tid = p?.trainer_id ?? p?.tid ?? p?.TID ?? '—';
      const sid = p?.secret_id ?? p?.sid ?? p?.SID ?? '—';
      els.playerIds.textContent = `${tid}/${sid}`;
      els.playerMoney.textContent = fmtNum(p?.money);
      const location = (m && (m.map_name || m.name || m.id)) || '—';
      els.playerLoc.textContent = location;
      const loc = Array.isArray(a?.local_coordinates) ? a.local_coordinates : [a?.x, a?.y];
      els.playerCoords.textContent = `(${toText(loc?.[0], '?')}, ${toText(loc?.[1], '?')})`;
    } catch (e) {
      // ignore
    }
  }

  async function refreshMap() {
    // nothing extra for now; placeholder if we want more map details
  }

  async function refreshEncounters() {
    try {
      const enc = await API.get('/map_encounters');
      const reg = enc?.regular?.land_encounters || [];
      const eff = enc?.effective?.land_encounters || [];
      const effMap = new Map(eff.map(x => [x.species_name, x]));
      const rows = reg.slice(0, 12).map(e => {
        const species = e.species_name || toText(e.species, '—');
        const lv = (e.min_level && e.max_level) ? `${e.min_level}-${e.max_level}` : (e.level || '—');
        const chance = e.encounter_rate ?? 0;
        const effItem = effMap.get(e.species_name);
        const effRate = effItem ? (effItem.encounter_rate ?? 0) : chance;
        return `<tr><td>${species}</td><td>${lv}</td><td>${(Number(chance)||0).toFixed(1)}</td><td>${(Number(effRate)||0).toFixed(2)}</td></tr>`;
      }).join('');
      els.encountersTable.innerHTML = rows;
    } catch (e) {
      // ignore
    }
  }

  async function refreshParty() {
    try {
      const party = await API.get('/party');
      if (els.partyCards) {
        const html = Array.isArray(party) ? party.slice(0, 6).map(buildPokemonCard).join('') : '';
        els.partyCards.innerHTML = html;
      }
      if (els.partyTable) {
        const rows = Array.isArray(party) ? party.map((p, i) => {
          const shiny = (p.is_shiny || p.shiny) ? '★' : '';
          const species = toText(p.species ?? p.name ?? p.species_name, '—');
          const level = toText(p.level, '?');
          const nature = toText(p.nature, '?');
          return `<tr><td>${i+1}</td><td>${species}</td><td>${level}</td><td>${nature}</td><td>${shiny}</td></tr>`;
        }).join('') : '';
        els.partyTable.innerHTML = rows;
      }
    } catch (e) {
      // ignore
    }
  }

  async function refreshLogs() {
    try {
      const [enc, shiny] = await Promise.all([
        API.get('/encounter_log'),
        API.get('/shiny_log')
      ]);
      if (els.encounterLog) {
        const encItems = (Array.isArray(enc) ? enc : []).map(i => {
          const time = toText(i.encounter_time ?? i.time ?? i.timestamp, '');
          const mon = i.pokemon || i;
          const who = toText(mon.name ?? mon.species?.name ?? mon.species_name, '—');
          const lvl = mon.level ? ` Lv ${mon.level}` : '';
          const isShiny = (mon.is_shiny || mon.shiny) ? ' shiny' : '';
          return `<li><span class="time">${time}</span><span class="pokemon${isShiny}">${who}${lvl}</span></li>`;
        }).join('');
        els.encounterLog.innerHTML = encItems;
      }
      // Shiny log can be an array of entries with a nested shiny_encounter object
      let shinyArray = Array.isArray(shiny) ? shiny : [];
      if (typeof shiny === 'string') {
        try { const parsed = JSON.parse(shiny); if (Array.isArray(parsed)) shinyArray = parsed; } catch (_) {}
      }
      // Normalize to an array of Pokemon objects
      const shinyMon = shinyArray.map(entry => {
        if (entry == null) return null;
        if (entry.shiny_encounter) {
          const se = entry.shiny_encounter;
          return se.pokemon || se;
        }
        return entry.pokemon || entry;
      }).filter(Boolean);
      if (els.shinyCards) {
        const html = shinyArray.slice(0, 10).map(entry => {
          const mon = entry?.shiny_encounter?.pokemon || entry?.pokemon || entry;
          const time = entry?.shiny_encounter?.encounter_time || entry?.encounter_time || entry?.time || entry?.timestamp;
          return buildPokemonCard(mon, { dateText: formatEncounterTime(time) });
        }).join('');
        els.shinyCards.innerHTML = html;
      }
      if (els.shinyLog) {
        const shItems = shinyArray.map(i => {
          const time = i?.shiny_encounter?.encounter_time || i?.encounter_time || i?.time || i?.timestamp;
          const when = formatEncounterTime(time);
          const mon = i.shiny_encounter?.pokemon || i.pokemon || i;
          const who = toText(mon.name ?? mon.species?.name ?? mon.species_name, '—');
          const lvl = mon.level ? ` Lv ${mon.level}` : '';
          return `<li class="shiny"><span class="pokemon shiny">★ ${who}${lvl}</span><span class="time">${when}</span></li>`;
        }).join('');
        els.shinyLog.innerHTML = shItems;
      }
    } catch (e) {
      // ignore
    }
  }

  async function refreshFps() {
    try {
      const er = await API.get('/encounter_rate').catch(() => null);
      const rate = er && (er.encounter_rate ?? er.rate ?? er.current);
      if (rate != null) updateEncChart(rate);
      const fpsArr = await API.get('/fps').catch(() => null);
      if (Array.isArray(fpsArr) && fpsArr.length) {
        const last = fpsArr[fpsArr.length - 1];
        if (typeof last === 'number') els.liveFps.textContent = String(Math.round(last));
      }
    } catch (e) {
      // ignore
    }
  }

  async function refreshStatic() {
    // pull once at start
    refreshStats();
    refreshOpponent();
    refreshParty();
    refreshPlayer();
    refreshEncounters();
    refreshLogs();
    refreshFps();
  }
})();


