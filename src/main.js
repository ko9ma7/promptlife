import { SimulationEngine } from './simulation/engine.js';
import { compileCreaturePrompt, compileGodCommand, defaultBlueRule, defaultRedRule, defaultWorldRules } from './rules/compiler.js';
import { analyzeQuestion } from './scientist/analyzer.js';

const defaultPrompt = `빛을 좋아하지만 다른 개체가 너무 많으면 도망가고,\n배가 고프면 작은 생물을 잡아먹는 생명체를 만들어줘.`;
const qaMode = new URLSearchParams(location.search).has('qa');
const state = {
  stats: { blue: 0, red: 0, food: 0, generation: 1, extinctions: 0, dominantTrait: 'High vision radius', fps: 0, active: 0 },
  snapshots: [],
  events: [],
  prompt: localStorage.getItem('promptlife:prompt') || defaultPrompt,
  blueRule: { ...defaultBlueRule },
  world: { ...defaultWorldRules },
  compiled: { ...defaultBlueRule },
  godText: '갑자기 빙하기가 와.',
  scientistQ: '왜 파란 종이 감소하고 있어?',
  scientistA: '시뮬레이션 로그가 쌓이면 원인을 설명합니다.',
  running: !qaMode,
  gpuState: 'initializing…',
  initialAgents: qaMode ? 800 : 9000,
  tab: 'prompt',
  lastRender: 0,
  lastSelectionRefresh: 0,
  view: { zoom: 1, centerX: 0.5, centerY: 0.5, filter: 'all' },
  stageRatio: localStorage.getItem('promptlife:stage-ratio') || '16:9',
  selectedAgent: null,
  capture: { width: 1600, isolate: 'blue', showGrid: true, showSelection: true },
  exports: [],
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const wrap01 = (n) => {
  const v = n % 1;
  return v < 0 ? v + 1 : v;
};

const icons = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 8v8M14.5 8v8"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2 6"/><path d="M4 5v6h6"/></svg>',
  activity: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  dna: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3c5 3 5 15 10 18M17 3C12 6 12 18 7 21M8 7h8M8 17h8"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z"/><path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8Z"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 8-16 8 3-8Z"/><path d="M7 12h13"/></svg>',
  atom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/></svg>',
  snow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11M8.5 4.5 12 7l3.5-2.5M8.5 19.5 12 17l3.5 2.5"/></svg>',
  flask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 17l-5-8V3"/><path d="M7.5 15h9"/></svg>',
  zap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h7l-1 8 8-12h-7Z"/></svg>',
  zoomIn: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4.2-4.2"/></svg>',
  zoomOut: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4.2-4.2"/></svg>',
  focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="2.5"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-4.2-4.2a1.5 1.5 0 0 0-2.1 0L9 16.5l-2.3-2.3a1.5 1.5 0 0 0-2.1 0L3 15.8"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const ic = (name) => (icons[name] || '').replace('<svg ', '<svg fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ');

function statRow(label, value, trend = '') {
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '•' : '';
  return `<div class="stat-row"><div class="stat-label"><span>${label}</span></div><div class="stat-value" data-stat="${label.toLowerCase()}">${value}${arrow ? `<span class="trend ${trend}">${arrow}</span>` : ''}</div></div>`;
}

function renderShell() {
  document.querySelector('#root').innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand" aria-label="PromptLife 홈"><div class="brand-mark"><span></span><span></span><span></span></div><div><strong>PromptLife</strong><small>Browser Evolution Lab</small></div></div>
      <div class="top-actions"><div class="engine-status"><span class="status-dot"></span><span id="gpu-label">${state.gpuState}</span></div><button class="icon-button" id="toggle" aria-label="${state.running ? '시뮬레이션 일시정지' : '시뮬레이션 재생'}">${ic(state.running ? 'pause' : 'play')}</button><button class="icon-button" id="reset" aria-label="초기화">${ic('reset')}</button></div>
    </header>
    <main class="workspace">
      <div class="main-column">
        <section class="stage-card" data-ratio="${state.stageRatio}" aria-label="생태계 시뮬레이션">
          <canvas id="sim-canvas" class="sim-canvas"></canvas>
          <div class="stage-topline"><div class="live-chip"><span></span> LIVE ECOLOGY</div><div class="stage-meta"><span id="agent-count">0 agents</span><span id="fps">0 fps</span></div></div>
          <div class="stage-controls"><button class="mini-button" id="zoom-out" aria-label="축소">${ic('zoomOut')}</button><button class="mini-button" id="zoom-in" aria-label="확대">${ic('zoomIn')}</button><button class="mini-button" id="focus-selected" aria-label="선택 대상 확대">${ic('focus')}</button><button class="mini-button" id="fit-view" aria-label="보기 초기화">${ic('reset')}</button></div>
          <div class="stage-hint">마우스 휠 확대 · 드래그 이동 · 클릭 검사 · WEBP 저장 가능</div>
          <div class="world-tags" id="world-tags"></div>
          <div class="stage-caption"><div><span class="legend blue"></span>Blue <span class="legend red"></span>Red <span class="legend food"></span>Food</div><p id="compute-caption">개체 이동·에너지 갱신 엔진을 초기화하고 있습니다.</p></div>
        </section>
        <section class="control-dock" aria-label="시뮬레이션 제어">
          <div class="tabs" role="tablist"><button data-tab="prompt" class="active">${ic('flask')}Creature Prompt</button><button data-tab="god">${ic('snow')}God Mode</button><button data-tab="scientist">${ic('spark')}AI Scientist</button></div>
          <div id="dock"></div>
        </section>
        <footer class="footer"><span>PromptLife v1.2</span><span>Responsive lab · Inspect · Zoom · WEBP export</span></footer>
      </div>
      <aside class="inspector" aria-label="시뮬레이션 통계">
        <section class="panel stats-panel"><div class="panel-title"><div><span>Population</span><small>real-time census</small></div>${ic('activity')}</div>
          ${statRow('Blue', '0', 'flat')}${statRow('Red', '0', 'flat')}${statRow('Food', '0')}
          <div class="divider"></div>${statRow('Generation', '1')}${statRow('Extinctions', '0')}
          <div class="dominant"><small>Dominant trait</small><strong id="dominant">High vision radius</strong><span>selection pressure index</span></div>
        </section>
        <section class="panel" id="view-panel"></section>
        <section class="panel mutation-panel"><div class="panel-title"><div><span>Mutation</span><small>single-agent random trait</small></div>${ic('dna')}</div><button class="mutation-button" id="mutate">${ic('atom')}돌연변이 발생<span>randomize one trait</span></button></section>
        <section class="panel" id="capture-panel"></section>
        <section class="panel event-panel"><div class="panel-title"><div><span>Event stream</span><small>latest ecology events</small></div>${ic('zap')}</div><div class="event-list" id="events"><p class="empty">아직 주요 사건이 없습니다.</p></div></section>
      </aside>
    </main>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>`;
  wireBaseEvents();
  renderDock();
  renderWorldTags();
  renderViewPanel();
  renderCapturePanel();
}

function renderDock() {
  const dock = document.querySelector('#dock');
  if (state.tab === 'prompt') {
    dock.innerHTML = `<div class="dock-body prompt-grid"><div class="composer"><label for="prompt">자연어로 생명체의 행동을 정의하세요.</label><textarea id="prompt">${escapeHtml(state.prompt)}</textarea><div class="composer-footer"><div class="agent-control"><span>초기 개체수 <b id="agent-setting">${state.initialAgents.toLocaleString()}</b></span><input aria-label="초기 개체수" id="agent-slider" type="range" min="1000" max="30000" step="1000" value="${state.initialAgents}"></div><button class="primary" id="apply-prompt">${ic('send')}규칙 생성 & 적용</button></div></div><pre class="rule-json" id="rule-json">${escapeHtml(ruleJson())}</pre></div>`;
    const ta = document.querySelector('#prompt');
    ta.addEventListener('input', (e) => { state.prompt = e.target.value; localStorage.setItem('promptlife:prompt', state.prompt); });
    document.querySelector('#agent-slider').addEventListener('input', (e) => { state.initialAgents = Number(e.target.value); document.querySelector('#agent-setting').textContent = state.initialAgents.toLocaleString(); });
    document.querySelector('#apply-prompt').addEventListener('click', applyPrompt);
  } else if (state.tab === 'god') {
    const commands = ['갑자기 빙하기가 와.', '육식동물을 30마리 투입해.', '물이 없는 지역에서는 죽게 만들어.', '밤이 되면 빨간 생물만 움직이게 해.'];
    dock.innerHTML = `<div class="dock-body god-grid"><div class="composer"><label for="god">세계에 명령하세요.</label><input id="god" value="${escapeAttr(state.godText)}"><div class="quick-commands">${commands.map((c) => `<button data-command="${escapeAttr(c)}">${c}</button>`).join('')}</div></div><button class="primary god-apply" id="apply-god">${ic('zap')}세계 변경 적용</button></div>`;
    const input = document.querySelector('#god');
    input.addEventListener('input', (e) => state.godText = e.target.value);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyGod(); });
    document.querySelectorAll('[data-command]').forEach((b) => b.addEventListener('click', () => { state.godText = b.dataset.command; input.value = state.godText; }));
    document.querySelector('#apply-god').addEventListener('click', applyGod);
  } else {
    dock.innerHTML = `<div class="dock-body scientist-grid"><div class="composer"><label for="scientist">실제 시뮬레이션 로그를 질문하세요.</label><div class="inline-input"><input id="scientist" value="${escapeAttr(state.scientistQ)}"><button class="primary" id="ask">${ic('send')}분석</button></div><p class="scientist-answer" id="scientist-answer">${escapeHtml(state.scientistA)}</p></div><div class="log-summary"><strong>${state.snapshots.length}</strong><span>snapshots</span><strong>${state.events.length}</strong><span>events</span></div></div>`;
    const q = document.querySelector('#scientist');
    q.addEventListener('input', (e) => state.scientistQ = e.target.value);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') askScientist(); });
    document.querySelector('#ask').addEventListener('click', askScientist);
  }
}

function renderViewPanel() {
  const panel = document.querySelector('#view-panel');
  if (!panel) return;
  panel.innerHTML = `<div class="panel-title"><div><span>Inspect & Zoom</span><small>click an agent to inspect</small></div>${ic('eye')}</div>
  <div class="zoom-block"><div class="zoom-head"><strong id="zoom-value">1.0×</strong><span id="view-center">x 0.50 · y 0.50</span></div><input id="view-zoom" type="range" min="100" max="800" step="5" value="${Math.round(state.view.zoom * 100)}"></div>
  <div class="segmented" id="filter-buttons">
    ${['all', 'blue', 'red', 'food'].map((mode) => `<button data-filter="${mode}">${filterLabel(mode)}</button>`).join('')}
  </div>
  <div class="ratio-row"><span>화면 비율</span><div class="ratio-buttons">${['16:9','4:3','1:1'].map((ratio) => `<button data-ratio-choice="${ratio}">${ratio}</button>`).join('')}</div></div>
  <div class="mini-actions"><button class="mini-outline" id="center-selected">${ic('target')}선택 대상 확대</button><button class="mini-outline" id="clear-selection">${ic('x')}선택 해제</button></div>
  <div id="selected-agent" class="selected-agent"></div>`;
  panel.querySelector('#view-zoom').addEventListener('input', (e) => setZoom(Number(e.target.value) / 100));
  panel.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  panel.querySelectorAll('[data-ratio-choice]').forEach((button) => button.addEventListener('click', () => setStageRatio(button.dataset.ratioChoice)));
  panel.querySelector('#center-selected').addEventListener('click', focusSelectedAgent);
  panel.querySelector('#clear-selection').addEventListener('click', clearSelection);
  updateViewPanel();
}

function updateViewPanel() {
  document.querySelector('#zoom-value')?.replaceChildren(document.createTextNode(`${state.view.zoom.toFixed(1)}×`));
  const centerText = `x ${state.view.centerX.toFixed(2)} · y ${state.view.centerY.toFixed(2)}`;
  document.querySelector('#view-center')?.replaceChildren(document.createTextNode(centerText));
  const zoomInput = document.querySelector('#view-zoom');
  if (zoomInput && Number(zoomInput.value) !== Math.round(state.view.zoom * 100)) zoomInput.value = String(Math.round(state.view.zoom * 100));
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.view.filter));
  document.querySelectorAll('[data-ratio-choice]').forEach((button) => button.classList.toggle('active', button.dataset.ratioChoice === state.stageRatio));
  const selected = document.querySelector('#selected-agent');
  if (!selected) return;
  if (!state.selectedAgent) {
    selected.innerHTML = `<div class="selected-empty">${ic('eye')}캔버스를 클릭하면 개체 정보를 확대해서 볼 수 있습니다.</div>`;
    return;
  }
  const a = state.selectedAgent;
  selected.innerHTML = `
    <div class="selected-head"><span class="species-chip ${a.species.toLowerCase()}">${a.species}</span><strong>#${a.index}</strong><span>Gen ${Math.round(a.generation)}</span></div>
    <div class="selected-grid">
      <span>Energy<b>${a.energy.toFixed(2)}</b></span>
      <span>Age<b>${a.age.toFixed(1)}s</b></span>
      <span>Speed<b>${a.speed.toFixed(2)}</b></span>
      <span>Vision<b>${a.vision.toFixed(0)}</b></span>
      <span>Repro<b>${a.reproduction.toFixed(3)}</b></span>
      <span>Size<b>${a.size.toFixed(2)}</b></span>
    </div>
    <p class="selected-copy">선택된 개체 중심으로 확대하거나, 현재 화면을 WEBP로 저장할 수 있습니다.</p>`;
}

function renderCapturePanel() {
  const panel = document.querySelector('#capture-panel');
  if (!panel) return;
  panel.innerHTML = `<div class="panel-title"><div><span>Export Studio</span><small>save simulation as .webp</small></div>${ic('image')}</div>
    <div class="capture-settings">
      <label>출력 너비<select id="capture-width"><option value="1280">1280px</option><option value="1600">1600px</option><option value="2048">2048px</option></select></label>
      <label>색상 분리<select id="capture-isolate"><option value="blue">Blue만</option><option value="red">Red만</option><option value="food">Food만</option></select></label>
    </div>
    <div class="capture-toggles"><label><input type="checkbox" id="capture-grid" ${state.capture.showGrid ? 'checked' : ''}> 격자 포함</label><label><input type="checkbox" id="capture-selection" ${state.capture.showSelection ? 'checked' : ''}> 선택 링 포함</label></div>
    <div class="export-buttons"><button class="primary" id="save-current">${ic('image')}현재 보기 저장</button><button class="mini-outline" id="save-zoom">${ic('zoomIn')}확대 저장</button><button class="mini-outline" id="save-isolate">${ic('spark')}선택 색만 저장</button></div>
    <div class="export-gallery" id="export-gallery"></div>`;
  const widthInput = panel.querySelector('#capture-width');
  widthInput.value = String(state.capture.width);
  widthInput.addEventListener('change', (e) => state.capture.width = Number(e.target.value));
  const isolateInput = panel.querySelector('#capture-isolate');
  isolateInput.value = state.capture.isolate;
  isolateInput.addEventListener('change', (e) => state.capture.isolate = e.target.value);
  panel.querySelector('#capture-grid').addEventListener('change', (e) => state.capture.showGrid = e.target.checked);
  panel.querySelector('#capture-selection').addEventListener('change', (e) => state.capture.showSelection = e.target.checked);
  panel.querySelector('#save-current').addEventListener('click', () => exportScene('current'));
  panel.querySelector('#save-zoom').addEventListener('click', () => exportScene('zoom'));
  panel.querySelector('#save-isolate').addEventListener('click', () => exportScene('isolate'));
  updateExportGallery();
}

function updateExportGallery() {
  const el = document.querySelector('#export-gallery');
  if (!el) return;
  if (!state.exports.length) {
    el.innerHTML = `<p class="gallery-empty">최근 저장한 WEBP가 여기에 표시됩니다.</p>`;
    return;
  }
  el.innerHTML = state.exports.slice(0, 5).map((item) => `
    <article class="export-item">
      <img src="${item.url}" alt="${item.fileName}">
      <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.fileName)}</small><a href="${item.url}" download="${item.fileName}">다시 다운로드</a></div>
    </article>`).join('');
}

function wireBaseEvents() {
  document.querySelector('#toggle').addEventListener('click', () => {
    state.running = !state.running;
    engine.setRunning(state.running);
    const btn = document.querySelector('#toggle');
    btn.innerHTML = state.running ? ic('pause') : ic('play');
    btn.setAttribute('aria-label', state.running ? '시뮬레이션 일시정지' : '시뮬레이션 재생');
  });
  document.querySelector('#reset').addEventListener('click', reset);
  document.querySelector('#mutate').addEventListener('click', () => {
    notify(engine.mutateRandom() || '변이를 적용할 수 없습니다.');
    refreshSelection(true);
  });
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('active', x === btn));
    renderDock();
  }));
  document.querySelector('#zoom-in').addEventListener('click', () => setZoom(state.view.zoom * 1.25));
  document.querySelector('#zoom-out').addEventListener('click', () => setZoom(state.view.zoom / 1.25));
  document.querySelector('#fit-view').addEventListener('click', resetView);
  document.querySelector('#focus-selected').addEventListener('click', focusSelectedAgent);
}

function bindCanvasInteractions() {
  const canvas = document.querySelector('#sim-canvas');
  let drag = null;

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const anchor = engine.screenToWorld(offsetX, offsetY);
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    const nextZoom = clamp(state.view.zoom * factor, 1, 8);
    const sx = offsetX / rect.width - 0.5;
    const sy = offsetY / rect.height - 0.5;
    state.view.zoom = nextZoom;
    state.view.centerX = wrap01(anchor.x - sx / nextZoom);
    state.view.centerY = wrap01(anchor.y - sy / nextZoom);
    syncView();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, centerX: state.view.centerX, centerY: state.view.centerY, width: rect.width, height: rect.height, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / drag.width;
    const dy = (e.clientY - drag.y) / drag.height;
    if (Math.abs(dx) > 0.004 || Math.abs(dy) > 0.004) drag.moved = true;
    state.view.centerX = wrap01(drag.centerX - dx / state.view.zoom);
    state.view.centerY = wrap01(drag.centerY - dy / state.view.zoom);
    syncView(false);
  });

  const endDrag = (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const moved = drag.moved;
    drag = null;
    if (!moved) {
      inspectAt(e.clientX - rect.left, e.clientY - rect.top);
    } else {
      updateViewPanel();
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { drag = null; updateViewPanel(); });
}

function inspectAt(offsetX, offsetY) {
  const world = engine.screenToWorld(offsetX, offsetY);
  const picked = engine.pickAgentAtWorld(world.x, world.y, 0.04 / state.view.zoom);
  if (!picked) {
    clearSelection();
    notify('선택 가능한 개체를 찾지 못했습니다. 확대 후 다시 클릭해 보세요.');
    return;
  }
  state.selectedAgent = picked;
  engine.setSelectedAgent(picked.index);
  updateViewPanel();
  notify(`${picked.species} #${picked.index} 개체를 선택했습니다.`);
}

function syncView(refresh = true) {
  engine.setView(state.view);
  state.view = engine.getView();
  if (refresh) updateViewPanel();
}

function setZoom(value) {
  state.view.zoom = clamp(value, 1, 8);
  syncView();
}

function setFilter(filter) {
  state.view.filter = filter;
  syncView();
}

function setStageRatio(ratio) {
  if (!['16:9', '4:3', '1:1'].includes(ratio)) return;
  state.stageRatio = ratio;
  localStorage.setItem('promptlife:stage-ratio', ratio);
  const stage = document.querySelector('.stage-card');
  if (stage) stage.dataset.ratio = ratio;
  updateViewPanel();
  notify(`시뮬레이션 화면을 ${ratio} 비율로 변경했습니다.`);
}

function resetView() {
  state.view = { ...state.view, zoom: 1, centerX: 0.5, centerY: 0.5 };
  syncView();
  notify('보기 배율과 중심을 초기화했습니다.');
}

function focusSelectedAgent() {
  if (!state.selectedAgent) {
    notify('먼저 캔버스에서 개체를 선택해 주세요.');
    return;
  }
  state.view.centerX = state.selectedAgent.x;
  state.view.centerY = state.selectedAgent.y;
  state.view.zoom = Math.max(state.view.zoom, 3.2);
  syncView();
  notify(`Blue #${state.selectedAgent.index}`.replace('Blue', state.selectedAgent.species) + ' 중심으로 확대했습니다.');
}

function clearSelection() {
  state.selectedAgent = null;
  engine.clearSelection();
  updateViewPanel();
}

async function exportScene(mode) {
  try {
    const canvas = document.createElement('canvas');
    const stageRect = document.querySelector('#sim-canvas').getBoundingClientRect();
    const width = Number(state.capture.width) || 1600;
    const height = Math.max(720, Math.round(width * ((stageRect.height || 9) / (stageRect.width || 16))));
    let view = { ...state.view };
    let filter = state.view.filter;
    if (mode === 'zoom') {
      if (state.selectedAgent) {
        view.centerX = state.selectedAgent.x;
        view.centerY = state.selectedAgent.y;
      }
      view.zoom = Math.max(view.zoom, 3.6);
    }
    if (mode === 'isolate') {
      filter = state.capture.isolate;
      if (state.selectedAgent && filter === 'all') filter = state.selectedAgent.species.toLowerCase();
    }
    engine.renderToCanvas(canvas, { width, height, view, filter, showSelection: state.capture.showSelection, showGrid: state.capture.showGrid });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.95));
    if (!blob) throw new Error('WEBP 인코딩 실패');
    const stamp = timestamp();
    const fileName = `promptlife-${mode}-${filter}-${stamp}.webp`.replace(/-all-/, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    state.exports.unshift({ url, fileName, label: exportLabel(mode, filter) });
    if (state.exports.length > 6) {
      const removed = state.exports.pop();
      URL.revokeObjectURL(removed.url);
    }
    updateExportGallery();
    notify(`${fileName} 저장을 시작했습니다.`);
  } catch (error) {
    notify(`저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

function exportLabel(mode, filter) {
  if (mode === 'zoom') return `확대 저장 · ${filterLabel(filter)}`;
  if (mode === 'isolate') return `색상 분리 저장 · ${filterLabel(filter)}`;
  return `현재 보기 저장 · ${filterLabel(filter)}`;
}

function filterLabel(mode) {
  return ({ all: 'All', blue: 'Blue', red: 'Red', food: 'Food' }[mode] || 'All');
}

function refreshSelection(force = false) {
  const now = performance.now();
  if (!force && now - state.lastSelectionRefresh < 420) return;
  state.lastSelectionRefresh = now;
  if (!state.selectedAgent) return;
  const next = engine.getAgentInfo(state.selectedAgent.index);
  if (!next) {
    state.selectedAgent = null;
  } else {
    state.selectedAgent = next;
  }
  updateViewPanel();
}

function applyPrompt() {
  state.blueRule = compileCreaturePrompt(state.prompt, state.blueRule);
  state.compiled = { ...state.blueRule };
  engine.setBlueRule(state.blueRule);
  document.querySelector('#rule-json').textContent = ruleJson();
  notify('자연어를 행동 규칙으로 컴파일했습니다.');
}

function applyGod() {
  const result = compileGodCommand(state.godText, state.world);
  state.world = result.world;
  engine.setWorld(state.world);
  if (result.addPredators) engine.addPredators(result.addPredators);
  engine.applyGod(result.note);
  renderWorldTags();
  notify(result.note);
}

function askScientist() {
  state.scientistA = analyzeQuestion(state.scientistQ, state.snapshots, state.events);
  const el = document.querySelector('#scientist-answer');
  if (el) el.textContent = state.scientistA;
}

function reset() {
  state.snapshots = [];
  state.events = [];
  state.scientistA = '새 로그를 수집 중입니다.';
  state.selectedAgent = null;
  engine.clearSelection();
  engine.reset(state.initialAgents);
  resetView();
  renderEvents();
  if (state.tab === 'scientist') renderDock();
  notify('생태계를 초기 조건으로 재시작했습니다.');
}

function ruleJson() {
  const r = state.compiled;
  return JSON.stringify({
    speed: +r.speed.toFixed(2),
    visionRadius: +r.visionRadius.toFixed(0),
    fearDistance: r.fearDistance,
    reproductionRate: +r.reproductionRate.toFixed(3),
    foodPreference: r.diet,
    avoidCrowds: r.avoidCrowds,
  }, null, 2);
}

function renderWorldTags() {
  const el = document.querySelector('#world-tags');
  if (!el) return;
  el.innerHTML = `<span>◌ ${Math.round(state.world.temperature * 100)}%</span><span>☼ food ×${state.world.foodRegen.toFixed(2)}</span><span>⌕ zoom ${state.view.zoom.toFixed(1)}×</span><span>◍ ${filterLabel(state.view.filter)}</span>${state.world.waterDependency ? '<span>≈ water survival</span>' : ''}${state.world.nightRedOnly ? '<span>✦ red-only night</span>' : ''}`;
}

function renderEvents() {
  const el = document.querySelector('#events');
  if (!el) return;
  if (!state.events.length) {
    el.innerHTML = '<p class="empty">아직 주요 사건이 없습니다.</p>';
    return;
  }
  el.innerHTML = [...state.events].reverse().slice(0, 5).map((e) => `<div class="event"><time>${e.t.toFixed(0)}s</time><span>${escapeHtml(e.message)}</span></div>`).join('');
}

function trendFor(key) {
  if (state.snapshots.length < 2) return 'flat';
  const a = state.snapshots.at(-2)[key], b = state.snapshots.at(-1)[key];
  return b >= a ? 'up' : 'down';
}

function updateStats(s) {
  state.stats = s;
  const now = performance.now();
  if (now - state.lastRender < 180) {
    refreshSelection();
    return;
  }
  state.lastRender = now;
  setStat('blue', s.blue.toLocaleString(), trendFor('blue'));
  setStat('red', s.red.toLocaleString(), trendFor('red'));
  setStat('food', s.food.toLocaleString());
  setStat('generation', s.generation);
  setStat('extinctions', s.extinctions);
  document.querySelector('#dominant').textContent = s.dominantTrait;
  document.querySelector('#agent-count').textContent = `${s.active.toLocaleString()} agents`;
  document.querySelector('#fps').textContent = `${s.fps} fps`;
  refreshSelection();
}

function setStat(key, value, trend = '') {
  const el = document.querySelector(`[data-stat="${key}"]`);
  if (!el) return;
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'flat' ? '•' : '';
  el.innerHTML = `${value}${arrow ? `<span class="trend ${trend}">${arrow}</span>` : ''}`;
}

function notify(msg) {
  const t = document.querySelector('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => t.hidden = true, 2600);
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function escapeHtml(s = '') { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function escapeAttr(s = '') { return escapeHtml(s).replace(/"/g, '&quot;'); }

renderShell();
const engine = new SimulationEngine({
  canvas: document.querySelector('#sim-canvas'),
  blueRule: state.blueRule,
  redRule: defaultRedRule,
  world: state.world,
  initialAgents: state.initialAgents,
  view: state.view,
  forceCpu: qaMode,
  onStats: updateStats,
  onSnapshot: (snap) => {
    state.snapshots = [...state.snapshots.slice(-119), snap];
    if (state.tab === 'scientist') renderDock();
  },
  onEvent: (event) => {
    state.events = [...state.events.slice(-39), event];
    renderEvents();
  },
  onGpuState: (label) => {
    state.gpuState = label;
    const gl = document.querySelector('#gpu-label');
    if (gl) gl.textContent = label;
    document.querySelector('.status-dot')?.classList.toggle('live', label.includes('WebGPU'));
    const cc = document.querySelector('#compute-caption');
    if (cc) cc.textContent = `개체의 이동·에너지 갱신은 ${label.includes('WebGPU') ? 'WebGPU compute shader' : 'CPU deterministic fallback'}로 실행됩니다.`;
  },
});

bindCanvasInteractions();
syncView();
if (qaMode) engine.setRunning(false);
