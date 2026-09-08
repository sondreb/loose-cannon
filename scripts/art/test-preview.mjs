/** Focused browser verification against a running Vite client. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, access } from 'node:fs/promises';
const base=process.env.PLAYTEST_URL||'http://127.0.0.1:5173';
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const hasEdge=await access(edge).then(()=>true,()=>false);
const browser=await chromium.launch({headless:true,...(hasEdge?{executablePath:edge}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:480,height:480}});
  const errors=[],models=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>{if(request.url().endsWith('.glb'))models.push(request.url());});
  await page.addInitScript(()=>{
    window.drawCalls=0;
    for(const Klass of [window.WebGLRenderingContext,window.WebGL2RenderingContext]) {
      if(!Klass)continue;
      for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
        const original=Klass.prototype[name];if(!original)continue;
        Klass.prototype[name]=function(...args){window.drawCalls++;return original.apply(this,args);};
      }
    }
  });
  await page.route('**/art-model-test',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><style>body{background:#111820;color:#ddd;font-family:sans-serif}#host{width:300px;margin:20px auto}</style><div id="host"><p id="existing">Existing crew details stay here.</p></div>'}));
  await page.goto(`${base}/art-model-test`);
  await page.evaluate(async()=>{
    window.preview=await import('/src/crewModelPreview.ts');
    window.crew={id:'art-test',name:'Frankie Two-Times',gender:'male',armor:'leather'};
  });
  assert.equal(models.length,0,'No model is downloaded before the editor opens');
  await page.evaluate(()=>window.preview.syncCrewModelPreview(document.querySelector('#host'),window.crew,true));
  await page.getByRole('button',{name:'Play walking animation'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Play walking animation"]').disabled);
  assert.equal(await page.locator('#existing').count(),1,'Existing host content survives');
  assert.equal(await page.locator('.crew-model-preview canvas').count(),1);
  await mkdir('playtest-out',{recursive:true});
  await page.screenshot({path:'playtest-out/crew-model-preview.png'});
  await page.getByRole('button',{name:'Play walking animation'}).click();
  assert.equal(await page.getByRole('button',{name:'Play walking animation'}).getAttribute('aria-pressed'),'true');
  const before=await page.locator('canvas').screenshot();
  await page.waitForTimeout(170);
  const after=await page.locator('canvas').screenshot();
  assert.ok(!before.equals(after),'Live walk animation changes the rendered model');
  await page.locator('.crew-model-preview__viewport').focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await page.getByRole('button',{name:'Reset model view'}).click();
  await page.evaluate(()=>document.querySelector('#host').style.display='none');
  await page.waitForTimeout(150);
  const paused=await page.evaluate(()=>window.drawCalls);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.drawCalls),paused,'Hidden preview does not issue GPU draw calls');
  await page.evaluate(()=>{document.querySelector('#host').style.display='';window.preview.syncCrewModelPreview(document.querySelector('#host'),{...window.crew,gender:'female'},true);});
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Play walking animation"]').disabled);
  assert.ok(models.some(url=>url.endsWith('/runner.glb')),'Gender appearance selects the runner model');
  await page.evaluate(()=>window.preview.syncCrewModelPreview(document.querySelector('#host'),null,false));
  assert.equal(await page.locator('.crew-model-preview').count(),0,'Close removes the renderer panel');
  assert.equal(await page.locator('#existing').count(),1,'Close preserves existing details');
  assert.deepEqual(errors,[]);
  console.log('CREW_MODEL_PREVIEW_OK: lazy load, live animation, controls, hidden GPU pause, model switch and disposal');
} finally {await browser.close();}
