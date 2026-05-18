import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const DEFAULTS = {
  title: "The Art Of Acceptance",
  artist: "Protoje",
  format: "2LP",
  sleeve: "gatefold",
  vinylColor: "#6db7ff",
  marble: true,
  autoRotate: true,
  exposure: 1.08,
  opening: 10,
  discOffset: 0.72,
  background: "#f5f5f1",
  shadow: true,
};

const VIEW_TABS = ["Preview", "Front", "Back", "Disc", "Disc 2", "Show 3D"];

function fileURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) value.dispose();
      });
      material.dispose?.();
    });
  });
}

function coverCanvas({ title, artist, dark = false, accent = "#6db7ff" }) {
  const c = document.createElement("canvas");
  c.width = 1400;
  c.height = 1400;
  const ctx = c.getContext("2d");

  const g = ctx.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, dark ? "#101015" : accent);
  g.addColorStop(0.58, dark ? "#24232b" : "#f6f0df");
  g.addColorStop(1, dark ? "#030305" : "#ffffff");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.globalAlpha = dark ? 0.22 : 0.16;
  ctx.fillStyle = dark ? "#ffffff" : "#000000";
  for (let i = 0; i < 34; i += 1) {
    const x = ((i * 211) % c.width) - 120;
    const y = ((i * 389) % c.height) - 120;
    ctx.beginPath();
    ctx.arc(x, y, 160 + ((i * 17) % 180), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = dark ? "#f7f7f7" : "#111111";
  ctx.textAlign = "left";
  ctx.font = "700 96px Inter, Arial, sans-serif";
  wrapText(ctx, title || "Vinyl mockup", 96, 180, 1100, 108);
  ctx.font = "500 44px Inter, Arial, sans-serif";
  ctx.fillText(artist || "Artist", 96, 1230);

  ctx.strokeStyle = dark ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.35)";
  ctx.lineWidth = 8;
  ctx.strokeRect(68, 68, 1264, 1264);
  return c;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, y);
}

async function imageTexture(src, fallbackCanvas) {
  const texture = src
    ? await new THREE.TextureLoader().loadAsync(src).catch(() => null)
    : null;
  const finalTexture = texture || new THREE.CanvasTexture(fallbackCanvas);
  finalTexture.colorSpace = THREE.SRGBColorSpace;
  finalTexture.anisotropy = 8;
  finalTexture.needsUpdate = true;
  return finalTexture;
}

function drawImageCover(ctx, img, x, y, w, h) {
  const ratio = Math.max(w / img.width, h / img.height);
  const nw = img.width * ratio;
  const nh = img.height * ratio;
  ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
}

async function discTexture({ vinyl, label, color, marble, title }) {
  const c = document.createElement("canvas");
  c.width = 1400;
  c.height = 1400;
  const ctx = c.getContext("2d");
  const cx = c.width / 2;
  const cy = c.height / 2;
  const r = 650;

  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  const vinylImg = await loadImage(vinyl).catch(() => null);
  if (vinylImg) {
    drawImageCover(ctx, vinylImg, cx - r, cy - r, r * 2, r * 2);
  } else {
    const radial = ctx.createRadialGradient(cx, cy, 60, cx, cy, r);
    radial.addColorStop(0, "#f8fbff");
    radial.addColorStop(0.13, color);
    radial.addColorStop(0.68, color);
    radial.addColorStop(1, "#265979");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, c.width, c.height);

    if (marble) {
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < 52; i += 1) {
        const a = i * 0.77;
        const rr = 100 + ((i * 89) % 560);
        const x = cx + Math.cos(a) * rr * 0.3;
        const y = cy + Math.sin(a) * rr * 0.3;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 260 + ((i * 23) % 180));
        g.addColorStop(0, i % 2 ? "rgba(255,255,255,.85)" : "rgba(15,40,70,.85)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.globalAlpha = 1;
    }
  }

  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = "rgba(0,0,0,.15)";
  for (let rr = 180; rr < r; rr += 24) {
    ctx.lineWidth = rr % 72 === 0 ? 2.1 : 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  const shine = ctx.createLinearGradient(260, 100, 980, 1220);
  shine.addColorStop(0, "rgba(255,255,255,.38)");
  shine.addColorStop(0.33, "rgba(255,255,255,0)");
  shine.addColorStop(0.7, "rgba(255,255,255,.2)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, c.width, c.height);

  const labelR = 190;
  ctx.beginPath();
  ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
  ctx.clip();
  const labelImg = await loadImage(label).catch(() => null);
  if (labelImg) {
    drawImageCover(ctx, labelImg, cx - labelR, cy - labelR, labelR * 2, labelR * 2);
  } else {
    const lg = ctx.createLinearGradient(cx - labelR, cy - labelR, cx + labelR, cy + labelR);
    lg.addColorStop(0, "#f8f1d6");
    lg.addColorStop(1, "#dfc784");
    ctx.fillStyle = lg;
    ctx.fillRect(cx - labelR, cy - labelR, labelR * 2, labelR * 2);
    ctx.fillStyle = "rgba(0,0,0,.72)";
    ctx.font = "700 40px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(title || "VINYL").slice(0, 18).toUpperCase(), cx, cy + 12);
  }

  ctx.restore();

  ctx.fillStyle = "#f9f9f9";
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function makeShadow() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(256, 128, 30, 256, 128, 240);
  g.addColorStop(0, "rgba(0,0,0,.34)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

async function buildProduct({ sources, settings }) {
  const group = new THREE.Group();
  group.name = "vinyl-product";
  group.rotation.set(-0.08, -0.22, 0.01);

  const frontTexture = await imageTexture(
    sources.front,
    coverCanvas({ title: settings.title, artist: settings.artist, accent: settings.vinylColor })
  );
  const backTexture = await imageTexture(
    sources.back,
    coverCanvas({ title: "BACK COVER", artist: settings.artist, dark: true, accent: settings.vinylColor })
  );
  const recordTexture = await discTexture({
    vinyl: sources.vinyl,
    label: sources.label,
    color: settings.vinylColor,
    marble: settings.marble,
    title: settings.title,
  });

  const size = 3;
  const thickness = 0.085;
  const discRadius = 1.45;
  const discDepth = 0.045;
  const sleeveX = -0.45;
  const sleeveZ = 0;
  const discX = sleeveX + settings.discOffset * size;

  const edge = new THREE.MeshStandardMaterial({ color: "#171719", roughness: 0.78, metalness: 0.04 });
  const front = new THREE.MeshStandardMaterial({ map: frontTexture, roughness: 0.68, metalness: 0.02 });
  const back = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.72, metalness: 0.02 });
  const sleeveMaterials = [edge, edge, edge, edge, front, back];
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(size, size, thickness), sleeveMaterials);
  sleeve.position.set(sleeveX, 0, sleeveZ);
  sleeve.castShadow = true;
  sleeve.receiveShadow = true;
  group.add(sleeve);

  if (settings.sleeve === "gatefold") {
    const opening = THREE.MathUtils.degToRad(Number(settings.opening) || 0);
    const pivot = new THREE.Group();
    pivot.position.set(sleeveX - size / 2, 0, -thickness * 0.64);
    pivot.rotation.y = -opening;
    const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(size, size, thickness * 0.92), [edge, edge, edge, edge, back, front]);
    leftPanel.position.set(-size / 2, 0, 0);
    leftPanel.castShadow = true;
    leftPanel.receiveShadow = true;
    pivot.add(leftPanel);
    group.add(pivot);
  }

  const sideMat = new THREE.MeshStandardMaterial({
    color: settings.vinylColor,
    roughness: 0.38,
    metalness: 0.04,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    map: recordTexture,
    roughness: 0.28,
    metalness: 0.08,
  });
  const discGeometry = new THREE.CylinderGeometry(discRadius, discRadius, discDepth, 192, 1, false);

  const disc1 = new THREE.Mesh(discGeometry, [sideMat, faceMat, faceMat]);
  disc1.rotation.x = Math.PI / 2;
  disc1.position.set(discX, 0, -0.08);
  disc1.name = "rotating-disc-1";
  disc1.castShadow = true;
  disc1.receiveShadow = true;
  group.add(disc1);

  if (settings.format === "2LP") {
    const disc2 = new THREE.Mesh(discGeometry.clone(), [sideMat.clone(), faceMat.clone(), faceMat.clone()]);
    disc2.rotation.x = Math.PI / 2;
    disc2.position.set(discX + 0.11, -0.08, -0.19);
    disc2.name = "rotating-disc-2";
    disc2.castShadow = true;
    disc2.receiveShadow = true;
    group.add(disc2);
  }

  if (settings.shadow) {
    const shadowTexture = makeShadow();
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.2),
      new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false })
    );
    shadow.position.set(0.08, -1.72, -0.34);
    shadow.rotation.x = -Math.PI / 2;
    group.add(shadow);
  }

  return group;
}

function UploadBox({ label, value, onChange, hint }) {
  const ref = useRef(null);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3">
      <button type="button" onClick={() => ref.current?.click()} className="flex w-full items-center gap-3 text-left">
        <input
          ref={ref}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) onChange(await fileURL(file));
          }}
        />
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
          {value ? <img src={value} className="h-full w-full object-cover" alt="" /> : <span className="text-xs text-neutral-400">image</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-950">{label}</div>
          <div className="mt-1 truncate text-xs text-neutral-500">{value ? "Image chargée" : hint}</div>
        </div>
        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600">Choisir</span>
      </button>
      {value && (
        <button type="button" onClick={() => onChange("")} className="mt-3 text-xs font-semibold text-neutral-500 hover:text-neutral-950">
          Retirer
        </button>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function Range({ label, value, min, max, step, onChange, suffix = "" }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-800">
      <span className="flex justify-between gap-2">
        {label}
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-neutral-500 ring-1 ring-neutral-200">
          {value}{suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-neutral-950"
      />
    </label>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-800">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
      />
    </label>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-800">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
      >
        {children}
      </select>
    </label>
  );
}

function ProductPreview({ activeTab, setActiveTab, sources, settings }) {
  const isDiscOnly = activeTab === "Disc" || activeTab === "Disc 2";
  const showBack = activeTab === "Back";
  const showPreview = activeTab === "Preview" || activeTab === "Show 3D" || activeTab === "Front" || activeTab === "Back";

  return (
    <div className="rounded-[2rem] bg-white p-4 text-neutral-950 shadow-2xl ring-1 ring-black/10">
      <div className="mb-4 flex flex-wrap gap-2">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${activeTab === tab ? "bg-neutral-950 text-white" : "bg-neutral-100 text-neutral-600"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl bg-[#f7f7f3]">
        {isDiscOnly ? (
          <div
            className="relative aspect-square w-[72%] rounded-full shadow-2xl"
            style={{ background: sources.vinyl ? `url(${sources.vinyl}) center/cover` : `radial-gradient(circle, #f8fbff 0 12%, ${settings.vinylColor} 13% 72%, #315d78 100%)` }}
          >
            <div className="absolute inset-[21%] rounded-full bg-[#f5df9f] shadow-inner" style={{ backgroundImage: sources.label ? `url(${sources.label})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,rgba(0,0,0,.18)_0_1px,transparent_1px_18px)] mix-blend-multiply" />
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        ) : (
          showPreview && (
            <div className="relative h-[70%] w-[84%]">
              <div
                className="absolute left-[43%] top-1/2 aspect-square h-[94%] -translate-y-1/2 rounded-full shadow-2xl"
                style={{ background: sources.vinyl ? `url(${sources.vinyl}) center/cover` : `radial-gradient(circle, #fff 0 11%, ${settings.vinylColor} 12% 72%, #315d78 100%)` }}
              >
                <div className="absolute inset-[24%] rounded-full bg-[#f4d893]" style={{ backgroundImage: sources.label ? `url(${sources.label})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
                <div className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,rgba(0,0,0,.16)_0_1px,transparent_1px_18px)] mix-blend-multiply" />
              </div>
              <div className="absolute left-0 top-1/2 aspect-square h-full -translate-y-1/2 overflow-hidden rounded-[3px] bg-neutral-900 shadow-2xl">
                {showBack && sources.back ? (
                  <img src={sources.back} className="h-full w-full object-cover" alt="" />
                ) : sources.front ? (
                  <img src={sources.front} className="h-full w-full object-cover" alt="" />
                ) : (
                  <div className="grid h-full w-full content-between bg-gradient-to-br from-sky-300 via-amber-50 to-white p-8">
                    <div className="text-3xl font-black leading-none">{settings.title}</div>
                    <div className="text-sm font-bold uppercase tracking-[0.24em]">{settings.artist}</div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function ThreeViewer({ sources, settings, active, onReady }) {
  const mount = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const productRef = useRef(null);
  const frameRef = useRef(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const el = mount.current;
    if (!el) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(settings.background);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.34, 6.7);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = settings.exposure;
    rendererRef.current = renderer;
    el.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x777777, 2.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 4.2);
    key.position.set(2.2, 3.2, 5.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(-3.4, 0.4, -3.6);
    scene.add(rim);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = 4.5;
    controls.maxDistance = 10;
    controls.autoRotateSpeed = 1.15;
    controlsRef.current = controls;

    const resize = () => {
      const width = Math.max(320, el.clientWidth);
      const height = Math.max(320, el.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    const tick = () => {
      if (controlsRef.current) {
        controlsRef.current.autoRotate = !!settingsRef.current.autoRotate && active;
        controlsRef.current.update();
      }
      if (productRef.current) {
        productRef.current.traverse((child) => {
          if (child.name?.startsWith("rotating-disc")) child.rotation.z += 0.012;
        });
      }
      renderer.toneMappingExposure = Number(settingsRef.current.exposure) || 1;
      scene.background = new THREE.Color(settingsRef.current.background || "#f5f5f1");
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();

    onReady?.({
      exportPNG: () => renderer.domElement.toDataURL("image/png"),
      resetCamera: () => {
        camera.position.set(0, 0.34, 6.7);
        controls.target.set(0, 0, 0);
        controls.update();
      },
    });

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      disposeObject(scene);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const scene = sceneRef.current;
    if (!scene) return undefined;

    buildProduct({ sources, settings }).then((product) => {
      if (cancelled) {
        disposeObject(product);
        return;
      }
      if (productRef.current) {
        scene.remove(productRef.current);
        disposeObject(productRef.current);
      }
      productRef.current = product;
      scene.add(product);
    });

    return () => {
      cancelled = true;
    };
  }, [sources, settings.title, settings.artist, settings.format, settings.sleeve, settings.vinylColor, settings.marble, settings.opening, settings.discOffset, settings.shadow]);

  return <div ref={mount} className="h-full min-h-[520px] w-full overflow-hidden rounded-[2rem] bg-neutral-100" />;
}

export default function App() {
  const [sources, setSources] = useState({ front: "", back: "", vinyl: "", label: "" });
  const [settings, setSettings] = useState(DEFAULTS);
  const [activeTab, setActiveTab] = useState("Show 3D");
  const viewerApi = useRef(null);

  const is3D = activeTab === "Show 3D";
  const setSource = useCallback((key, value) => setSources((old) => ({ ...old, [key]: value })), []);
  const update = useCallback((key, value) => setSettings((old) => ({ ...old, [key]: value })), []);

  const loadedCount = useMemo(() => Object.values(sources).filter(Boolean).length, [sources]);

  function downloadPNG() {
    const data = viewerApi.current?.exportPNG?.();
    if (!data) return;
    const link = document.createElement("a");
    link.href = data;
    link.download = "vinyl-3d-viewer.png";
    link.click();
  }

  return (
    <div className="min-h-screen bg-[#0b0b0c] text-neutral-100">
      <header className="border-b border-white/10 bg-neutral-950 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-neutral-500">Vinyl interactive mockup</p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Visualiseur 3D vinyle type Diggers</h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
            <span className="rounded-full border border-white/10 px-3 py-1">{settings.format}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">{settings.sleeve}</span>
            <span className="rounded-full border border-white/10 px-3 py-1">{loadedCount}/4 images</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-[420px_1fr]">
        <aside className="space-y-4 rounded-[2rem] bg-white p-4 text-neutral-950 shadow-2xl md:p-5">
          <Section title="Images produit">
            <div className="grid gap-3">
              <UploadBox label="Pochette recto" value={sources.front} onChange={(v) => setSource("front", v)} hint="cover.jpg ou visuel carré" />
              <UploadBox label="Pochette verso" value={sources.back} onChange={(v) => setSource("back", v)} hint="optionnel, utile pour la rotation" />
              <UploadBox label="Texture vinyle" value={sources.vinyl} onChange={(v) => setSource("vinyl", v)} hint="PNG/JPG du disque, sinon marbré généré" />
              <UploadBox label="Macaron central" value={sources.label} onChange={(v) => setSource("label", v)} hint="optionnel" />
            </div>
          </Section>

          <Section title="Données & format">
            <div className="grid gap-4">
              <Field label="Titre" value={settings.title} onChange={(v) => update("title", v)} />
              <Field label="Artiste" value={settings.artist} onChange={(v) => update("artist", v)} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Format" value={settings.format} onChange={(v) => update("format", v)}>
                  <option value="1LP">1LP</option>
                  <option value="2LP">2LP</option>
                </Select>
                <Select label="Pochette" value={settings.sleeve} onChange={(v) => update("sleeve", v)}>
                  <option value="single">Single sleeve</option>
                  <option value="gatefold">Gatefold</option>
                </Select>
              </div>
            </div>
          </Section>

          <Section title="Rendu 3D">
            <div className="grid gap-4">
              <Field label="Couleur du vinyle" type="color" value={settings.vinylColor} onChange={(v) => update("vinylColor", v)} />
              <Range label="Sortie du disque" value={settings.discOffset} min="0.48" max="0.9" step="0.01" onChange={(v) => update("discOffset", v)} />
              <Range label="Ouverture gatefold" value={settings.opening} min="0" max="70" step="1" suffix="°" onChange={(v) => update("opening", v)} />
              <Range label="Exposition" value={settings.exposure} min="0.55" max="1.7" step="0.01" onChange={(v) => update("exposure", v)} />
              <Field label="Fond" type="color" value={settings.background} onChange={(v) => update("background", v)} />
              <label className="flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-medium ring-1 ring-neutral-200">
                <input type="checkbox" checked={settings.marble} onChange={(e) => update("marble", e.target.checked)} className="accent-neutral-950" />
                Générer un effet marbré si aucun vinyle n’est importé
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-medium ring-1 ring-neutral-200">
                <input type="checkbox" checked={settings.autoRotate} onChange={(e) => update("autoRotate", e.target.checked)} className="accent-neutral-950" />
                Rotation automatique du modèle
              </label>
              <label className="flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-medium ring-1 ring-neutral-200">
                <input type="checkbox" checked={settings.shadow} onChange={(e) => update("shadow", e.target.checked)} className="accent-neutral-950" />
                Ombre au sol
              </label>
            </div>
          </Section>

          <Section title="Export">
            <div className="grid gap-3">
              <button type="button" onClick={() => viewerApi.current?.resetCamera?.()} className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-neutral-50">
                Réinitialiser la caméra
              </button>
              <button type="button" onClick={downloadPNG} className="rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40" disabled={!is3D}>
                Exporter une capture PNG
              </button>
            </div>
          </Section>
        </aside>

        <main className="grid gap-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:grid-rows-[auto_1fr]">
          <ProductPreview activeTab={activeTab} setActiveTab={setActiveTab} sources={sources} settings={settings} />

          <div className="min-h-[560px] rounded-[2rem] border border-white/10 bg-neutral-950 p-3 shadow-2xl md:p-4">
            {is3D ? (
              <ThreeViewer sources={sources} settings={settings} active={is3D} onReady={(api) => { viewerApi.current = api; }} />
            ) : (
              <div className="grid h-full min-h-[520px] place-items-center rounded-[2rem] bg-neutral-100 p-6 text-center text-neutral-950">
                <div>
                  <div className="text-sm font-bold uppercase tracking-[0.28em] text-neutral-400">Aperçu 2D</div>
                  <p className="mt-3 max-w-md text-sm text-neutral-500">Cliquez sur “Show 3D” pour passer au visualiseur interactif. Dans le mode 3D, vous pouvez faire tourner le produit à la souris ou au trackpad.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
