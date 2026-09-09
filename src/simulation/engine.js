const STRIDE = 16;
const MAX_AGENTS = 50000;

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const wrap01 = (n) => {
  const v = n % 1;
  return v < 0 ? v + 1 : v;
};
const wrapDelta = (d) => {
  let x = d;
  while (x > 0.5) x -= 1;
  while (x < -0.5) x += 1;
  return x;
};

export class SimulationEngine {
  canvas;
  ctx;
  data = new Float32Array(MAX_AGENTS * STRIDE);
  nextIndex = 0;
  blueRule;
  redRule;
  world;
  random = mulberry32(1337);
  running = true;
  raf = 0;
  lastFrame = performance.now();
  lastSync = 0;
  lastSnapshot = 0;
  started = performance.now();
  generation = 1;
  extinctions = 0;
  seenAlive = [true, true];
  food = 12500;
  gpu = null;
  frameCounter = 0;
  fps = 60;
  fpsStamp = performance.now();
  events = [];
  selectedAgentIndex = -1;
  view = { zoom: 1, centerX: 0.5, centerY: 0.5, filter: 'all' };
  forceCpu = false;
  onStats;
  onSnapshot;
  onEvent;
  onGpuState;

  constructor(opts) {
    this.canvas = opts.canvas;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D를 초기화할 수 없습니다.');
    this.ctx = ctx;
    this.blueRule = { ...opts.blueRule };
    this.redRule = { ...opts.redRule };
    this.world = { ...opts.world };
    this.view = this.normalizeView(opts.view || this.view);
    this.onStats = opts.onStats;
    this.onSnapshot = opts.onSnapshot;
    this.onEvent = opts.onEvent;
    this.onGpuState = opts.onGpuState;
    this.forceCpu = !!opts.forceCpu;
    this.seed(opts.initialAgents);
    this.initGpu().finally(() => this.loop(performance.now()));
  }

  normalizeView(view) {
    return {
      zoom: clamp(Number(view?.zoom || 1), 1, 8),
      centerX: wrap01(Number(view?.centerX ?? 0.5)),
      centerY: wrap01(Number(view?.centerY ?? 0.5)),
      filter: ['all', 'blue', 'red', 'food'].includes(view?.filter) ? view.filter : 'all',
    };
  }

  t() {
    return (performance.now() - this.started) / 1000;
  }

  emit(type, message) {
    const event = { t: this.t(), type, message };
    this.events.push(event);
    if (this.events.length > 80) this.events.shift();
    this.onEvent(event);
  }

  seed(count) {
    this.data.fill(0);
    this.nextIndex = 0;
    this.selectedAgentIndex = -1;
    this.view = this.normalizeView({ ...this.view, zoom: 1, centerX: 0.5, centerY: 0.5 });
    const blueCount = Math.max(10, Math.floor(count * 0.93));
    const redCount = Math.max(10, count - blueCount);
    for (let i = 0; i < blueCount; i++) this.spawn(0, false);
    for (let i = 0; i < redCount; i++) this.spawn(1, false);
    this.food = Math.round(count * 1.05);
    this.generation = 1;
    this.extinctions = 0;
    this.seenAlive = [true, true];
    this.started = performance.now();
  }

  writeAgent(index, species, parentIndex) {
    const o = index * STRIDE;
    const rule = species === 0 ? this.blueRule : this.redRule;
    let x = this.random();
    let y = this.random();
    let generation = 1;
    if (parentIndex !== undefined) {
      const p = parentIndex * STRIDE;
      x = clamp(this.data[p] + (this.random() - 0.5) * 0.025, 0, 1);
      y = clamp(this.data[p + 1] + (this.random() - 0.5) * 0.025, 0, 1);
      generation = this.data[p + 11] + 1;
    }
    this.data[o] = x;
    this.data[o + 1] = y;
    this.data[o + 2] = (this.random() - 0.5) * 0.25;
    this.data[o + 3] = (this.random() - 0.5) * 0.25;
    this.data[o + 4] = 0.82 + this.random() * 0.28;
    this.data[o + 5] = 0;
    this.data[o + 6] = species;
    this.data[o + 7] = 1;
    this.data[o + 8] = rule.speed * (0.92 + this.random() * 0.16);
    this.data[o + 9] = rule.visionRadius * (0.94 + this.random() * 0.12);
    this.data[o + 10] = rule.reproductionRate * (0.92 + this.random() * 0.16);
    this.data[o + 11] = generation;
    this.data[o + 12] = rule.size * (0.93 + this.random() * 0.14);
    this.data[o + 13] = rule.lifespan * (0.95 + this.random() * 0.1);
    this.data[o + 14] = rule.aggression;
    this.data[o + 15] = (this.random() - 0.5) * 0.08;
    this.generation = Math.max(this.generation, generation);
  }

  spawn(species, mutate, parentIndex) {
    if (this.nextIndex >= MAX_AGENTS) return -1;
    const idx = this.nextIndex++;
    this.writeAgent(idx, species, parentIndex);
    if (mutate) this.mutateAgent(idx, false);
    return idx;
  }

  async initGpu() {
    if (this.forceCpu || !('gpu' in navigator)) {
      this.onGpuState('CPU fallback');
      return;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) throw new Error('adapter unavailable');
      const device = await adapter.requestDevice();
      const size = this.data.byteLength;
      const agentBuffer = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
      const uniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      const readBuffer = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const shader = device.createShaderModule({ code: `
struct Agent { posVel: vec4f, life: vec4f, traitsA: vec4f, traitsB: vec4f }
struct Params { dt: f32, step: f32, temp: f32, foodLevel: f32, moveCost: f32, lightX: f32, lightY: f32, blueCount: f32, redCount: f32, preyX: f32, preyY: f32, nightRedOnly: f32, waterDependency: f32, crowd: f32, blueAvoid: f32, blueLight: f32 }
@group(0) @binding(0) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(1) var<uniform> p: Params;
fn hash(n: f32) -> f32 { return fract(sin(n * 91.3458 + p.step * 0.017) * 47453.5453); }
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&agents)) { return; }
  var a = agents[i];
  if (a.life.w < 0.5) { return; }
  let species = a.life.z;
  var pos = a.posVel.xy;
  var vel = a.posVel.zw;
  let speed = a.traitsA.x;
  let phase = hash(f32(i)) * 6.283185;
  var desired = vec2f(cos(phase), sin(phase)) * 0.18;
  if (species < 0.5) {
    let light = normalize(vec2f(p.lightX, p.lightY) - pos + vec2f(0.0001));
    let visionFactor = clamp(a.traitsA.y / 80.0, 0.5, 1.7);
    desired += light * 0.32 * p.blueLight * visionFactor;
    if (p.blueAvoid > 0.01 && p.crowd > 0.56) { desired += normalize(pos - vec2f(0.5, 0.5) + vec2f(0.001)) * 0.22 * p.blueAvoid; }
  } else {
    let visionFactor = clamp(a.traitsA.y / 100.0, 0.55, 1.8);
    desired += normalize(vec2f(p.preyX, p.preyY) - pos + vec2f(0.0001)) * 0.48 * visionFactor;
  }
  let frozen = p.nightRedOnly > 0.5 && species < 0.5;
  if (!frozen) {
    vel = vel * 0.91 + desired * p.dt * speed * 1.8;
    let m = length(vel);
    if (m > 0.22 * speed) { vel = normalize(vel) * 0.22 * speed; }
    pos += vel * p.dt * 0.19;
  } else { vel *= 0.6; }
  pos = fract(pos + vec2f(1.0));
  var energy = a.life.x;
  var drain = (0.010 + length(vel) * 0.018) * p.moveCost * p.dt;
  if (p.temp < 0.28) { drain *= 1.45; }
  if (p.waterDependency > 0.5) {
    let d = distance(pos, vec2f(0.22, 0.72));
    if (d > 0.24) { drain += 0.026 * p.dt; }
  }
  if (species < 0.5) {
    let lightGain = max(0.0, 1.0 - distance(pos, vec2f(p.lightX, p.lightY)) * 1.5);
    energy += (0.010 + lightGain * 0.018) * p.foodLevel * p.dt;
    if (a.traitsB.z > 0.45 && energy < 0.72) { energy += 0.010 * a.traitsB.z * p.foodLevel * p.dt; }
  } else {
    energy -= 0.004 * p.dt;
  }
  energy -= drain;
  a.posVel = vec4f(pos, vel);
  a.life.x = energy;
  a.life.y += p.dt;
  agents[i] = a;
}` });
      const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: shader, entryPoint: 'main' } });
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: agentBuffer } },
          { binding: 1, resource: { buffer: uniformBuffer } },
        ],
      });
      device.queue.writeBuffer(agentBuffer, 0, this.data);
      this.gpu = { device, agentBuffer, uniformBuffer, readBuffer, pipeline, bindGroup };
      this.onGpuState('WebGPU compute');
    } catch {
      this.onGpuState('CPU fallback');
    }
  }

  writeGpu() {
    if (this.gpu) this.gpu.device.queue.writeBuffer(this.gpu.agentBuffer, 0, this.data);
  }

  gpuStep(dt) {
    if (!this.gpu) return;
    const stats = this.basicStats();
    const centroid = this.preyCentroid();
    const params = new Float32Array(16);
    params[0] = dt;
    params[1] = this.frameCounter;
    params[2] = this.world.temperature;
    params[3] = clamp(this.food / 12000, 0.12, 1.6) * this.world.foodRegen;
    params[4] = this.world.movementCost;
    params[5] = this.world.lightX;
    params[6] = this.world.lightY;
    params[7] = stats.blue;
    params[8] = stats.red;
    params[9] = centroid.x;
    params[10] = centroid.y;
    params[11] = this.world.nightRedOnly ? 1 : 0;
    params[12] = this.world.waterDependency ? 1 : 0;
    params[13] = clamp(stats.active / 18000, 0, 1);
    params[14] = this.blueRule.avoidCrowds ? clamp(this.blueRule.fearDistance / 30, 0.3, 1.8) : 0;
    params[15] = this.blueRule.lightAffinity;
    this.gpu.device.queue.writeBuffer(this.gpu.uniformBuffer, 0, params);
    const encoder = this.gpu.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.gpu.pipeline);
    pass.setBindGroup(0, this.gpu.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(MAX_AGENTS / 128));
    pass.end();
    this.gpu.device.queue.submit([encoder.finish()]);
  }

  cpuStep(dt) {
    const stats = this.basicStats();
    const crowd = clamp(stats.active / 18000, 0, 1);
    const prey = this.preyCentroid();
    for (let i = 0; i < this.nextIndex; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5) continue;
      const species = this.data[o + 6];
      let x = this.data[o], y = this.data[o + 1], vx = this.data[o + 2], vy = this.data[o + 3];
      const speed = this.data[o + 8];
      const angle = ((i * 0.618 + this.frameCounter * 0.013) % 1) * Math.PI * 2;
      let dx = Math.cos(angle) * 0.18, dy = Math.sin(angle) * 0.18;
      if (species < 0.5) {
        const lx = this.world.lightX - x, ly = this.world.lightY - y;
        const lm = Math.hypot(lx, ly) || 1;
        dx += (lx / lm) * 0.32 * this.blueRule.lightAffinity;
        dy += (ly / lm) * 0.32 * this.blueRule.lightAffinity;
        if (this.blueRule.avoidCrowds && crowd > 0.56) {
          dx += (x - 0.5) * 0.35 * clamp(this.blueRule.fearDistance / 30, 0.4, 1.8);
          dy += (y - 0.5) * 0.35 * clamp(this.blueRule.fearDistance / 30, 0.4, 1.8);
        }
      } else {
        const px = prey.x - x, py = prey.y - y, pm = Math.hypot(px, py) || 1;
        dx += (px / pm) * 0.48;
        dy += (py / pm) * 0.48;
      }
      if (!(this.world.nightRedOnly && species < 0.5)) {
        vx = vx * 0.91 + dx * dt * speed * 1.8;
        vy = vy * 0.91 + dy * dt * speed * 1.8;
        const vm = Math.hypot(vx, vy);
        const vmax = 0.22 * speed;
        if (vm > vmax) {
          vx = (vx / vm) * vmax;
          vy = (vy / vm) * vmax;
        }
        x = (x + vx * dt * 0.19 + 1) % 1;
        y = (y + vy * dt * 0.19 + 1) % 1;
      }
      let energy = this.data[o + 4];
      let drain = (0.01 + Math.hypot(vx, vy) * 0.018) * this.world.movementCost * dt;
      if (this.world.temperature < 0.28) drain *= 1.45;
      if (this.world.waterDependency && Math.hypot(x - 0.22, y - 0.72) > 0.24) drain += 0.026 * dt;
      if (species < 0.5) {
        const lg = Math.max(0, 1 - Math.hypot(x - this.world.lightX, y - this.world.lightY) * 1.5);
        energy += (0.01 + lg * 0.018) * clamp(this.food / 12000, 0.12, 1.6) * this.world.foodRegen * dt;
        if (this.data[o + 14] > 0.45 && energy < 0.72) energy += 0.01 * this.data[o + 14] * clamp(this.food / 12000, 0.12, 1.6) * dt;
      } else {
        energy -= 0.004 * dt;
      }
      energy -= drain;
      this.data[o] = x;
      this.data[o + 1] = y;
      this.data[o + 2] = vx;
      this.data[o + 3] = vy;
      this.data[o + 4] = energy;
      this.data[o + 5] += dt;
    }
  }

  async syncGpuAndEcology() {
    if (this.gpu) {
      const { device, agentBuffer, readBuffer } = this.gpu;
      const encoder = device.createCommandEncoder();
      encoder.copyBufferToBuffer(agentBuffer, 0, readBuffer, 0, this.data.byteLength);
      device.queue.submit([encoder.finish()]);
      try {
        await readBuffer.mapAsync(GPUMapMode.READ);
        this.data.set(new Float32Array(readBuffer.getMappedRange().slice(0)));
        readBuffer.unmap();
      } catch {
        return;
      }
    }
    this.ecologyTick(0.55);
    this.writeGpu();
  }

  ecologyTick(windowSeconds) {
    const blueCells = new Map();
    const cellN = 36;
    let blue = 0, red = 0;
    for (let i = 0; i < this.nextIndex; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5) continue;
      const species = this.data[o + 6];
      const energy = this.data[o + 4];
      const age = this.data[o + 5];
      const lifespan = this.data[o + 13];
      if (energy <= 0 || age > lifespan) {
        this.data[o + 7] = 0;
        continue;
      }
      if (species === 0) {
        blue++;
        const cx = Math.floor(this.data[o] * cellN), cy = Math.floor(this.data[o + 1] * cellN);
        const key = cy * cellN + cx;
        const arr = blueCells.get(key);
        if (arr) arr.push(i); else blueCells.set(key, [i]);
      } else {
        red++;
      }
    }

    for (let i = 0; i < this.nextIndex; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5 || this.data[o + 6] < 0.5) continue;
      if (this.data[o + 4] > 1.1) continue;
      const cx = Math.floor(this.data[o] * cellN), cy = Math.floor(this.data[o + 1] * cellN);
      let eaten = -1;
      for (let yy = -1; yy <= 1 && eaten < 0; yy++) {
        for (let xx = -1; xx <= 1 && eaten < 0; xx++) {
          const arr = blueCells.get((cy + yy) * cellN + (cx + xx));
          if (!arr?.length) continue;
          for (let k = 0; k < Math.min(4, arr.length); k++) {
            const prey = arr[Math.floor(this.random() * arr.length)];
            const p = prey * STRIDE;
            if (this.data[p + 7] < 0.5) continue;
            if (Math.hypot(this.data[p] - this.data[o], this.data[p + 1] - this.data[o + 1]) < 0.022) {
              eaten = prey;
              break;
            }
          }
        }
      }
      if (eaten >= 0) {
        this.data[eaten * STRIDE + 7] = 0;
        this.data[o + 4] += 0.42;
      }
    }

    const currentNext = this.nextIndex;
    let births = 0;
    for (let i = 0; i < currentNext && this.nextIndex < MAX_AGENTS; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5 || this.data[o + 4] < 1.12) continue;
      const rate = this.data[o + 10];
      if (this.random() < rate * windowSeconds * 0.21) {
        const species = this.data[o + 6];
        const child = this.spawn(species, this.random() < this.world.mutationRate, i);
        if (child >= 0) {
          this.data[o + 4] *= 0.66;
          this.data[child * STRIDE + 4] = 0.67;
          births++;
        }
      }
    }
    if (births > 20 && this.random() < 0.12) this.emit('birth', `새 개체 ${births.toLocaleString()}마리 탄생`);

    const huntingCost = this.blueRule.aggression > 0.45 ? blue * this.blueRule.aggression * 0.003 : 0;
    this.food = clamp(this.food + this.world.foodRegen * 105 - blue * 0.0075 - huntingCost, 0, 40000);
    const now = this.basicStats();
    [now.blue, now.red].forEach((count, idx) => {
      if (count > 0) this.seenAlive[idx] = true;
      if (count === 0 && this.seenAlive[idx]) {
        this.extinctions++;
        this.seenAlive[idx] = false;
        this.emit('extinction', `${idx === 0 ? 'Blue' : 'Red'} 종 멸종`);
      }
    });
    if (this.selectedAgentIndex >= 0 && !this.isAlive(this.selectedAgentIndex)) this.selectedAgentIndex = -1;
  }

  basicStats() {
    let blue = 0, red = 0, eB = 0, eR = 0;
    for (let i = 0; i < this.nextIndex; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5) continue;
      if (this.data[o + 6] < 0.5) {
        blue++;
        eB += this.data[o + 4];
      } else {
        red++;
        eR += this.data[o + 4];
      }
    }
    return { blue, red, active: blue + red, avgEnergyBlue: blue ? eB / blue : 0, avgEnergyRed: red ? eR / red : 0 };
  }

  preyCentroid() {
    let x = 0, y = 0, n = 0;
    const step = Math.max(1, Math.floor(this.nextIndex / 1800));
    for (let i = 0; i < this.nextIndex; i += step) {
      const o = i * STRIDE;
      if (this.data[o + 7] > 0.5 && this.data[o + 6] < 0.5) {
        x += this.data[o];
        y += this.data[o + 1];
        n++;
      }
    }
    return n ? { x: x / n, y: y / n } : { x: 0.5, y: 0.5 };
  }

  dominantTrait() {
    let speed = 0, vision = 0, repro = 0, n = 0;
    for (let i = 0; i < this.nextIndex; i += 3) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5) continue;
      speed += this.data[o + 8];
      vision += this.data[o + 9];
      repro += this.data[o + 10];
      n++;
    }
    if (!n) return 'No surviving trait';
    const scores = [
      { label: 'High vision radius', score: vision / n / 80 },
      { label: 'High movement speed', score: speed / n / 1.3 },
      { label: 'Fast reproduction', score: repro / n / 0.07 },
    ];
    return scores.sort((a, b) => b.score - a.score)[0].label;
  }

  stats() {
    const b = this.basicStats();
    return { ...b, food: Math.round(this.food), generation: Math.floor(this.generation), extinctions: this.extinctions, dominantTrait: this.dominantTrait(), fps: this.fps };
  }

  worldToScreen(worldX, worldY, width, height, view = this.view) {
    const dx = wrapDelta(worldX - view.centerX);
    const dy = wrapDelta(worldY - view.centerY);
    return {
      x: (dx * view.zoom + 0.5) * width,
      y: (dy * view.zoom + 0.5) * height,
    };
  }

  screenToWorld(offsetX, offsetY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0.5, y: 0.5 };
    const sx = offsetX / rect.width - 0.5;
    const sy = offsetY / rect.height - 0.5;
    return {
      x: wrap01(this.view.centerX + sx / this.view.zoom),
      y: wrap01(this.view.centerY + sy / this.view.zoom),
    };
  }

  isAlive(index) {
    return Number.isInteger(index) && index >= 0 && index < this.nextIndex && this.data[index * STRIDE + 7] > 0.5;
  }

  getAgentInfo(index) {
    if (!this.isAlive(index)) return null;
    const o = index * STRIDE;
    const species = this.data[o + 6] < 0.5 ? 'Blue' : 'Red';
    return {
      index,
      species,
      x: this.data[o],
      y: this.data[o + 1],
      energy: this.data[o + 4],
      age: this.data[o + 5],
      speed: this.data[o + 8],
      vision: this.data[o + 9],
      reproduction: this.data[o + 10],
      generation: this.data[o + 11],
      size: this.data[o + 12],
      lifespan: this.data[o + 13],
      aggression: this.data[o + 14],
      hueShift: this.data[o + 15],
    };
  }

  pickAgentAtWorld(worldX, worldY, maxRadius = 0.03) {
    let best = -1;
    let bestDistance = maxRadius;
    for (let i = 0; i < this.nextIndex; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5) continue;
      const dx = wrapDelta(this.data[o] - worldX);
      const dy = wrapDelta(this.data[o + 1] - worldY);
      const dist = Math.hypot(dx, dy);
      if (dist <= bestDistance) {
        bestDistance = dist;
        best = i;
      }
    }
    return best >= 0 ? this.getAgentInfo(best) : null;
  }

  setSelectedAgent(index) {
    this.selectedAgentIndex = this.isAlive(index) ? index : -1;
  }

  clearSelection() {
    this.selectedAgentIndex = -1;
  }

  focusOn(worldX, worldY) {
    this.view.centerX = wrap01(worldX);
    this.view.centerY = wrap01(worldY);
  }

  setView(view) {
    this.view = this.normalizeView({ ...this.view, ...view });
  }

  getView() {
    return { ...this.view };
  }

  agentVisibleForFilter(species, filter) {
    return filter === 'all' || (filter === 'blue' && species < 0.5) || (filter === 'red' && species >= 0.5);
  }

  drawGrid(ctx, width, height, view) {
    const step = 1 / 8;
    ctx.strokeStyle = 'rgba(129,216,159,.10)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < 1; gx += step) {
      const a = this.worldToScreen(gx, view.centerY - 0.5 / view.zoom, width, height, view);
      const b = this.worldToScreen(gx, view.centerY + 0.5 / view.zoom, width, height, view);
      if (a.x < -20 || a.x > width + 20) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, -10);
      ctx.lineTo(b.x, height + 10);
      ctx.stroke();
    }
    for (let gy = 0; gy < 1; gy += step) {
      const a = this.worldToScreen(view.centerX - 0.5 / view.zoom, gy, width, height, view);
      const b = this.worldToScreen(view.centerX + 0.5 / view.zoom, gy, width, height, view);
      if (a.y < -20 || a.y > height + 20) continue;
      ctx.beginPath();
      ctx.moveTo(-10, a.y);
      ctx.lineTo(width + 10, b.y);
      ctx.stroke();
    }
  }

  renderScene(ctx, { width, height, view = this.view, filter = view.filter || 'all', showSelection = true, showGrid = true } = {}) {
    const safeView = this.normalizeView(view);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#050b08';
    ctx.fillRect(0, 0, width, height);

    const light = this.worldToScreen(this.world.lightX, this.world.lightY, width, height, safeView);
    const grad = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, Math.max(width, height) * 0.5 * safeView.zoom);
    grad.addColorStop(0, 'rgba(198,255,124,.16)');
    grad.addColorStop(0.3, 'rgba(106,220,120,.045)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    if (this.world.waterDependency) {
      const water = this.worldToScreen(0.22, 0.72, width, height, safeView);
      ctx.beginPath();
      ctx.arc(water.x, water.y, Math.min(width, height) * 0.19 * safeView.zoom, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(67,153,255,.075)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,180,255,.2)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    const showFood = filter === 'all' || filter === 'food';
    if (showFood) {
      const foodDots = Math.min(800, Math.floor(this.food / 18));
      ctx.fillStyle = filter === 'food' ? 'rgba(188,255,108,.95)' : 'rgba(168,241,103,.28)';
      for (let i = 0; i < foodDots; i++) {
        const a = ((i * 9301 + 49297) % 233280) / 233280;
        const b = ((i * 2333 + 7919) % 104729) / 104729;
        const wx = ((a * 0.82 + this.world.lightX * 0.18) % 1);
        const wy = ((b * 0.82 + this.world.lightY * 0.18) % 1);
        const p = this.worldToScreen(wx, wy, width, height, safeView);
        if (p.x < -4 || p.x > width + 4 || p.y < -4 || p.y > height + 4) continue;
        const dotSize = clamp(1.2 * safeView.zoom, 1, 3.5);
        ctx.fillRect(p.x, p.y, dotSize, dotSize);
      }
    }

    const sampleStep = this.nextIndex > 26000 ? 2 : 1;
    for (let i = 0; i < this.nextIndex; i += sampleStep) {
      const o = i * STRIDE;
      if (this.data[o + 7] < 0.5) continue;
      const species = this.data[o + 6];
      if (!this.agentVisibleForFilter(species, filter)) continue;
      const p = this.worldToScreen(this.data[o], this.data[o + 1], width, height, safeView);
      if (p.x < -8 || p.x > width + 8 || p.y < -8 || p.y > height + 8) continue;
      const size = clamp(this.data[o + 12] * (species < 0.5 ? 1.25 : 1.7) * Math.sqrt(safeView.zoom), 0.8, 6.5);
      const mut = this.data[o + 15];
      ctx.fillStyle = species < 0.5
        ? `rgba(${Math.round(88 + mut * 180)}, ${Math.round(210 - mut * 90)}, 255, .84)`
        : `rgba(255, ${Math.round(98 + mut * 90)}, ${Math.round(112 - mut * 80)}, .88)`;
      ctx.fillRect(p.x, p.y, size, size);
    }

    if (showGrid) this.drawGrid(ctx, width, height, safeView);

    if (showSelection && this.isAlive(this.selectedAgentIndex)) {
      const info = this.getAgentInfo(this.selectedAgentIndex);
      if (info && this.agentVisibleForFilter(info.species === 'Blue' ? 0 : 1, filter)) {
        const p = this.worldToScreen(info.x, info.y, width, height, safeView);
        const ring = clamp(10 + safeView.zoom * 4, 10, 28);
        ctx.beginPath();
        ctx.arc(p.x + 2, p.y + 2, ring, 0, Math.PI * 2);
        ctx.strokeStyle = info.species === 'Blue' ? 'rgba(140,236,255,.9)' : 'rgba(255,168,178,.92)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p.x + 2, p.y + 2, ring + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.renderScene(this.ctx, { width: rect.width, height: rect.height, view: this.view, filter: this.view.filter, showSelection: true, showGrid: true });
  }

  renderToCanvas(targetCanvas, { width = 1600, height = 900, view = this.view, filter = view.filter || 'all', showSelection = true, showGrid = true } = {}) {
    targetCanvas.width = width;
    targetCanvas.height = height;
    const ctx = targetCanvas.getContext('2d', { alpha: false });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.renderScene(ctx, { width, height, view, filter, showSelection, showGrid });
    return targetCanvas;
  }

  loop = (now) => {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;
    this.frameCounter++;
    if (this.running) {
      if (this.gpu) this.gpuStep(dt); else this.cpuStep(dt);
      if (now - this.lastSync > 550) {
        this.lastSync = now;
        void this.syncGpuAndEcology();
      }
    }
    this.draw();
    if (now - this.fpsStamp > 1000) {
      this.fps = Math.round((this.frameCounter * 1000) / (now - this.fpsStamp));
      this.frameCounter = 0;
      this.fpsStamp = now;
    }
    const stats = this.stats();
    this.onStats(stats);
    if (now - this.lastSnapshot > 5000) {
      this.lastSnapshot = now;
      this.onSnapshot({ ...stats, t: this.t(), temperature: this.world.temperature, foodRegen: this.world.foodRegen, movementCost: this.world.movementCost });
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  setRunning(value) { this.running = value; }
  isRunning() { return this.running; }
  setWorld(world) { this.world = { ...world }; }

  setBlueRule(rule) {
    this.blueRule = { ...rule };
    for (let i = 0; i < this.nextIndex; i++) {
      const o = i * STRIDE;
      if (this.data[o + 7] > 0.5 && this.data[o + 6] < 0.5) {
        this.data[o + 8] = rule.speed * (0.94 + this.random() * 0.12);
        this.data[o + 9] = rule.visionRadius * (0.95 + this.random() * 0.1);
        this.data[o + 10] = rule.reproductionRate * (0.94 + this.random() * 0.12);
        this.data[o + 12] = rule.size * (0.95 + this.random() * 0.1);
        this.data[o + 13] = rule.lifespan * (0.96 + this.random() * 0.08);
        this.data[o + 14] = rule.aggression;
      }
    }
    this.writeGpu();
  }

  addPredators(count) {
    for (let i = 0; i < count && this.nextIndex < MAX_AGENTS; i++) this.spawn(1, false);
    this.writeGpu();
  }

  mutateRandom() {
    const candidates = [];
    for (let i = 0; i < this.nextIndex; i += Math.max(1, Math.floor(this.nextIndex / 6000))) {
      if (this.data[i * STRIDE + 7] > 0.5) candidates.push(i);
    }
    if (!candidates.length) return '활성 개체가 없습니다.';
    const idx = candidates[Math.floor(this.random() * candidates.length)];
    this.selectedAgentIndex = idx;
    return this.mutateAgent(idx, true);
  }

  mutateAgent(idx, announce) {
    const o = idx * STRIDE;
    const traits = [
      { key: 8, name: '속도', min: 0.35, max: 2.8 },
      { key: 9, name: '시야', min: 12, max: 220 },
      { key: 10, name: '번식률', min: 0.005, max: 0.28 },
      { key: 12, name: '크기', min: 0.45, max: 2.3 },
      { key: 13, name: '수명', min: 35, max: 220 },
      { key: 15, name: '색', min: -0.45, max: 0.45 },
    ];
    const trait = traits[Math.floor(this.random() * traits.length)];
    const before = this.data[o + trait.key];
    const factor = 0.72 + this.random() * 0.68;
    this.data[o + trait.key] = clamp(before * factor || (this.random() - 0.5) * 0.2, trait.min, trait.max);
    this.writeGpu();
    const species = this.data[o + 6] < 0.5 ? 'Blue' : 'Red';
    const msg = `${species} #${idx}: ${trait.name} ${before.toFixed(2)} → ${this.data[o + trait.key].toFixed(2)}`;
    if (announce) this.emit('mutation', msg);
    return msg;
  }

  applyGod(note) { this.emit('god', note); }
  reset(count) { this.seed(count); this.writeGpu(); this.emit('reset', `생태계를 ${count.toLocaleString()}개체로 재시작`); }
  getEvents() { return [...this.events]; }
  destroy() { cancelAnimationFrame(this.raf); this.gpu?.device.destroy(); }
}
