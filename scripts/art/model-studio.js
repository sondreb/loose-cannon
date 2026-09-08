import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// Original hand-authored mesh recipes. Y is height; positive Z is forward.
const P = Math.PI;
const materials = new Map();
const grainCanvas=document.createElement('canvas');grainCanvas.width=128;grainCanvas.height=128;
const grainContext=grainCanvas.getContext('2d'),grainPixels=grainContext.createImageData(128,128);
let seed=9137;
for(let i=0;i<grainPixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=198+(seed%58);grainPixels.data[i]=n;grainPixels.data[i+1]=n;grainPixels.data[i+2]=n;grainPixels.data[i+3]=255;}
grainContext.putImageData(grainPixels,0,0);
const grain=new THREE.CanvasTexture(grainCanvas);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(2,2);grain.colorSpace=THREE.SRGBColorSpace;
function mat(color, roughness = .8, metalness = 0) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, map:grain }));
  return materials.get(key);
}
const M = {
  black: mat('#13171d'), rubber: mat('#161b20', .98), steel: mat('#777c80', .35, .8),
  chrome: mat('#b6c3bd', .25, .85), gun: mat('#333a43', .42, .75), skin: mat('#b98463'),
  glass: mat('#244853', .2, .55), leather: mat('#25282f', .55), sole: mat('#111517'),
  rust: mat('#794c37'), white: mat('#d2c6a7'), yellow: mat('#c5a238', .5, .4),
  red: mat('#971f31', .55), light: new THREE.MeshStandardMaterial({ color: '#ffe5a9', emissive: '#ffca79', emissiveIntensity: .8 }),
};
function mesh(parent, geo, material, x=0,y=0,z=0, name='') {
  const result = new THREE.Mesh(geo, material); result.position.set(x,y,z);
  result.castShadow = true; result.receiveShadow = true; if(name) result.name=name; parent.add(result); return result;
}
function box(parent,w,h,d,material,x=0,y=0,z=0,r=.025,name='') {
  return mesh(parent, new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)), material,x,y,z,name);
}
function ball(parent,x,y,z,sx,sy,sz,material) {
  const m=mesh(parent,new THREE.SphereGeometry(1,16,12),material,x,y,z);m.scale.set(sx,sy,sz);return m;
}
/** Profile-authored garment surface, with elliptical sections and folded seams. */
function garment(parent,profile,depth,material,x=0,y=0,z=0,name='garment') {
  const points=profile.map(([radius,height])=>new THREE.Vector2(radius,height));
  const result=mesh(parent,new THREE.LatheGeometry(points,24),material,x,y,z,name);
  result.scale.z=depth;return result;
}
function cylinder(parent,r1,r2,h,material,x,y,z,segments=16) {
  return mesh(parent,new THREE.CylinderGeometry(r1,r2,h,segments),material,x,y,z);
}
function rod(parent,a,b,r,material) {
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
  const result=cylinder(parent,r,r,delta.length(),material,...from.clone().add(to).multiplyScalar(.5).toArray(),10);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return result;
}
function label(text,fg='#dacfb6',bg='#202628') {
  const c=document.createElement('canvas'); c.width=256;c.height=128;const x=c.getContext('2d');
  x.fillStyle=bg;x.fillRect(0,0,256,128);x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';x.font='bold 48px monospace';x.fillText(text,128,64,236);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshStandardMaterial({map:t,roughness:.85});
}
function sign(parent,text,w,h,x,y,z,ry=0,bg) {
  const p=mesh(parent,new THREE.PlaneGeometry(w,h),label(text,undefined,bg),x,y,z);p.rotation.y=ry;return p;
}
function scuffs(parent,side,x,y,z,count=12,material=M.rust) {
  // Deterministic wear; shallow patches keep models readable at miniature scale.
  for(let i=0;i<count;i++) {
    const u=((i*37)%101)/101,v=((i*59)%97)/97;
    const q=box(parent,.025+u*.085,.008+v*.018,.005,material,x+u*.6,y+v*.35,z,.001);
    q.rotation.z=(u-.5)*.6;if(side)q.rotation.y=side;
  }
}
function pistol(parent,x,y,z) {
  const p=new THREE.Group();parent.add(p);p.position.set(x,y,z);
  box(p,.105,.115,.38,M.gun,0,0,.09,.012,'pistol-slide');
  box(p,.08,.16,.11,M.black,0,-.115,-.012,.012).rotation.x=-.18;
  box(p,.03,.025,.025,M.chrome,0,.068,.23,.002);
  const barrel=cylinder(p,.025,.025,.07,M.black,0,-.005,.31,12);barrel.rotation.x=P/2;
  return p;
}
function character(style) {
  const options={
    leather:{coat:'#343944',pants:'#33454b',skin:'#c48c66',hair:'#332923',shirt:'#b09c78'},
    bruiser:{coat:'#634248',pants:'#282e38',skin:'#9f674c',hair:'#191c20',shirt:'#b7a486'},
    enforcer:{coat:'#455645',pants:'#252e37',skin:'#b08060',hair:'#211d1a',shirt:'#555856'},
    runner:{coat:'#63383f',pants:'#2b3540',skin:'#c28e72',hair:'#2a1c1d',shirt:'#a99886'},
  }[style];
  const root=new THREE.Group();root.name=`crew-${style}`;
  const rig=new THREE.Group();rig.name='body';root.add(rig);
  const coat=mat(options.coat),pants=mat(options.pants),skin=mat(options.skin),hair=mat(options.hair),shirt=mat(options.shirt);
  const female=style==='runner',wide=style==='bruiser'?1.15:1;
  const chest=garment(rig,[[0,0],[.22,0],[.235,.045],[female?.17:.205,.22],[.235*wide,.39],[.265*wide,.47],[.225,.52],[.10,.59],[0,.59]],.59,coat,0,.925,0,'tailored-jacket');chest.rotation.x=-.04;
  box(rig,.25,.42,.022,shirt,0,1.28,.15,.012,'undershirt');
  for(const side of [-1,1]) {
    const lapel=box(rig,.095,.31,.033,coat,side*.133,1.35,.176,.014,'jacket-lapel');lapel.rotation.z=side*-.25;
    box(rig,.135,.14,.025,coat,side*.148,1.075,.16,.016,'jacket-pocket');
    box(rig,.12,.012,.015,M.black,side*.148,1.135,.179,.003);
    cylinder(rig,.014,.014,.016,M.steel,side*.148,1.085,.183,8).rotation.x=P/2;
  }
  box(rig,.43,.075,.29,M.leather,0,.946,0,.015,'belt');
  box(rig,.085,.065,.025,M.chrome,0,.95,.16,.004,'belt-buckle');
  box(rig,.055,.22,.055,M.black,.25,1.07,-.07,.005,'holster-strap');
  box(rig,.12,.23,.12,M.leather,.275,.9,-.06,.024,'holster');
  // Neck and shaped head, ears, brow, nose, lips, stubble, distinct hair silhouettes.
  cylinder(rig,.075,.085,.13,skin,0,1.56,0,12);
  ball(rig,0,1.745,0,.145,.19,.132,skin);
  box(rig,.19,.105,.15,skin,0,1.62,.027,.04,'jaw');
  for(const side of [-1,1])ball(rig,side*.139,1.73,0,.031,.052,.028,skin);
  box(rig,.17,.06,.045,mat('#665047'),0,1.635,.124,.018,'stubble');
  ball(rig,0,1.718,.135,.028,.042,.036,skin);
  box(rig,.07,.012,.012,mat('#704c42'),0,1.665,.155,.003);
  for(const side of [-1,1]) {
    const brow=box(rig,.058,.02,.013,hair,side*.066,1.787,.121,.006);brow.rotation.z=side*.13;
    ball(rig,side*.065,1.765,.128,.016,.009,.009,M.black);
  }
  ball(rig,0,1.84,-.025,.148,.115,.122,hair);
  if(female) {
    ball(rig,0,1.72,-.125,.13,.18,.068,hair);ball(rig,.04,1.68,-.22,.075,.15,.085,hair);
    box(rig,.045,.28,.018,M.chrome,.14,1.24,.181,.006,'zipper');
  } else if(style==='bruiser') {
    box(rig,.3,.055,.26,mat('#82333b'),0,1.81,0,.022,'bandana');
    box(rig,.08,.13,.025,mat('#82333b'),.10,1.75,-.14,.01).rotation.z=-.3;
  } else if(style==='enforcer') {
    cylinder(rig,.152,.16,.09,coat,0,1.865,0,20);
    box(rig,.27,.025,.23,coat,0,1.83,.11,.025,'cap-brim');
  } else {
    box(rig,.235,.038,.022,M.black,0,1.765,.143,.009,'sunglasses');
  }
  const legs=[],knees=[],arms=[];
  for(const side of [-1,1]) {
    const leg=new THREE.Group();leg.name=side<0?'legL':'legR';rig.add(leg);leg.position.set(side*.125,.92,0);legs.push(leg);
    leg.rotation.z=side*-.035;
    garment(leg,[[0,-.415],[.081,-.405],[.086,-.33],[.094,-.20],[.102,-.065],[.085,.008],[0,.008]],1.08,pants,0,0,0,'trouser-thigh');
    const knee=new THREE.Group();knee.name=side<0?'kneeL':'kneeR';leg.add(knee);knee.position.y=-.40;knees.push(knee);
    garment(knee,[[0,-.355],[.076,-.35],[.082,-.25],[.09,-.19],[.079,-.02],[0,0]],1.04,pants,0,0,-.018,'trouser-shin');
    box(leg,.13,.025,.033,mat('#202932'),0,-.395,.081,.01,'knee-fold').rotation.z=side*.13;
    box(leg,.13,.017,.027,pants,0,-.44,.077,.007,'knee-fold').rotation.z=side*-.16;
    box(knee,.21,.15,.32,M.leather,0,-.412,.062,.034,'boot');
    box(knee,.22,.032,.34,M.sole,0,-.48,.063,.012,'boot-sole');
    for(let i=0;i<3;i++)box(knee,.115,.013,.015,M.black,0,-.38+i*.021,.217,.003,'boot-lace');
    const arm=new THREE.Group();arm.name=side<0?'armL':'armR';rig.add(arm);arm.position.set(side*(.295*wide),1.46,0);arms.push(arm);
    garment(arm,[[0,-.27],[.079,-.26],[.092,-.13],[.105,.008],[.06,.069],[0,.078]],1.05,coat,0,0,0,'sleeve-upper');
    const elbow=new THREE.Group();arm.add(elbow);elbow.position.set(0,-.27,0);elbow.rotation.x=-.95;
    garment(elbow,[[0,-.25],[.069,-.245],[.078,-.12],[.084,-.035],[.06,.018],[0,.018]],1.08,coat,0,0,0,'sleeve-forearm');
    box(elbow,.165,.042,.175,M.leather,0,-.23,0,.014,'jacket-cuff');
    box(elbow,.13,.023,.034,coat,0,-.075,.081,.01,'elbow-fold').rotation.z=side*.19;
    box(elbow,.13,.017,.028,coat,0,-.108,.079,.008,'elbow-fold').rotation.z=side*-.12;
    ball(elbow,0,-.29,.015,.074,.078,.075,skin);
    arm.rotation.z=side*-.35;
    if(side<0)arm.rotation.y=.35;
    if(side===1){const gun=pistol(elbow,0,-.30,.075);gun.rotation.x=1.55;}
  }
  function pose(phase,walking) {
    rig.position.y=walking?-(1-Math.cos(Math.sin(phase)*.53))*.86:Math.sin(phase)*.008;
    rig.rotation.y=walking?Math.sin(phase)*.045:0;
    legs[0].rotation.x=walking?Math.sin(phase)*.53:0;
    legs[1].rotation.x=walking?-Math.sin(phase)*.53:0;
    knees[0].rotation.x=walking?Math.max(0,-Math.sin(phase))*.72:0;
    knees[1].rotation.x=walking?Math.max(0,Math.sin(phase))*.72:0;
    arms[0].rotation.x=-.58+(walking?-Math.sin(phase)*.18:Math.sin(phase)*.02);
    arms[1].rotation.x=-.60+(walking?Math.sin(phase)*.12:Math.sin(phase)*.025);
  }
  const times=Array.from({length:17},(_,i)=>i/16),tracks=[];
  for(const [limb,amplitude,offset] of [[legs[0],.53,0],[legs[1],-.53,0],[arms[0],-.18,-.58],[arms[1],.12,-.60]]) {
    const quaternions=[];for(const t of times){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(offset+Math.sin(t*2*P)*amplitude,limb.rotation.y,limb.rotation.z));quaternions.push(...q.toArray());}
    tracks.push(new THREE.QuaternionKeyframeTrack(`${limb.name}.quaternion`,times,quaternions));
  }
  for(let i=0;i<knees.length;i++) {
    const values=[];for(const t of times)values.push(...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.max(0,Math.sin(t*2*P)*(i===0?-1:1))*.72).toArray());
    tracks.push(new THREE.QuaternionKeyframeTrack(`${knees[i].name}.quaternion`,times,values));
  }
  const walkBody=[],idleBody=[];
  for(const t of times){walkBody.push(0,-(1-Math.cos(Math.sin(t*2*P)*.53))*.86,0);idleBody.push(0,Math.sin(t*2*P)*.008,0);}
  tracks.push(new THREE.VectorKeyframeTrack('body.position',times,walkBody));
  pose(0,false);return {root,pose,clips:[new THREE.AnimationClip('Street walk',1,tracks),new THREE.AnimationClip('Armed idle',2,[new THREE.VectorKeyframeTrack('body.position',times.map(t=>t*2),idleBody)])]};
}

function wheel(parent,x,z,r=.35,width=.19) {
  const tire=cylinder(parent,r,r,width,M.rubber,x,r,z,28);tire.rotation.z=P/2;
  const hub=cylinder(parent,r*.64,r*.64,width+.012,M.steel,x,r,z,24);hub.rotation.z=P/2;
  const cap=cylinder(parent,r*.27,r*.27,width+.024,M.chrome,x,r,z,16);cap.rotation.z=P/2;
  for(const side of [-1,1])for(let i=0;i<8;i++) {
    const a=i*P/4;const dot=cylinder(parent,.034,.034,.015,M.black,x+side*(width/2+.011),r+Math.cos(a)*r*.45,z+Math.sin(a)*r*.45,8);dot.rotation.z=P/2;
  }
}
function car(taxi) {
  const root=new THREE.Group();root.name=taxi?'checker-cab':'crime-sedan';const paint=taxi?M.yellow:mat('#39635d',.48,.45);
  box(root,1.56,.35,3.7,paint,0,.64,0,.13,'body-shell');
  box(root,1.48,.2,1.15,paint,0,.91,1.11,.065,'bonnet');
  box(root,1.47,.2,.8,paint,0,.90,-1.38,.065,'boot-lid');
  const cabinVertices=[-.65,.93,.71,.65,.93,.71,.65,.93,-1.04,-.65,.93,-1.04,-.56,1.455,.38,.56,1.455,.38,.56,1.455,-.80,-.56,1.455,-.80];
  const cabinGeometry=new THREE.BufferGeometry();cabinGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cabinVertices,3));
  cabinGeometry.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7]);
  cabinGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));cabinGeometry.computeVertexNormals();
  mesh(root,cabinGeometry,M.glass,0,0,0,'sloped-window-cabin');
  box(root,1.24,.095,1.18,paint,0,1.49,-.2,.06,'roof');
  for(const side of [-1,1]) {
    rod(root,[side*.63,.93,.71],[side*.56,1.46,.38],.047,paint);
    rod(root,[side*.63,.93,-1.04],[side*.56,1.46,-.8],.047,paint);
    box(root,.07,.51,.055,paint,side*.655,1.19,-.16,.009,'door-pillar');
    box(root,.035,.045,2.12,M.chrome,side*.783,.93,-.12,.008,'window-chrome');
    for(const z of [.27,-.6]) {
      box(root,.015,.24,.015,M.black,side*.785,.71,z-.35,.003,'door-seam');
      box(root,.025,.035,.15,M.chrome,side*.799,.85,z-.1,.009,'door-handle');
    }
    box(root,.13,.11,.22,paint,side*.82,1.05,.59,.02,'wing-mirror');
    box(root,.03,.028,3.1,M.chrome,side*.787,.56,0,.005,'side-trim');
    if(taxi)for(let i=0;i<17;i++)for(let row=0;row<2;row++)if((i+row)%2===0)box(root,.01,.055,.11,M.black,side*.79,.74+row*.057,-.91+i*.11,.001);
  }
  for(const x of [-.75,.75])for(const z of [-1.14,1.12])wheel(root,x,z);
  box(root,1.51,.13,.15,M.chrome,0,.5,1.89,.035,'front-bumper');
  box(root,1.51,.13,.15,M.chrome,0,.5,-1.89,.035,'rear-bumper');
  box(root,.75,.22,.025,M.black,0,.73,1.86,.01,'grille');
  for(let x=-.32;x<.34;x+=.064)box(root,.022,.18,.034,M.chrome,x,.73,1.88,.003);
  for(const side of [-1,1]) {
    box(root,.25,.18,.04,M.light,side*.60,.76,1.855,.018,'headlight');
    box(root,.29,.09,.04,M.red,side*.58,.79,-1.855,.015,'taillight');
    box(root,.12,.05,.04,mat('#b66b21'),side*.59,.60,1.86,.006,'turn-signal');
  }
  sign(root,'LC 74',.28,.12,0,.48,1.978);sign(root,'LC 74',.28,.12,0,.48,-1.978,P);
  if(taxi){box(root,.62,.17,.25,M.white,0,1.61,-.2,.03);sign(root,'TAXI',.5,.125,0,1.61,-.069);}
  for(const s of [-1,1]){scuffs(root,0,-.6,.59,s*1.868,14);}
  // Panel seam at bonnet and trunk, windshield wipers, aerial, exhaust.
  box(root,1.23,.008,.014,M.black,0,1.012,.7,.001);
  for(const side of [-1,1])rod(root,[side*.45,1.015,.702],[side*.13,1.055,.693],.008,M.black);
  rod(root,[-.59,1.02,-1.5],[-.59,1.88,-1.55],.008,M.steel);
  cylinder(root,.055,.055,.25,M.gun,.54,.35,-1.86,12).rotation.x=P/2;
  return {root};
}
function dumpster() {
  const root=new THREE.Group();root.name='back-alley-dumpster';const green=mat('#34534b',.8,.25),lid=mat('#1f3532',.7,.15);
  box(root,1.7,1.02,1.04,green,0,.65,0,.06,'steel-bin');
  for(const side of [-1,1]){box(root,.045,.85,1.08,green,side*.855,.62,0,.008);for(const z of [-.5,.5])box(root,.055,.85,.035,M.rust,side*.855,.62,z,.006);box(root,.12,.07,.35,M.steel,side*.93,.99,0,.015,'lifting-lug');}
  const top=box(root,1.8,.1,1.14,lid,0,1.22,-.035,.028,'ribbed-lid');top.rotation.x=-.07;
  for(let i=0;i<8;i++)box(root,.06,.035,1.02,lid,-.74+i*.21,1.285,-.035,.015);
  for(const x of [-.64,.64])for(const z of [-.36,.36]){box(root,.08,.17,.09,M.steel,x,.12,z,.008);const w=cylinder(root,.09,.09,.07,M.rubber,x,.07,z,12);w.rotation.z=P/2;}
  for(let i=0;i<6;i++)box(root,.04,.78,.035,lid,-.73+i*.29,.69,.533,.008);
  sign(root,'NO DUMPING',.85,.24,0,.81,.559,0,'#bcc0a7');
  sign(root,'RATS OWN THIS',.93,.17,-.10,.4,.56,0,'#34534b');scuffs(root,0,-.7,.15,.565,30);return {root};
}
function hydrant() {
  const root=new THREE.Group();root.name='cast-iron-hydrant';const red=mat('#9b4134',.7,.25);
  cylinder(root,.23,.28,.13,M.gun,0,.065,0,20);cylinder(root,.17,.19,.66,red,0,.46,0,20);
  cylinder(root,.23,.23,.06,red,0,.76,0,20);ball(root,0,.83,0,.19,.13,.19,red);
  cylinder(root,.065,.065,.085,M.gun,0,.965,0,6);
  for(const s of [-1,1]){const c=cylinder(root,.1,.115,.21,red,s*.215,.6,0,16);c.rotation.z=P/2;const cap=cylinder(root,.117,.117,.045,M.steel,s*.34,.6,0,12);cap.rotation.z=P/2;}
  const c=cylinder(root,.12,.12,.19,red,0,.38,.17,16);c.rotation.x=P/2;
  const cap=cylinder(root,.065,.065,.03,M.gun,0,.38,.28,6);cap.rotation.x=P/2;
  for(let i=0;i<12;i++){const a=i*2*P/12;ball(root,Math.cos(a)*.225,.135,Math.sin(a)*.225,.022,.015,.022,M.steel);}
  for(let i=0;i<8;i++){const a=i*P/7;const t=mesh(root,new THREE.TorusGeometry(.033,.008,5,8),M.gun,.16+Math.cos(a)*.18,.50-Math.sin(a)*.18,.04);t.rotation.y=i%2?P/2:0;}
  return {root};
}
function mailbox() {
  const root=new THREE.Group();root.name='city-mailbox';const blue=mat('#31596b',.68,.3);
  for(const x of [-.24,.24])box(root,.1,.53,.48,blue,x,.27,0,.02);
  box(root,.67,.75,.57,blue,0,.85,0,.08,'letter-box');
  const cap=cylinder(root,.33,.33,.57,blue,0,1.21,0,24);cap.rotation.x=P/2;
  box(root,.5,.095,.035,M.black,0,1.18,.291,.015,'mail-slot');
  box(root,.53,.037,.085,blue,0,1.13,.326,.01);
  sign(root,'POST',.44,.2,0,.88,.292);
  box(root,.37,.34,.02,blue,0,.72,.3,.012);box(root,.025,.05,.035,M.chrome,.14,.76,.322,.004);
  scuffs(root,0,-.27,.46,.325,14);return {root};
}
function phonebooth() {
  const root=new THREE.Group();root.name='corner-payphone';const teal=mat('#41777a',.52,.45);
  box(root,.95,.12,.92,M.gun,0,.06,0,.025,'base');
  for(const x of [-.43,.43])for(const z of [-.38,.38])box(root,.075,2.23,.075,teal,x,1.16,z,.012,'frame-post');
  box(root,.96,.16,.96,teal,0,2.28,0,.03,'canopy');
  sign(root,'PHONE',.81,.145,0,2.28,.489);
  box(root,.78,1.75,.04,mat('#284344',.4,.45),0,1.22,-.39,.004,'back-panel');
  for(const s of [-1,1]) {
    const glass=new THREE.MeshStandardMaterial({color:'#4c8185',transparent:true,opacity:.32,roughness:.2,metalness:.1,side:THREE.DoubleSide});
    box(root,.018,1.73,.68,glass,s*.427,1.22,0,.003,'side-glass');
    box(root,.03,.045,.77,teal,s*.427,.7,0,.004);
  }
  box(root,.46,.68,.18,M.steel,0,1.37,-.23,.035,'payphone');
  box(root,.22,.16,.03,M.black,.055,1.56,-.127,.009,'display');
  for(let row=0;row<4;row++)for(let col=0;col<3;col++)box(root,.035,.03,.02,M.chrome,-.025+col*.057,1.40-row*.049,-.128,.004,'key');
  box(root,.11,.33,.08,M.black,-.16,1.42,-.08,.027,'receiver');
  box(root,.13,.09,.09,M.black,-.16,1.57,-.08,.025);box(root,.13,.09,.09,M.black,-.16,1.26,-.08,.025);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.16,1.27,-.08),new THREE.Vector3(-.23,.92,.02),new THREE.Vector3(.12,.88,.02),new THREE.Vector3(.15,1.16,-.13)]);
  mesh(root,new THREE.TubeGeometry(curve,32,.013,6,false),M.black);
  box(root,.35,.04,.31,M.steel,0,1.0,-.18,.008,'shelf');
  sign(root,'CALL YOUR MA',.54,.17,0,.55,-.36,0,'#39413a');return {root};
}
function motorcycle() {
  const root=new THREE.Group();root.name='street-chopper';const petrol=mat('#325455',.4,.55);
  wheel(root,0,-.70,.36,.16);wheel(root,0,.83,.36,.16);
  for(const s of [-1,1]) {
    rod(root,[s*.08,.42,-.7],[s*.17,.76,-.25],.035,M.gun);
    rod(root,[s*.17,.76,-.25],[s*.12,.44,.3],.04,M.gun);
    rod(root,[s*.12,.44,.3],[s*.1,1.04,.54],.035,M.chrome);
    rod(root,[s*.1,1.04,.54],[s*.08,.36,.83],.028,M.chrome);
    rod(root,[s*.08,.36,.83],[s*.08,.79,.68],.041,M.steel);
    rod(root,[s*.11,1.03,.52],[s*.28,1.16,.41],.025,M.chrome);
    rod(root,[s*.28,1.16,.41],[s*.36,1.16,.30],.036,M.black);
    rod(root,[s*.13,.53,-.1],[s*.3,.3,-.45],.047,M.chrome);
    rod(root,[s*.3,.3,-.45],[s*.3,.3,-.93],.064,M.chrome);
  }
  ball(root,0,.9,.14,.225,.185,.35,petrol);
  cylinder(root,.045,.045,.018,M.chrome,0,1.075,.13,14);
  box(root,.37,.09,.49,M.leather,0,.86,-.35,.055,'saddle');
  box(root,.22,.27,.3,M.gun,0,.56,-.03,.025,'engine');
  for(let i=0;i<7;i++)box(root,.32,.024,.32,M.steel,0,.45+i*.039,-.03,.005,'engine-fin');
  const headlight=cylinder(root,.13,.13,.13,M.chrome,0,1.04,.65,20);headlight.rotation.x=P/2;
  const lamp=cylinder(root,.109,.109,.014,M.light,0,1.04,.722,20);lamp.rotation.x=P/2;
  box(root,.17,.075,.05,M.red,0,.8,-.68,.012,'rear-light');
  for(const s of [-1,1]){rod(root,[s*.26,1.17,.36],[s*.29,1.34,.36],.012,M.chrome);ball(root,s*.29,1.34,.36,.07,.044,.018,M.chrome);}
  box(root,.4,.055,.39,petrol,0,.75,-.7,.04,'rear-fender');return {root};
}
function cone() {
  const root=new THREE.Group();root.name='traffic-cone';const orange=mat('#c47732');
  box(root,.53,.06,.53,M.rubber,0,.03,0,.028);cylinder(root,.045,.21,.65,orange,0,.38,0,24);
  cylinder(root,.102,.14,.145,M.white,0,.415,0,24);return {root};
}

function b64(buffer){let out='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(out);}
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(2);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
scene.add(new THREE.HemisphereLight('#c5d9e9','#463c34',2.3));
const key=new THREE.DirectionalLight('#ffdfac',3.8);key.position.set(-4,8,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;key.shadow.normalBias=.02;key.shadow.bias=-.0005;scene.add(key);
const rim=new THREE.DirectionalLight('#73b9d8',2);rim.position.set(5,4,-5);scene.add(rim);
const fill=new THREE.DirectionalLight('#b88cac',.7);fill.position.set(-5,2,-2);scene.add(fill);
// Ground catches only a subtle physical contact shadow, preserving true alpha.
const ground=mesh(scene,new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:.24}),0,-.012,0);ground.rotation.x=-P/2;ground.castShadow=false;
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
const exporter=new GLTFExporter();
const specs={
  leather:{w:96,h:128,view:2.7,anchor:.86,display:68,frames:12},
  bruiser:{w:96,h:128,view:2.7,anchor:.86,display:68,frames:12},
  enforcer:{w:96,h:128,view:2.7,anchor:.86,display:68,frames:12},
  runner:{w:96,h:128,view:2.7,anchor:.86,display:68,frames:12},
  taxi:{w:256,h:192,view:4.8,anchor:.75,display:110,frames:1},
  sedan:{w:256,h:192,view:4.8,anchor:.75,display:110,frames:1},
  dumpster:{w:160,h:160,view:2.7,anchor:.79,display:77,frames:1},
  motorcycle:{w:160,h:160,view:2.8,anchor:.78,display:82,frames:1},
  phonebooth:{w:128,h:192,view:3.35,anchor:.86,display:110,frames:1},
  mailbox:{w:96,h:128,view:2.1,anchor:.84,display:66,frames:1},
  hydrant:{w:96,h:128,view:1.6,anchor:.82,display:52,frames:1},
  cone:{w:96,h:96,view:1.25,anchor:.81,display:36,frames:1},
};
async function bake(name,asset) {
  const spec=specs[name],{root}=asset;root.rotation.y=0;
  root.userData={author:'Loose Cannon',license:'Original project asset',units:'meters',...root.userData};
  const glb=await exporter.parseAsync(root,{binary:true,animations:asset.clips??[]});
  await window.saveAsset(`models/${name}.glb`,b64(glb));
  const sheet=document.createElement('canvas');sheet.width=spec.w*spec.frames;sheet.height=spec.h*8;const ctx=sheet.getContext('2d');
  renderer.setSize(spec.w,spec.h);scene.add(root);
  const aspect=spec.w/spec.h,half=spec.view/2;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
  // True 2:1 dimetric projection, the same plane as shared worldToScreen.
  const elevation=Math.asin(.5);const targetY=(spec.anchor-.5)*spec.view/Math.cos(elevation);
  const target=new THREE.Vector3(0,targetY,0);camera.position.set(10,10,10);camera.position.sub(new THREE.Vector3(0,10,0));camera.position.y=Math.sqrt(200)*Math.tan(elevation);camera.position.add(target);camera.lookAt(target);camera.updateProjectionMatrix();
  for(let direction=0;direction<8;direction++) {
    // World y maps to +Z. Camera right is +X -Z, exactly the game's iso transform.
    const a=direction*P/4-P;root.rotation.y=P/2-a;
    for(let frame=0;frame<spec.frames;frame++) {
      if(asset.pose)asset.pose(frame<4?frame/4*2*P:(frame-4)/8*2*P,frame>=4);
      renderer.render(scene,camera);
      ctx.drawImage(renderer.domElement,frame*spec.w,direction*spec.h,spec.w,spec.h);
    }
  }
  scene.remove(root);
  await window.saveAsset(`sprites/models/${name}.png`,sheet.toDataURL('image/png').split(',')[1]);
  root.rotation.y=-P/12;if(asset.pose)asset.pose(0,false);
  return root;
}
window.generateAssets=async()=>{
  const models=[];
  for(const style of ['leather','bruiser','enforcer','runner'])models.push(await bake(style,character(style)));
  for(const [name,asset]of [['taxi',car(true)],['sedan',car(false)],['dumpster',dumpster()],['motorcycle',motorcycle()],['phonebooth',phonebooth()],['mailbox',mailbox()],['hydrant',hydrant()],['cone',cone()]])models.push(await bake(name,asset));
  await window.saveAsset('sprites/models/manifest.json',b64(new TextEncoder().encode(JSON.stringify({version:1,directions:8,idleFrames:4,walkFrames:8,specs},null,2))));
  // A reviewable studio contact sheet is delivered with the exportable assets.
  const board=document.createElement('canvas');board.width=1440;board.height=1000;const ctx=board.getContext('2d');ctx.fillStyle='#151c24';ctx.fillRect(0,0,1440,1000);ctx.fillStyle='#ead5b1';ctx.font='bold 30px sans-serif';ctx.fillText('LOOSE CANNON / ORIGINAL 3D CAST + STREET KIT',35,46);
  const names=Object.keys(specs);
  for(let i=0;i<models.length;i++){
    const model=models[i],spec=specs[names[i]],col=i%4,row=Math.floor(i/4);renderer.setSize(320,270);const half=spec.view/2;camera.left=-half*320/270;camera.right=half*320/270;camera.top=half;camera.bottom=-half;const y=(spec.anchor-.5)*spec.view;camera.position.set(10,10+y,10);camera.lookAt(0,y,0);camera.updateProjectionMatrix();scene.add(model);renderer.render(scene,camera);ctx.drawImage(renderer.domElement,30+col*355,80+row*300,320,270);scene.remove(model);ctx.font='16px monospace';ctx.fillStyle='#a5b3ba';ctx.fillText(names[i].toUpperCase()+' / GLB',40+col*355,365+row*300);
  }
  await window.saveAsset('models/studio-preview.png',board.toDataURL('image/png').split(',')[1]);
  console.log('12 exportable GLB models, 8-way atlases, 4-frame idle + 8-frame walk complete.');
};
window.studioReady=true;
