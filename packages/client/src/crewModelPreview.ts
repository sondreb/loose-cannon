import type { UnitPublic } from "@loose-cannon/shared";
import type * as Three from "three";
import { modelCrewSkin, type ModelCrewSkin } from "./modelSprites.js";
import "./crew-model-preview.css";

type Preview = { panel: HTMLElement; skin: ModelCrewSkin; name: HTMLElement; dispose: () => void };
const previews = new WeakMap<HTMLElement, Preview>();

function disposeObject(root: Three.Object3D): void {
  const textures = new Set<Three.Texture>();
  const materials = new Set<Three.Material>();
  const geometry = new Set<Three.BufferGeometry>();
  root.traverse(object => {
    const mesh = object as Three.Mesh;
    if (mesh.geometry) geometry.add(mesh.geometry);
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value && typeof value === "object" && (value as Three.Texture).isTexture) textures.add(value as Three.Texture);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const value of geometry) value.dispose();
}

/** Dedicated nested panel; existing profile content is never replaced.
 * Call with open=false when the editor closes to release its WebGL context.
 */
export function syncCrewModelPreview(host: HTMLElement, unit: UnitPublic | null, open: boolean): void {
  const current = previews.get(host);
  if (!open || !unit) {
    current?.dispose();
    previews.delete(host);
    return;
  }
  const skin = modelCrewSkin(unit.id, unit.gender === "female", unit.armor);
  if (current?.skin === skin) {
    current.name.textContent = unit.name;
    if (!host.contains(current.panel)) host.append(current.panel);
    return;
  }
  current?.dispose();
  const panel = document.createElement("section");
  panel.className = "crew-model-preview";
  panel.setAttribute("aria-label", "Interactive crew model");
  const top = document.createElement("div");
  top.className = "crew-model-preview__header";
  const title = document.createElement("strong");
  title.textContent = unit.name;
  const badge = document.createElement("span");
  badge.textContent = "CREW INSPECTION";
  top.append(title, badge);
  const viewport = document.createElement("div");
  viewport.className = "crew-model-preview__viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "img");
  viewport.setAttribute("aria-label", "3D crew model. Drag or use left and right arrows to rotate. Use plus and minus to zoom.");
  const status = document.createElement("span");
  status.className = "crew-model-preview__status";
  status.textContent = "Getting the crew ready…";
  status.setAttribute("role", "status");
  viewport.append(status);
  const controls = document.createElement("div");
  controls.className = "crew-model-preview__controls";
  const makeButton = (text: string, label: string): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    controls.append(button);
    return button;
  };
  const idle = makeButton("Idle", "Play idle animation");
  const walk = makeButton("Walk", "Play walking animation");
  idle.setAttribute("aria-pressed", "true");
  walk.setAttribute("aria-pressed", "false");
  const hint = document.createElement("span");
  hint.className = "crew-model-preview__hint";
  hint.textContent = "DRAG TO TURN";
  controls.append(hint);
  const zoomOut = makeButton("−", "Zoom out");
  const zoomIn = makeButton("+", "Zoom in");
  const reset = makeButton("↺", "Reset model view");
  for (const button of [idle, walk, zoomOut, zoomIn, reset]) button.disabled = true;
  panel.append(top, viewport, controls);
  host.append(panel);

  let disposed = false;
  let cleanup = (): void => {};
  const controller = new AbortController();
  const state: Preview = {
    panel, skin, name: title,
    dispose: () => {
      disposed = true;
      controller.abort();
      cleanup();
      cleanup = () => {};
      panel.remove();
    },
  };
  previews.set(host, state);

  // These imports execute only when an editor actually opens.
  void Promise.all([import("three"), import("three/addons/loaders/GLTFLoader.js")]).then(async ([THREE, { GLTFLoader }]) => {
    if (disposed) return;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    viewport.append(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 30);
    const hemi = new THREE.HemisphereLight(0xc5d9e9, 0x463c34, 2.3);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffdfac, 3.8);
    key.position.set(-3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: .1, far: 15 });
    key.shadow.normalBias = .018;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x73b9d8, 2);
    rim.position.set(4, 3, -3);
    scene.add(rim);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(.60, .64, .07, 48), new THREE.MeshStandardMaterial({ color: 0x252c31, roughness: .88, metalness: .3 }));
    platform.position.y = -.055;
    platform.receiveShadow = true;
    scene.add(platform);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.595, .006, 5, 64), new THREE.MeshStandardMaterial({ color: 0xb0945d, roughness: .4, metalness: .65 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -.015;
    scene.add(ring);

    let frame = 0;
    let lastTime = 0;
    let visible = false;
    let yaw = -.65;
    let pitch = .19;
    let distance = 3.75;
    let mixer: Three.AnimationMixer | undefined;
    let model: Three.Group | undefined;
    let activeAction: Three.AnimationAction | undefined;
    let walking = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canDraw = (): boolean => !disposed && visible && !document.hidden && panel.isConnected && viewport.clientWidth > 0;
    const draw = (): void => {
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, 1.02 + Math.sin(pitch) * distance, Math.cos(yaw) * Math.cos(pitch) * distance);
      camera.lookAt(0, 1.02, 0);
      renderer.render(scene, camera);
    };
    const animate = (time: number): void => {
      frame = 0;
      if (!canDraw()) return;
      const delta = Math.min(.05, lastTime ? (time - lastTime) / 1000 : 0);
      lastTime = time;
      if (!reduceMotion || walking) mixer?.update(delta);
      draw();
      if (!reduceMotion || walking) frame = requestAnimationFrame(animate);
    };
    const wake = (): void => {
      if (canDraw() && !frame) {
        lastTime = 0;
        frame = requestAnimationFrame(animate);
      }
    };
    const pause = (): void => { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
    const resize = (): void => {
      const width = viewport.clientWidth;
      if (!width) return;
      renderer.setSize(width, 180, false);
      camera.aspect = width / 180;
      camera.updateProjectionMatrix();
      wake();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(viewport);
    const visibilityObserver = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) wake(); else pause();
    });
    visibilityObserver.observe(viewport);
    const visibilityChanged = (): void => { if (document.hidden) pause(); else wake(); };
    document.addEventListener("visibilitychange", visibilityChanged, { signal: controller.signal });
    cleanup = () => {
      pause();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      mixer?.stopAllAction();
      if (model) mixer?.uncacheRoot(model);
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    };

    const zoom = (delta: number): void => { distance = Math.max(2.65, Math.min(6, distance + delta)); wake(); };
    zoomIn.addEventListener("click", () => zoom(-.35), { signal: controller.signal });
    zoomOut.addEventListener("click", () => zoom(.35), { signal: controller.signal });
    reset.addEventListener("click", () => { yaw = -.65; pitch = .19; distance = 3.75; wake(); }, { signal: controller.signal });
    let pointer: { id: number; x: number; y: number } | undefined;
    viewport.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add("is-dragging");
    }, { signal: controller.signal });
    viewport.addEventListener("pointermove", event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      yaw -= (event.clientX - pointer.x) * .012;
      pitch = Math.max(-.12, Math.min(.68, pitch + (event.clientY - pointer.y) * .007));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      wake();
    }, { signal: controller.signal });
    const release = (): void => { pointer = undefined; viewport.classList.remove("is-dragging"); };
    viewport.addEventListener("pointerup", release, { signal: controller.signal });
    viewport.addEventListener("pointercancel", release, { signal: controller.signal });
    viewport.addEventListener("lostpointercapture", release, { signal: controller.signal });
    viewport.addEventListener("wheel", event => { event.preventDefault(); zoom(Math.sign(event.deltaY) * .15); }, { passive: false, signal: controller.signal });
    viewport.addEventListener("keydown", event => {
      if (event.key === "ArrowLeft") yaw -= .18;
      else if (event.key === "ArrowRight") yaw += .18;
      else if (event.key === "+" || event.key === "=") zoom(-.25);
      else if (event.key === "-") zoom(.25);
      else return;
      event.preventDefault();
      event.stopPropagation();
      wake();
    }, { signal: controller.signal });
    const gltf = await new GLTFLoader().loadAsync(`/art/models/${skin}.glb`);
    if (disposed) { disposeObject(gltf.scene); return; }
    model = gltf.scene;
    model.traverse(object => { if ((object as Three.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    scene.add(model);
    mixer = new THREE.AnimationMixer(model);
    const play = (walkCycle: boolean): void => {
      walking = walkCycle;
      const clip = gltf.animations.find(animation => animation.name === (walkCycle ? "Street walk" : "Armed idle"));
      if (clip && mixer) {
        const next = mixer.clipAction(clip);
        if (next !== activeAction) {
          activeAction?.fadeOut(.18);
          next.reset().fadeIn(.18).play();
          activeAction = next;
        }
      }
      idle.setAttribute("aria-pressed", String(!walkCycle));
      walk.setAttribute("aria-pressed", String(walkCycle));
      wake();
    };
    idle.addEventListener("click", () => play(false), { signal: controller.signal });
    walk.addEventListener("click", () => play(true), { signal: controller.signal });
    for (const button of [idle, walk, zoomOut, zoomIn, reset]) button.disabled = false;
    status.remove();
    play(false);
    resize();
  }).catch(error => {
    if (disposed) return;
    cleanup();
    cleanup = () => {};
    viewport.querySelector("canvas")?.remove();
    console.warn("[crew preview] 3D unavailable; showing crew sprite", error);
    const fallback = document.createElement("div");
    fallback.className = "crew-model-preview__fallback";
    fallback.style.backgroundImage = `url(/art/sprites/models/${skin}.png)`;
    viewport.prepend(fallback);
    status.textContent = "Crew portrait · 3D preview unavailable";
    status.classList.add("is-fallback");
  });
}
