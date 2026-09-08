const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const listeners = [];
const timers = [];
const contexts = [];
let buffers = 0;
class Param {
  value = 0;
  setValueAtTime(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; }
}
class Node {
  gain = new Param(); frequency = new Param(); playbackRate = new Param(); pan = new Param();
  Q = new Param(); threshold = new Param(); knee = new Param(); ratio = new Param();
  attack = new Param(); release = new Param(); connected = false;
  connect() { this.connected = true; }
  disconnect() { this.connected = false; }
  start() {}
  stop() {}
}
class Context {
  currentTime = 1; sampleRate = 1000; state = 'running'; destination = new Node();
  constructor() { contexts.push(this); }
  createGain() { return new Node(); } createDynamicsCompressor() { return new Node(); }
  createStereoPanner() { return new Node(); } createBiquadFilter() { return new Node(); }
  createOscillator() { return new Node(); } createBufferSource() { return new Node(); }
  createBuffer(channels, frames) { buffers++; const data = Array.from({length: channels}, () => new Float32Array(frames)); return {getChannelData: c => data[c]}; }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
}
class Audio {
  paused = true; volume = 0;
  constructor(src) { this.src = src; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {} removeAttribute() {}
}
const document = { hidden: false, addEventListener: (name, cb) => listeners.push(cb) };
const sandbox = {console, document, window: {AudioContext: Context, setTimeout: cb => timers.push(cb)}, performance: {now: () => 5000}, Audio, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {}};
const modules = {};
function load(name) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(`packages/client/src/${name}.ts`, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source, {...sandbox, exports, require: () => modules.soundscape}, {filename:name});
  return exports;
}
modules.soundscape = load('soundscape');
const {sfx, music} = load('audio');
sfx.setMuted(false);
sfx.play('pistol', {force:true});
assert.equal(contexts.length, 0, 'no WebAudio context before gesture');
sfx.unlock();
assert.equal(contexts.length, 1);
sfx.play('pistol', {force:true});
const firstBuffers = buffers;
for (let i=0;i<100;i++) sfx.play('pistol', {force:true});
assert.equal(buffers, firstBuffers, 'repeated gunfire reuses noise buffers');
assert.equal(sfx.voices.size, 48, 'burst voice count is bounded');
timers.splice(0).forEach(cb=>cb());
assert.equal(sfx.voices.size, 0, 'routing graphs release after sounds finish');
sfx.setMuted(true);
assert.equal(sfx.output.gain.value, 0, 'mute silences already connected ambience');
sfx.setMuted(false);
assert.equal(sfx.output.gain.value, 1);
const snap = {you:{posseId:'crew',insideBuildingId:null,respawnIn:null,inSafeZone:true}, buildings:[], posses:[{id:'crew',leaderId:'leader'}], units:[{id:'leader',x:0,y:0,alive:true}], weather:'rain',dayPhase:'night'};
sfx.syncFromWorld(snap);
const ambient = sfx.ambience;
assert.equal(ambient.lastStep,0,'standing creates no steps');
snap.units[0].x = 0.7;
sfx.syncFromWorld(snap);
assert.equal(ambient.lastStep,1,'actual movement produces a step');
contexts[0].currentTime = 2;
snap.units[0].x = 20;
sfx.syncFromWorld(snap);
assert.equal(ambient.lastStep,1,'teleports do not produce steps');
music.unlock(); music.enterGame(0);
document.hidden = true; listeners.forEach(cb=>cb());
assert.equal(contexts[0].state,'suspended','hidden tab suspends WebAudio');
music.setGameMood('action');
document.hidden = false; listeners.forEach(cb=>cb());
assert.equal(contexts[0].state,'running');
assert.ok(music.audio.src.includes('neon-heist-run'),'return from hidden tab uses current combat mood');
console.log('PASS: gesture gating, cached noise, 48-voice cap, routing cleanup, master mute, movement/teleport footsteps, visibility pause/resume, current music mood.');
