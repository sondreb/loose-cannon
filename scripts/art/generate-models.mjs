/** Rebuild original GLB assets and eight-direction, animated Pixi atlases.
 * npm install; node scripts/art/generate-models.mjs
 * Uses installed Edge on Windows; otherwise `npx playwright install chromium`.
 * Nothing is uploaded: all modeling, export, rendering, and PNG encoding is local.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'packages/client/public/art');
const bundle = await build({ entryPoints: [path.join(root, 'scripts/art/model-studio.js')], bundle: true, write: false, format: 'esm', target: 'es2022' });
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/studio.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/studio.js' ? bundle.outputFiles[0].text : '<!doctype html><meta charset="utf-8"><script type="module" src="/studio.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const hasEdge = await access(edge).then(() => true, () => false);
  browser = await chromium.launch({ headless: true, ...(hasEdge ? { executablePath: edge } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('console', message => { if (message.type() === 'log') console.log(message.text()); });
  page.on('pageerror', error => console.error(error));
  await page.exposeFunction('saveAsset', async (name, base64) => {
    const target = path.resolve(output, name);
    if (!target.startsWith(path.resolve(output) + path.sep)) throw new Error('Asset path escapes output');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(base64, 'base64'));
    console.log('Saved', name);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.studioReady, { timeout: 30000 });
  await page.evaluate(() => window.generateAssets());
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
