import { SimulationEngine } from './simulation/engine.js';
import { compileCreaturePrompt, compileGodCommand, defaultBlueRule, defaultRedRule, defaultWorldRules } from './rules/compiler.js';
import { analyzeQuestion } from './scientist/analyzer.js';

const defaultPrompt = `빛을 좋아하지만 다른 개체가 너무 많으면 도망가고,\n배가 고프면 작은 생물을 잡아먹는 생명체를 만들어줘.`;
const qaMode = new URLSearchParams(location.search).has('qa');
const state = {
  stats: { blue: 0, red: 0, food: 0, generation: 1, extinctions: 0, dominantTrait: 'High vision radius', fps: 0, active: 0 },
  snapshots: [], events: [], prompt: localStorage.getItem('promptlife:prompt') || defaultPrompt,
  blueRule: { ...defaultBlueRule }, world: { ...defaultWorldRules }, compiled: { ...defaultBlueRule },
  godText: '갑자기 빙하기가 와.', scientistQ: '왜 파란 종이 감소하고 있어?', scientistA: '시뮬레이션 로그가 쌓이면 원인을 설명합니다.',
  running: !qaMode, gpuState: 'initializing…', initialAgents: qaMode ? 800 : 9000, tab: 'prompt', lastRender: 0,
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
  zap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 2-8 12h7l-1 8 8-12h-7Z"/></svg>'
};
const ic = (name) => (icons[name] || '').replace('<svg ', '<svg fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ');

function statRow(label, value, trend='') {
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
      <section class="stage-card" aria-label="생태계 시뮬레이션"><canvas id="sim-canvas" class="sim-canvas"></canvas>
        <div class="stage-topline"><div class="live-chip"><span></span> LIVE ECOLOGY</div><div class="stage-meta"><span id="agent-count">0 agents</span><span id="fps">0 fps</span></div></div>
        <div class="world-tags" id="world-tags"></div>
        <div class="stage-caption"><div><span class="legend blue"></span>Blue <span class="legend red"></span>Red <span class="legend food"></span>Food</div><p id="compute-caption">개체 이동·에너지 갱신 엔진을 초기화하고 있습니다.</p></div>
      </section>
      <aside class="inspector" aria-label="시뮬레이션 통계">
        <section class="panel stats-panel"><div class="panel-title"><div><span>Population</span><small>real-time census</small></div>${ic('activity')}</div>
          ${statRow('Blue','0','flat')}${statRow('Red','0','flat')}${statRow('Food','0')}
          <div class="divider"></div>${statRow('Generation','1')}${statRow('Extinctions','0')}
          <div class="dominant"><small>Dominant trait</small><strong id="dominant">High vision radius</strong><span>selection pressure index</span></div>
        </section>
        <section class="panel mutation-panel"><div class="panel-title"><div><span>Mutation</span><small>single-agent random trait</small></div>${ic('dna')}</div><button class="mutation-button" id="mutate">${ic('atom')}돌연변이 발생<span>randomize one trait</span></button></section>
        <section class="panel event-panel"><div class="panel-title"><div><span>Event stream</span><small>latest ecology events</small></div>${ic('zap')}</div><div class="event-list" id="events"><p class="empty">아직 주요 사건이 없습니다.</p></div></section>
      </aside>
    </main>
    <section class="control-dock" aria-label="시뮬레이션 제어">
      <div class="tabs" role="tablist"><button data-tab="prompt" class="active">${ic('flask')}Creature Prompt</button><button data-tab="god">${ic('snow')}God Mode</button><button data-tab="scientist">${ic('spark')}AI Scientist</button></div>
      <div id="dock"></div>
    </section>
    <footer class="footer"><span>PromptLife v1.0</span><span>Local-first · no API key required · GitHub Pages ready</span></footer>
    <div class="toast" id="toast" role="status" hidden></div>
  </div>`;
  wireBaseEvents();
  renderDock();
  renderWorldTags();
}

function renderDock() {
  const dock = document.querySelector('#dock');
  if (state.tab === 'prompt') {
    dock.innerHTML = `<div class="dock-body prompt-grid"><div class="composer"><label for="prompt">자연어로 생명체의 행동을 정의하세요.</label><textarea id="prompt">${escapeHtml(state.prompt)}</textarea><div class="composer-footer"><div class="agent-control"><span>초기 개체수 <b id="agent-setting">${state.initialAgents.toLocaleString()}</b></span><input aria-label="초기 개체수" id="agent-slider" type="range" min="1000" max="30000" step="1000" value="${state.initialAgents}"></div><button class="primary" id="apply-prompt">${ic('send')}규칙 생성 & 적용</button></div></div><pre class="rule-json" id="rule-json">${escapeHtml(ruleJson())}</pre></div>`;
    const ta = document.querySelector('#prompt'); ta.addEventListener('input', e => { state.prompt = e.target.value; localStorage.setItem('promptlife:prompt', state.prompt); });
    document.querySelector('#agent-slider').addEventListener('input', e => { state.initialAgents = Number(e.target.value); document.querySelector('#agent-setting').textContent = state.initialAgents.toLocaleString(); });
    document.querySelector('#apply-prompt').addEventListener('click', applyPrompt);
  } else if (state.tab === 'god') {
    const commands = ['갑자기 빙하기가 와.', '육식동물을 30마리 투입해.', '물이 없는 지역에서는 죽게 만들어.', '밤이 되면 빨간 생물만 움직이게 해.'];
    dock.innerHTML = `<div class="dock-body god-grid"><div class="composer"><label for="god">세계에 명령하세요.</label><input id="god" value="${escapeAttr(state.godText)}"><div class="quick-commands">${commands.map(c=>`<button data-command="${escapeAttr(c)}">${c}</button>`).join('')}</div></div><button class="primary god-apply" id="apply-god">${ic('zap')}세계 변경 적용</button></div>`;
    const input=document.querySelector('#god'); input.addEventListener('input', e=>state.godText=e.target.value); input.addEventListener('keydown',e=>{if(e.key==='Enter')applyGod()});
    document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>{state.godText=b.dataset.command; input.value=state.godText;}));
    document.querySelector('#apply-god').addEventListener('click',applyGod);
  } else {
    dock.innerHTML = `<div class="dock-body scientist-grid"><div class="composer"><label for="scientist">실제 시뮬레이션 로그를 질문하세요.</label><div class="inline-input"><input id="scientist" value="${escapeAttr(state.scientistQ)}"><button class="primary" id="ask">${ic('send')}분석</button></div><p class="scientist-answer" id="scientist-answer">${escapeHtml(state.scientistA)}</p></div><div class="log-summary"><strong>${state.snapshots.length}</strong><span>snapshots</span><strong>${state.events.length}</strong><span>events</span></div></div>`;
    const q=document.querySelector('#scientist'); q.addEventListener('input',e=>state.scientistQ=e.target.value); q.addEventListener('keydown',e=>{if(e.key==='Enter')askScientist()}); document.querySelector('#ask').addEventListener('click',askScientist);
  }
}

function wireBaseEvents() {
  document.querySelector('#toggle').addEventListener('click', () => { state.running=!state.running; engine.setRunning(state.running); const btn=document.querySelector('#toggle'); btn.innerHTML=state.running?ic('pause'):ic('play'); btn.setAttribute('aria-label',state.running?'시뮬레이션 일시정지':'시뮬레이션 재생'); });
  document.querySelector('#reset').addEventListener('click', reset);
  document.querySelector('#mutate').addEventListener('click', () => notify(engine.mutateRandom() || '변이를 적용할 수 없습니다.'));
  document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{ state.tab=btn.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn)); renderDock(); }));
}

function applyPrompt() { state.blueRule=compileCreaturePrompt(state.prompt,state.blueRule); state.compiled={...state.blueRule}; engine.setBlueRule(state.blueRule); document.querySelector('#rule-json').textContent=ruleJson(); notify('자연어를 행동 규칙으로 컴파일했습니다.'); }
function applyGod() { const result=compileGodCommand(state.godText,state.world); state.world=result.world; engine.setWorld(state.world); if(result.addPredators)engine.addPredators(result.addPredators); engine.applyGod(result.note); renderWorldTags(); notify(result.note); }
function askScientist(){ state.scientistA=analyzeQuestion(state.scientistQ,state.snapshots,state.events); const el=document.querySelector('#scientist-answer'); if(el)el.textContent=state.scientistA; }
function reset(){ state.snapshots=[]; state.events=[]; state.scientistA='새 로그를 수집 중입니다.'; engine.reset(state.initialAgents); renderEvents(); notify('생태계를 초기 조건으로 재시작했습니다.'); }
function ruleJson(){ const r=state.compiled; return JSON.stringify({speed:+r.speed.toFixed(2),visionRadius:+r.visionRadius.toFixed(0),fearDistance:r.fearDistance,reproductionRate:+r.reproductionRate.toFixed(3),foodPreference:r.diet,avoidCrowds:r.avoidCrowds},null,2); }
function renderWorldTags(){ const el=document.querySelector('#world-tags'); if(!el)return; el.innerHTML=`<span>◌ ${Math.round(state.world.temperature*100)}%</span><span>☼ food ×${state.world.foodRegen.toFixed(2)}</span>${state.world.waterDependency?'<span>≈ water survival</span>':''}${state.world.nightRedOnly?'<span>✦ red-only night</span>':''}`; }
function renderEvents(){ const el=document.querySelector('#events'); if(!el)return; if(!state.events.length){el.innerHTML='<p class="empty">아직 주요 사건이 없습니다.</p>';return;} el.innerHTML=[...state.events].reverse().slice(0,5).map(e=>`<div class="event"><time>${e.t.toFixed(0)}s</time><span>${escapeHtml(e.message)}</span></div>`).join(''); }
function trendFor(key){ if(state.snapshots.length<2)return'flat'; const a=state.snapshots.at(-2)[key],b=state.snapshots.at(-1)[key]; return b>=a?'up':'down'; }
function updateStats(s){ state.stats=s; const now=performance.now(); if(now-state.lastRender<180)return; state.lastRender=now; setStat('blue',s.blue.toLocaleString(),trendFor('blue')); setStat('red',s.red.toLocaleString(),trendFor('red')); setStat('food',s.food.toLocaleString()); setStat('generation',s.generation); setStat('extinctions',s.extinctions); document.querySelector('#dominant').textContent=s.dominantTrait; document.querySelector('#agent-count').textContent=`${s.active.toLocaleString()} agents`; document.querySelector('#fps').textContent=`${s.fps} fps`; }
function setStat(key,value,trend=''){ const el=document.querySelector(`[data-stat="${key}"]`); if(!el)return; const arrow=trend==='up'?'↑':trend==='down'?'↓':trend==='flat'?'•':''; el.innerHTML=`${value}${arrow?`<span class="trend ${trend}">${arrow}</span>`:''}`; }
function notify(msg){ const t=document.querySelector('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(notify.timer); notify.timer=setTimeout(()=>t.hidden=true,2600); }
function escapeHtml(s=''){ return s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escapeAttr(s=''){ return escapeHtml(s).replace(/"/g,'&quot;'); }

renderShell();
const engine = new SimulationEngine({
  canvas: document.querySelector('#sim-canvas'), blueRule: state.blueRule, redRule: defaultRedRule, world: state.world, initialAgents: state.initialAgents,
  forceCpu: qaMode, onStats: updateStats,
  onSnapshot: snap => { state.snapshots=[...state.snapshots.slice(-119),snap]; if(state.tab==='scientist')renderDock(); },
  onEvent: event => { state.events=[...state.events.slice(-39),event]; renderEvents(); },
  onGpuState: label => { state.gpuState=label; const gl=document.querySelector('#gpu-label'); if(gl)gl.textContent=label; document.querySelector('.status-dot')?.classList.toggle('live',label.includes('WebGPU')); const cc=document.querySelector('#compute-caption'); if(cc)cc.textContent=`개체의 이동·에너지 갱신은 ${label.includes('WebGPU')?'WebGPU compute shader':'CPU deterministic fallback'}로 실행됩니다.`; }
});

if (qaMode) engine.setRunning(false);
