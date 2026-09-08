/** Validate exported glTF structure, animation targets, and atlas dimensions. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const base=new URL('../../packages/client/public/art/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('sprites/models/manifest.json',base),'utf8'));
for(const [name,spec]of Object.entries(manifest.specs)) {
  const glb=await readFile(new URL(`models/${name}.glb`,base));
  assert.equal(glb.readUInt32LE(0),0x46546c67,`${name}: GLB magic`);
  assert.equal(glb.readUInt32LE(4),2,`${name}: GLB version`);
  assert.equal(glb.readUInt32LE(8),glb.length,`${name}: declared file length`);
  const jsonLength=glb.readUInt32LE(12);
  const model=JSON.parse(glb.subarray(20,20+jsonLength).toString());
  assert.equal(model.asset.version,'2.0');
  const binaryOffset=20+jsonLength;
  assert.equal(glb.readUInt32LE(binaryOffset+4),0x004e4942,`${name}: embedded binary chunk`);
  const binaryLength=glb.readUInt32LE(binaryOffset);
  for(const view of model.bufferViews??[])assert.ok((view.byteOffset??0)+view.byteLength<=binaryLength,`${name}: buffer bounds`);
  for(const accessor of model.accessors??[])assert.ok(model.bufferViews[accessor.bufferView],`${name}: accessor buffer`);
  for(const animation of model.animations??[])for(const channel of animation.channels) {
    assert.ok(model.nodes[channel.target.node],`${name}: animation node`);
    assert.ok(animation.samplers[channel.sampler],`${name}: animation sampler`);
  }
  if(spec.frames>1)assert.deepEqual(model.animations.map(a=>a.name),['Street walk','Armed idle']);
  const png=await readFile(new URL(`sprites/models/${name}.png`,base));
  assert.equal(png.readUInt32BE(16),spec.w*spec.frames,`${name}: atlas columns`);
  assert.equal(png.readUInt32BE(20),spec.h*8,`${name}: atlas directions`);
  assert.equal(png[25],6,`${name}: RGBA transparency`);
  console.log(`${name}: valid GLB, ${model.meshes.length} meshes, ${model.animations?.length??0} clips, ${spec.frames*8} RGBA frames`);
}
console.log('MODEL_ASSETS_OK');
