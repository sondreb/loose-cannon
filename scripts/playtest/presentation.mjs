/** Live Vite/Mode A browser checks; day/night snapshots are separate renderer fixtures. */
import { chromium } from 'playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const baseUrl = process.env.PLAYTEST_URL || 'http://127.0.0.1:5173';
const healthUrl = process.env.PLAYTEST_HEALTH_URL || 'http://127.0.0.1:3001/health';
const out = new URL('../../playtest-out/', import.meta.url);
const pathFor = name => fileURLToPath(new URL(name, out));
await mkdir(out, { recursive: true });
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const hasEdge = await access(edge).then(() => true, () => false);
const browser = await chromium.launch({ headless: true, ...(hasEdge ? { executablePath: edge } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const failures = [], report = [];
await writeFile(pathFor('presentation-report.json'), JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }, null, 2));

function observeErrors(page, label) {
  let navigations = 0;
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame() && ++navigations > 1) failures.push(`${label}: client navigated during QA; keep source changes/HMR paused`);
  });
  page.on('pageerror', error => failures.push(`${label}: ${error.message}`));
  page.on('response', response => { if (response.status() >= 400) failures.push(`${label}: ${response.status()} ${response.url()}`); });
}
async function assertRealmReleased(realm) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const health = await fetch(healthUrl).then(response => response.json());
    if (!(realm in health.byRealm)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`QA realm retained sessions after its socket closed: ${realm}`);
}
async function closeGameSocket(page) {
  if (page.isClosed()) return;
  await page.evaluate(async () => {
    await Promise.all([...(window.qaGame?.sockets ?? [])].map(socket => {
      if (socket.readyState === WebSocket.CLOSED) return;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Game socket did not close')), 3000);
        socket.addEventListener('close', () => { clearTimeout(timeout); resolve(); }, { once: true });
        socket.close(1000, 'Presentation QA complete');
      });
    }));
  });
}
async function diagnose(page) {
  return page.evaluate(() => {
    const qa = window.qaGame, s = qa?.snapshot;
    return { gameVisible: !document.querySelector('#game')?.classList.contains('hidden'), loginError: document.querySelector('#loginError')?.textContent,
      authCount: qa?.authCount, auth: qa?.auth, events: qa?.events, snapshot: s?.you, rendered: window.qaView?.lastSnap?.you,
      leader: window.qaView?.leaderWorldPos(), crew: s?.units.filter(unit => unit.posseId === s.you.posseId).map(({ id, x, y }) => ({ id, x, y })) };
  });
}
async function doorScreenPoint(page, exit = false) {
  return page.evaluate(exit => {
    const view = window.qaView, bar = window.qaGame.snapshot.buildings.find(b => b.id === 'bar_rusty');
    const o = view.screenToWorld(0, 0), px = view.screenToWorld(1, 0), py = view.screenToWorld(0, 1);
    const ax = px.x-o.x, ay = px.y-o.y, bx = py.x-o.x, by = py.y-o.y;
    const dx = (exit ? bar.exitX : bar.doorX)+0.5-o.x, dy = (exit ? bar.exitY : bar.doorY)+0.5-o.y, det = ax*by-ay*bx;
    return { x: (dx*by-dy*bx)/det, y: (ax*dy-ay*dx)/det };
  }, exit);
}
async function renderFixtures(context, snapshot, label) {
  // No login or gameplay socket: these explicitly test the renderer under controlled light.
  const page = await context.newPage();
  observeErrors(page, `${label}-fixture`);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(async snapshot => {
    const { WorldView } = await import('/src/worldView.js');
    const canvas = document.querySelector('#canvas');
    document.body.replaceChildren(canvas);
    const view = new WorldView(canvas); await view.init();
    window.qaFixture = { view, snapshot };
  }, snapshot);
  for (const [scene, dayPhase, weather] of [['day', 'day', 'clear'], ['night', 'night', 'rain']]) {
    await page.evaluate(({ dayPhase, weather }) => {
      const { view, snapshot } = window.qaFixture;
      view.applySnapshot({ ...snapshot, dayPhase, weather, fx: [] });
    }, { dayPhase, weather });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: pathFor(`${label}-${scene}-fixture.png`) });
  }
  await page.close();
}

try {
  for (const mobile of [false, true]) {
    const label = mobile ? 'mobile' : 'desktop';
    const realm = `presentation-${label}-${Date.now().toString(36)}`;
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await context.newPage(); observeErrors(page, label);
    try {
      await page.addInitScript(() => {
        localStorage.setItem('lc_onboard_v1', '1');
        localStorage.setItem('lc_audio_v1', JSON.stringify({ music: false, sfx: false, voice: false }));
        const send = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
          let message; try { message = JSON.parse(String(data)); } catch { /* Vite has a separate socket. */ }
          if (message?.type === 'auth') {
            const qa = window.qaGame ??= { socket: this, sockets: new Set(), authCount: 0, events: [], terrain: {} };
            qa.sockets.add(this);
            qa.authCount++;
            if (qa.authCount === 1) {
              // Registered after GameSocket's handler. Observe, never rewrite incoming data.
              this.addEventListener('message', event => {
                const msg = JSON.parse(String(event.data));
                if (msg.type === 'auth.ok') qa.auth = msg;
                if (msg.type === 'snapshot') {
                  qa.snapshot = msg.data;
                  if (qa.terrain.mapRevision !== msg.data.mapRevision) qa.terrain = { mapRevision: msg.data.mapRevision };
                  for (const key of ['floors', 'blocked']) if (msg.data[key]) qa.terrain[key] = msg.data[key];
                } else qa.events = [...qa.events, msg].slice(-15);
              });
            }
          }
          return send.call(this, data);
        };
      });
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      // Capture the real renderer instance without changing initialization or snapshots.
      await page.evaluate(async () => {
        const loaded = performance.getEntriesByType('resource').find(entry => /\/src\/worldView\.(ts|js)(\?|$)/.test(entry.name));
        if (!loaded) throw new Error('Cannot find the actual loaded WorldView module');
        // Vite appends HMR timestamps: a bare import would create a different class.
        const { WorldView } = await import(loaded.name); const init = WorldView.prototype.init;
        WorldView.prototype.init = function (...args) { window.qaView = this; return init.apply(this, args); };
      });
      await page.screenshot({ path: pathFor(`${label}-login.png`) });
      await page.locator('#nameInput').fill(`${label}QA`); await page.locator('#realmInput').fill(realm);
      await page.locator('#joinBtn').click();
      await page.waitForFunction(() => window.qaGame?.snapshot?.you && window.qaGame.auth);
      assert.equal(await page.locator('#game').isVisible(), true, JSON.stringify(await diagnose(page)));
      assert.equal(await page.evaluate(() => window.qaGame.authCount), 1, 'Exactly one game authentication');
      await page.waitForFunction(() => window.qaView?.lastSnap?.you.characterId === window.qaGame.auth.characterId);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: pathFor(`${label}-live-street.png`) });
      const fixture = await page.evaluate(() => ({ ...window.qaGame.snapshot, ...window.qaGame.terrain }));
      const movement = await page.evaluate(() => {
        const s = window.qaGame.snapshot, leaderId = s.posses.find(p => p.id === s.you.posseId).leaderId;
        const leader = s.units.find(u => u.id === leaderId), bar = s.buildings.find(b => b.id === 'bar_rusty');
        const target = { x: bar.doorX + 0.5, y: bar.doorY + 1.2 }; window.qaGame.target = target;
        window.qaGame.socket.send(JSON.stringify({ type: 'intent.move', ...target }));
        return { startingPosition: { x: leader.x, y: leader.y }, target };
      });
      await page.waitForFunction(() => {
        const qa = window.qaGame, s = qa.snapshot, leaderId = s.posses.find(p => p.id === s.you.posseId).leaderId;
        const leader = s.units.find(u => u.id === leaderId);
        return Math.hypot(leader.x - qa.target.x, leader.y - qa.target.y) < 0.3;
      }, null, { timeout: 30000 });
      await page.waitForFunction(() => window.qaView.distToLeader(window.qaGame.target.x, window.qaGame.target.y) < 0.4, null, { timeout: 5000 });
      await page.screenshot({ path: pathFor(`${label}-rusty-nail.png`) });
      if (mobile) {
        // Tap the rendered entrance in Use mode, using the inverse input transform.
        const point = await doorScreenPoint(page);
        await page.touchscreen.tap(point.x, point.y);
      } else { await page.locator('#canvas').focus(); await page.keyboard.press('e'); }
      await page.waitForFunction(() => window.qaGame.snapshot.you.insideBuildingId === 'bar_rusty', null, { timeout: 6000 });
      await page.waitForFunction(() => window.qaView.lastSnap.you.insideBuildingId === 'bar_rusty');
      await page.waitForTimeout(900);
      assert.match(await page.locator('#interiorPlaceName').textContent(), /rusty nail/i);
      await page.screenshot({ path: pathFor(`${label}-interior.png`) });
      // Regression: one door click from outside interaction range must walk and enter.
      const exitPoint = await doorScreenPoint(page, true);
      if (mobile) await page.touchscreen.tap(exitPoint.x, exitPoint.y);
      else await page.mouse.click(exitPoint.x, exitPoint.y);
      await page.waitForFunction(() => !window.qaGame.snapshot.you.insideBuildingId && !window.qaView.lastSnap.you.insideBuildingId);
      await page.evaluate(() => {
        const bar = window.qaGame.snapshot.buildings.find(b => b.id === 'bar_rusty');
        window.qaGame.target = { x: bar.doorX+0.5, y: bar.doorY+4.3 };
        window.qaGame.socket.send(JSON.stringify({ type: 'intent.move', ...window.qaGame.target }));
      });
      await page.waitForFunction(() => {
        const qa = window.qaGame, s = qa.snapshot, leaderId = s.posses.find(p => p.id === s.you.posseId).leaderId;
        const leader = s.units.find(u => u.id === leaderId);
        return Math.hypot(leader.x-qa.target.x, leader.y-qa.target.y) < 0.2 && window.qaView.distToLeader(qa.target.x, qa.target.y) < 0.3;
      });
      const farDoor = await doorScreenPoint(page);
      if (mobile) await page.touchscreen.tap(farDoor.x, farDoor.y);
      else await page.mouse.click(farDoor.x, farDoor.y);
      await page.waitForFunction(() => window.qaGame.snapshot.you.insideBuildingId === 'bar_rusty' && window.qaView.lastSnap.you.insideBuildingId === 'bar_rusty', null, { timeout: 8000 });
      report.push({ viewport: label, realm, ...movement, entered: 'bar_rusty', clickedExit: true, singleFarDoorClickEntered: true, livePhase: fixture.dayPhase, liveWeather: fixture.weather });
      await closeGameSocket(page); await assertRealmReleased(realm);
      await renderFixtures(context, fixture, label);
      console.log('PRESENTATION_OK', label, '(live movement, rendered position, actual entrance, realm cleanup, day/night fixtures)');
    } catch (error) {
      const diagnostic = await diagnose(page).catch(() => ({}));
      console.error('PRESENTATION_DIAGNOSTIC', JSON.stringify(diagnostic));
      await writeFile(pathFor('presentation-report.json'), JSON.stringify({ status: 'failed', report, failures, error: String(error), diagnostic }, null, 2));
      await page.screenshot({ path: pathFor(`${label}-failure.png`) }).catch(() => undefined);
      throw error;
    } finally { await closeGameSocket(page).catch(error => failures.push(error.message)); await context.close(); }
  }
  assert.deepEqual(failures, [], 'Browser runtime/network failures');
  await writeFile(pathFor('presentation-report.json'), JSON.stringify({ status: 'passed', report, failures,
    note: 'Live screenshots and entrance checks use untouched server snapshots. Day/night images are isolated renderer fixtures from captured terrain; no gameplay sockets or weather overrides.' }, null, 2));
} finally { await browser.close(); }

