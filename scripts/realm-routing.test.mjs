/** Real WebSocket regression for same-character-ID isolation across realms.
 * Starts and stops its own Mode A process on 3003 by default. Set WS_URL to test
 * an already running isolated server, or REALM_TEST_PORT to choose another port.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.REALM_TEST_PORT??3003);
const socketUrl=process.env.WS_URL??`ws://127.0.0.1:${port}`;
const healthUrl=new URL('/health',socketUrl.replace(/^ws/,'http')).href;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let child;
let output='';
const clients=[];
async function until(predicate,message,timeout=6000) {
  const started=Date.now();
  while(Date.now()-started<timeout) {if(await predicate())return;await pause(40);}
  throw new Error(`${message}\nServer output:\n${output}`);
}
async function connect() {
  const ws=new WebSocket(socketUrl);
  const client={ws,messages:[],snapshot:null,auth:null,send:message=>ws.send(JSON.stringify(message))};
  clients.push(client);
  ws.on('message',raw=>{
    const message=JSON.parse(String(raw));client.messages.push(message);
    if(message.type==='snapshot')client.snapshot=message.data;
    if(message.type==='auth.ok')client.auth=message;
  });
  await Promise.race([once(ws,'open'),pause(5000).then(()=>{throw new Error('WebSocket open timeout');})]);
  return client;
}
async function authenticate(client,name,realm) {
  client.send({type:'auth',protocolVersion:1,name,realm});
  await until(()=>client.auth&&client.snapshot,`Authentication failed for ${realm}`);
  assert.equal(client.auth.realmId,realm);
  assert.equal(client.snapshot.you.realmId,realm);
}
function boss(client) {return client.snapshot.units.find(unit=>unit.posseId===client.snapshot.you.posseId&&unit.isPlayerLeader);}
async function health(){return(await fetch(healthUrl)).json();}
async function move(client,dx,dy) {
  const initial={x:boss(client).x,y:boss(client).y};
  client.send({type:'intent.dir',dx,dy});
  await until(()=>Math.hypot(boss(client).x-initial.x,boss(client).y-initial.y)>.4,`Movement not routed to ${client.auth.realmId}`);
  client.send({type:'intent.stop'});
  await pause(160);
  return initial;
}
try {
  if(!process.env.WS_URL) {
    child=spawn(process.execPath,['--import','tsx','packages/server/src/index.ts'],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe'],windowsHide:true});
    child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
    await until(async()=>{
      if(child.exitCode!==null)throw new Error(`Isolated server exited ${child.exitCode}: ${output}`);
      // Check this child's listen log first so a busy port cannot make the test
      // accidentally use somebody else's running development server.
      if(!output.includes(`server on http://0.0.0.0:${port}`))return false;
      return fetch(healthUrl).then(response=>response.ok,()=>false);
    },'Isolated server did not start',15000);
  }
  const suffix=Date.now().toString(36);
  const realmA=`routing-a-${suffix}`,realmB=`routing-b-${suffix}`;
  const a=await connect(),b=await connect();
  a.send({type:'intent.stop'});
  await until(()=>a.messages.some(message=>message.type==='reject'&&message.reason==='Not authenticated'),'Unauthenticated intent was not rejected');
  a.send({type:'auth',protocolVersion:999,name:'Alpha',realm:realmA});
  await until(()=>a.messages.some(message=>message.type==='auth.fail'&&message.reason.includes('Protocol mismatch')),'Protocol mismatch not rejected');
  a.send({type:'auth',protocolVersion:1,name:'Alpha',realm:'bad realm!'});
  await until(()=>a.messages.some(message=>message.type==='auth.fail'&&message.reason.includes('Realm code')),'Invalid realm not rejected');
  await authenticate(a,'Alpha',realmA);
  await authenticate(b,'Bravo',realmB);
  assert.equal(a.auth.characterId,b.auth.characterId,'Fresh separate realms must deliberately reproduce the ID collision');
  assert.equal(a.auth.posseId,b.auth.posseId,'The posse IDs also overlap across isolated worlds');
  console.log(`Colliding identity: ${a.auth.characterId}, realms ${realmA} / ${realmB}`);
  const startB={x:boss(b).x,y:boss(b).y};
  await move(a,1,0);
  assert.ok(Math.hypot(boss(b).x-startB.x,boss(b).y-startB.y)<.05,'Realm A input must not move realm B');
  const stoppedA={x:boss(a).x,y:boss(a).y};
  await move(b,0,1);
  assert.ok(Math.hypot(boss(a).x-stoppedA.x,boss(a).y-stoppedA.y)<.05,'Realm B input must not move realm A');
  a.send({type:'auth',protocolVersion:1,name:'Intruder',realm:realmB});
  await until(()=>a.messages.some(message=>message.type==='auth.fail'&&message.reason==='Already authenticated'),'Repeated auth must not overwrite socket routing');
  let state=await health();
  assert.equal(state.byRealm[realmA],1);assert.equal(state.byRealm[realmB],1);
  const beforeClose=b.snapshot.tick;
  a.ws.close();await once(a.ws,'close');
  await until(async()=>{const h=await health();return h.byRealm[realmA]===undefined;},'Only closed realm A should be pruned');
  state=await health();assert.equal(state.byRealm[realmB],1,'Closing A cannot remove B with the same character ID');
  await until(()=>b.snapshot.tick>beforeClose,'Realm B snapshots must continue after A closes');
  await move(b,-1,0);
  b.ws.close();await once(b.ws,'close');
  await until(async()=>{const h=await health();return h.byRealm[realmB]===undefined;},'Realm B should prune after its own connection closes');
  console.log('REALM_ROUTING_OK: same-ID movement isolation, auth guards, close/prune isolation and surviving-session control');
} finally {
  for(const client of clients)if(client.ws.readyState!==WebSocket.CLOSED)client.ws.terminate();
  if(child&&child.exitCode===null){child.kill();await once(child,'exit');}
}
