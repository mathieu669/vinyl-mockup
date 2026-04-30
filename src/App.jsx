import React, { useEffect, useMemo, useRef, useState } from "react";

/* -----------------------------
   RENDER ENGINE
----------------------------- */
const OUT = { w: 1080, h: 1920, fps: 30 };

const BASE = {
  mode: "reveal",
  duration: 7,
  scale: 1,
  discSpin: 1.4,
  revSpeed: 1,
  bgMode: "gradient",
  bgA: "#f4efe7",
  bgB: "#1a2230",
  floor: true,
  badge: true,
  safe: false,
  title: "NUMBERED VINYL",
  subtitle: "Product loop",
  blockRot: 0,
  shadowA: 0.28,
  sleeveDepth: 8,
  discDepth: 3.5,
  phaseScales: [1, 1, 1, 1, 1, 1],
  phasePos: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  sweep: false,
  sweepI: 0.3,
  sweepW: 0.22,
  sweepS: 1,
  sweepA: -18,
};

const PRESETS = [
  {
    id: "reveal",
    label: "Disque visible",
    desc: "Disque sorti aux deux tiers",
    settings: { ...BASE },
  },
  {
    id: "album360",
    label: "Album 360°",
    desc: "Sortie du disque + recto / verso",
    settings: {
      ...BASE,
      mode: "album360",
      duration: 8,
      discSpin: 1.2,
      bgA: "#101114",
      bgB: "#40382d",
      title: "LIMITED EDITION",
      subtitle: "Full album rotation",
      blockRot: -8,
      phaseScales: [0.96, 1, 1.04, 1.05, 1.02, 0.98],
    },
  },
  {
    id: "coverOnly",
    label: "Pochette seule",
    desc: "Recto en lévitation",
    settings: {
      ...BASE,
      mode: "coverOnly",
      duration: 6,
      discSpin: 0,
      bgA: "#faf7ef",
      bgB: "#4a4338",
      title: "VINYL EDITION",
      subtitle: "Cover preview",
    },
  },
];

const PROFILE_KEY = "vinylMockupProfilesV1";

const cleanSettings = (o) => ({
  ...o,
  phaseScales: [...(o.phaseScales || BASE.phaseScales)],
  phasePos: (o.phasePos || BASE.phasePos).map((p) => [p[0], p[1]]),
});

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const map01 = (v, a, b) => (b === a ? 0 : clamp((v - a) / (b - a)));
const ease = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const COL = new WeakMap();

function fileURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function loadImg(src) {
  return new Promise((res, rej) => {
    if (!src) return res(null);
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

function fit(ctx, img, x, y, w, h) {
  if (!img) return;
  const r = Math.max(w / img.width, h / img.height);
  const nw = img.width * r;
  const nh = img.height * r;
  ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function domCol(img, hue = 215) {
  if (!img) return `hsl(${hue},55%,55%)`;
  if (COL.has(img)) return COL.get(img);

  const c = document.createElement("canvas");
  const x = c.getContext("2d", { willReadFrequently: true });
  c.width = c.height = 12;
  x.drawImage(img, 0, 0, 12, 12);
  const d = x.getImageData(0, 0, 12, 12).data;

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 8) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
  }

  const col = n
    ? `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`
    : `hsl(${hue},55%,55%)`;

  COL.set(img, col);
  return col;
}

function seq(p, s) {
  const p1 = 0.14;
  const p2 = 0.28;
  const half = 0.2 / Math.max(0.7, s.revSpeed);
  const p3 = clamp(p2 + half, 0.4, 0.52);
  const p4 = clamp(p3 + 0.08, 0.48, 0.62);
  const p5 = clamp(p4 + half, 0.68, 0.84);

  const sc = s.phaseScales || [1, 1, 1, 1, 1, 1];
  const ps =
    s.phasePos || [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];

  const spin = Math.max(0, p - p1) * Math.PI * 2 * 3.2 * s.discSpin;

  const mix = (i, j, t) => [
    lerp(ps[i]?.[0] || 0, ps[j]?.[0] || 0, t),
    lerp(ps[i]?.[1] || 0, ps[j]?.[1] || 0, t),
  ];

  let out = 0;
  let ang = 0;
  let z = sc[0];
  let pos = ps[0] || [0, 0];

  if (p < p1) {
    const t = ease(map01(p, 0, p1));
    z = lerp(sc[0], sc[1], t);
    pos = mix(0, 1, t);
  } else if (p < p2) {
    const t = ease(map01(p, p1, p2));
    out = 0.24 * t;
    z = lerp(sc[1], sc[2], t);
    pos = mix(1, 2, t);
  } else if (p < p3) {
    const t = map01(p, p2, p3);
    const e = ease(t);
    out = 0.24 + (0.67 - 0.24) * e;
    ang = Math.PI * t;
    z = lerp(sc[2], sc[3], e);
    pos = mix(2, 3, e);
  } else if (p < p4) {
    const t = ease(map01(p, p3, p4));
    out = 0.67;
    ang = Math.PI;
    z = lerp(sc[3], sc[4], t);
    pos = mix(3, 4, t);
  } else if (p < p5) {
    const t = map01(p, p4, p5);
    const e = ease(t);
    out = 0.67;
    ang = Math.PI + Math.PI * t;
    z = lerp(sc[4], sc[5], e);
    pos = mix(4, 5, e);
  } else {
    const t = ease(map01(p, p5, 1));
    out = 0.67 * (1 - t);
    ang = Math.PI * 2;
    z = lerp(sc[5], sc[0], t);
    pos = mix(5, 0, t);
  }

  return {
    out,
    ang,
    spin,
    z,
    x: pos[0],
    py: pos[1],
    y: Math.sin(p * Math.PI * 2) * 10,
  };
}

function drawBg(ctx, s, img, t) {
  const { w, h } = OUT;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, s.bgA);
  g.addColorStop(1, s.bgB);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (s.bgMode === "image" && img) {
    fit(ctx, img, 0, 0, w, h);
    const o = ctx.createLinearGradient(0, 0, 0, h);
    o.addColorStop(0, "rgba(0,0,0,.08)");
    o.addColorStop(1, "rgba(0,0,0,.28)");
    ctx.fillStyle = o;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.save();
  ctx.globalAlpha = s.bgMode === "image" ? 0.05 : 0.12;

  for (let i = 0; i < 10; i++) {
    const x = ((i * 290 + t * 16) % (w + 480)) - 240;
    const y = (i * 190) % h;
    const r = 90 + (i % 3) * 35;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,255,255,.95)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  if (s.floor) {
    const f = ctx.createLinearGradient(0, h * 0.58, 0, h);
    f.addColorStop(0, "rgba(255,255,255,0)");
    f.addColorStop(1, "rgba(0,0,0,.38)");
    ctx.fillStyle = f;
    ctx.fillRect(0, h * 0.56, w, h * 0.44);
  }
}

function objShadow(ctx, x, y, rx, ry, a) {
  if (a <= 0) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.22);
  ctx.filter = "blur(22px)";
  ctx.globalAlpha = a;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sweep(ctx, x, y, n, s, p) {
  if (!s.sweep) return;

  const w = n * s.sweepW;
  const a = (s.sweepA * Math.PI) / 180;
  const travel = n * 2.8;
  const cx = -travel / 2 + travel * (((p * s.sweepS) % 1 + 1) % 1);

  ctx.save();
  ctx.translate(x + n / 2, y + n / 2);
  ctx.rotate(a);
  ctx.globalCompositeOperation = "screen";

  const g = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, `rgba(255,255,255,${s.sweepI})`);
  g.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = g;
  ctx.fillRect(-n * 1.6, -n * 1.6, n * 3.2, n * 3.2);
  ctx.restore();
}

function spine(ctx, artImg, spineImg, x, y, n, side = 1, a = 0.5, hue = 215, depth = 8) {
  if (a <= 0.05) return;

  const d = Math.max(3, depth);
  const sx = side > 0 ? x + n : x - d;
  const col = domCol(artImg, hue);

  ctx.save();
  ctx.globalAlpha = a;

  ctx.beginPath();
  ctx.rect(sx, y, d, n);
  ctx.clip();

  if (spineImg) {
    // Image dédiée de tranche : elle est appliquée uniquement sur la surface latérale.
    fit(ctx, spineImg, sx, y, d, n);

    // Ombre/lumière pour garder l'impression de volume.
    const shade = ctx.createLinearGradient(sx, 0, sx + d * side, 0);
    shade.addColorStop(0, "rgba(0,0,0,.55)");
    shade.addColorStop(0.5, "rgba(255,255,255,.16)");
    shade.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = shade;
    ctx.fillRect(sx, y, d, n);
  } else {
    const g = ctx.createLinearGradient(sx, 0, sx + d * side, 0);
    g.addColorStop(0, "#070707");
    g.addColorStop(0.18, "#1d1d1d");
    g.addColorStop(0.52, col);
    g.addColorStop(0.82, "#262626");
    g.addColorStop(1, "#050505");
    ctx.fillStyle = g;
    ctx.fillRect(sx, y, d, n);

    ctx.globalAlpha = a * 0.45;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(0.7, d * 0.08);

    for (let i = 18; i < n - 18; i += 22) {
      ctx.beginPath();
      ctx.moveTo(sx + d * 0.18, y + i);
      ctx.lineTo(sx + d * 0.82, y + i);
      ctx.stroke();
    }
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = a * 0.75;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx, y, d, n);
  ctx.restore();
}

function sleeve(ctx, img, x, y, n, label, s, p, hue = 215) {
  ctx.save();
  ctx.fillStyle = "#111";
  ctx.fillRect(x, y, n, n);

  ctx.save();
  ctx.rect(x, y, n, n);
  ctx.clip();

  if (img) {
    fit(ctx, img, x, y, n, n);
  } else {
    const g = ctx.createLinearGradient(x, y, x + n, y + n);
    g.addColorStop(0, `hsl(${hue},72%,54%)`);
    g.addColorStop(1, `hsl(${hue + 50},68%,28%)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, n, n);
    ctx.fillStyle = "#fff";
    ctx.font = `${n * 0.07}px Inter,Arial`;
    ctx.textAlign = "center";
    ctx.fillText(label, x + n / 2, y + n / 2);
  }

  sweep(ctx, x, y, n, s, p);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = Math.max(1.5, n * 0.0045);
  ctx.strokeRect(x, y, n, n);
  ctx.restore();
}

function discEdge(ctx, x, y, r, a, depth = 3.5) {
  if (a <= 0) return;

  const d = Math.max(1.5, depth);

  // Fine masse derrière la face du disque : donne une sensation de disque solide.
  ctx.save();
  ctx.globalAlpha = a * 0.45;
  ctx.fillStyle = "#060606";
  ctx.beginPath();
  ctx.arc(x, y, r + d * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Tranche visible du vinyle, sans modifier sa position ni son mouvement.
  const g = ctx.createLinearGradient(x - d, y, x + d, y);
  ctx.save();
  ctx.globalAlpha = a;
  g.addColorStop(0, "#050505");
  g.addColorStop(0.42, "#777");
  g.addColorStop(0.55, "#aaa");
  g.addColorStop(1, "#050505");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, d * 0.45, r + d * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function disc(ctx, img, lab, x, y, r, a = 0, shadow = true) {
  if (shadow) {
    ctx.save();
    ctx.translate(x, y + r * 1.02);
    ctx.scale(1, 0.24);
    ctx.filter = "blur(18px)";
    ctx.fillStyle = "rgba(0,0,0,.26)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.92, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();

  if (img) {
    fit(ctx, img, -r, -r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(0, 0, r * 0.08, 0, 0, r);
    g.addColorStop(0, "#3f3f3f");
    g.addColorStop(0.18, "#111");
    g.addColorStop(0.72, "#050505");
    g.addColorStop(1, "#191919");

    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    ctx.strokeStyle = "rgba(255,255,255,.07)";
    ctx.lineWidth = r * 0.008;

    for (let i = 0.23; i < 0.98; i += 0.035) {
      ctx.beginPath();
      ctx.arc(0, 0, r * i, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,.15)";
  ctx.lineWidth = r * 0.018;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, -0.9, -0.2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a * 0.8);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.255, 0, Math.PI * 2);
  ctx.clip();

  if (lab) {
    fit(ctx, lab, -r * 0.255, -r * 0.255, r * 0.51, r * 0.51);
  } else {
    const g = ctx.createLinearGradient(-r * 0.25, -r * 0.25, r * 0.25, r * 0.25);
    g.addColorStop(0, "#f4f0e8");
    g.addColorStop(1, "#c7b99a");
    ctx.fillStyle = g;
    ctx.fillRect(-r * 0.26, -r * 0.26, r * 0.52, r * 0.52);
  }

  ctx.restore();

  ctx.fillStyle = "#ece6d8";
  ctx.beginPath();
  ctx.arc(x, y, r * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

function pack(ctx, a, n, back, out, spin, edge, s, p) {
  const x = -n / 2;
  const y = -n / 2;
  const side = back ? -1 : 1;
  const dx = side * n * out;
  const r = n * 0.49;
  const art = back ? a.back : a.front;
  const hue = back ? 345 : 215;

  if (out > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.filter = "blur(10px)";
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.beginPath();
    ctx.ellipse(dx * 0.92, 0, r * 0.88, r * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  discEdge(ctx, dx, 0, r, edge * clamp(out * 2.2), s.discDepth ?? 3.5);
  spine(ctx, art, a.spine, x, y, n, side, edge, hue, s.sleeveDepth ?? 8);

  if (out > 0.01) {
    disc(ctx, a.vinyl, a.label, dx, 0, r, spin, false);
  }

  sleeve(ctx, art, x, y, n, back ? "BACK COVER" : "FRONT COVER", s, p, hue);
}

function album360(ctx, a, cx, cy, n, p, s) {
  const q = seq(p, s);
  const c = Math.max(0.055, Math.abs(Math.cos(q.ang)));
  const back = Math.cos(q.ang) < 0;
  const shear = Math.sin(q.ang) * 0.018;
  const edge = 1 - Math.min(1, c * 1.55);
  const rot = ((s.blockRot || 0) * Math.PI) / 180;
  const sn = n * q.z;

  objShadow(
    ctx,
    cx + q.x,
    cy + q.py + sn * 0.7 + q.y * 0.18,
    sn * (0.58 + q.out * 0.32),
    sn * 0.19,
    s.shadowA
  );

  ctx.save();
  ctx.translate(cx + q.x, cy + q.py + q.y);
  ctx.rotate(rot);
  ctx.scale(q.z, q.z);
  ctx.transform(c, 0, shear, 1, 0, 0);
  pack(ctx, a, n, back, q.out, q.spin, edge, s, p);
  ctx.restore();
}

function reveal(ctx, a, cx, cy, n, p, s) {
  const r = n * 0.49;
  const w = n * 1.67;
  const rot = ((s.blockRot || 0) * Math.PI) / 180;
  const spin = p * Math.PI * 2 * s.discSpin;
  const y = Math.sin(p * Math.PI * 2) * 14;

  objShadow(ctx, cx, cy + n * 0.38 + y * 0.15, n * 0.78, n * 0.18, s.shadowA);

  ctx.save();
  ctx.translate(cx, cy + y);
  ctx.rotate(rot);

  const sx = -w / 2;
  const sy = -n / 2;
  const dx = sx + n / 2 + n * 0.67;

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.filter = "blur(10px)";
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.beginPath();
  ctx.ellipse(dx * 0.92, 0, r * 0.88, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  discEdge(ctx, dx, 0, r, 0.75, s.discDepth ?? 3.5);
  disc(ctx, a.vinyl, a.label, dx, 0, r, spin, true);
  spine(ctx, a.front, a.spine, sx, sy, n, 1, 0.55, 215, s.sleeveDepth ?? 8);
  sleeve(ctx, a.front, sx, sy, n, "FRONT COVER", s, p);

  ctx.restore();
}

function coverOnly(ctx, a, cx, cy, n, p, s) {
  const y = Math.sin(p * Math.PI * 2) * 12;
  const rot = ((s.blockRot || 0) * Math.PI) / 180;

  objShadow(ctx, cx, cy + n * 0.38 + y * 0.15, n * 0.62, n * 0.17, s.shadowA);

  ctx.save();
  ctx.translate(cx, cy + y);
  ctx.rotate(rot);
  spine(ctx, a.front, a.spine, -n / 2, -n / 2, n, 1, 0.5, 215, s.sleeveDepth ?? 8);
  sleeve(ctx, a.front, -n / 2, -n / 2, n, "FRONT COVER", s, p);
  ctx.restore();
}

function badge(ctx, s) {
  if (!s.badge) return;

  const { w, h } = OUT;
  const x = w * 0.11;
  const y = h * 0.075;
  const bw = w * 0.78;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.strokeStyle = "rgba(0,0,0,.1)";
  rr(ctx, x, y, bw, 112, 32);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,.78)";
  ctx.textAlign = "center";
  ctx.font = "700 42px Inter,Arial";
  ctx.fillText(s.title || "VINYL EDITION", w / 2, y + 50);

  ctx.font = "400 27px Inter,Arial";
  ctx.fillStyle = "rgba(0,0,0,.56)";
  ctx.fillText(s.subtitle || "Product loop", w / 2, y + 86);
  ctx.restore();
}

function scene(ctx, a, s, t) {
  const p = (t / s.duration) % 1;
  const n = s.scale * 560;
  const { w, h } = OUT;

  drawBg(ctx, s, a.bg, t);

  if (s.mode === "album360") {
    album360(ctx, a, w / 2, h * 0.47, n, p, s);
  } else if (s.mode === "reveal") {
    reveal(ctx, a, w / 2, h * 0.47, n, p, s);
  } else {
    coverOnly(ctx, a, w / 2, h * 0.47, n, p, s);
  }

  badge(ctx, s);

  if (s.safe) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.32)";
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84);
    ctx.restore();
  }
}

/* -----------------------------
   UI COMPONENTS
----------------------------- */
function Upload({ label, value, set, hint, req }) {
  const ref = useRef(null);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="flex w-full items-center gap-3 text-left"
      >
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) set(await fileURL(f));
          }}
        />

        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-200">
          {value && <img src={value} alt="" className="h-full w-full object-cover" />}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
            {label}
            {req && (
              <span className="rounded-full bg-neutral-950 px-2 py-0.5 text-[10px] text-white">
                requis
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">{value ? "Image chargée" : hint}</p>
        </div>

        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600">
          Choisir
        </span>
      </button>

      {value && (
        <button
          type="button"
          onClick={() => set("")}
          className="mt-3 text-xs font-medium text-neutral-500 hover:text-neutral-950"
        >
          Retirer l’image
        </button>
      )}
    </div>
  );
}

function Sec({ n, title, children }) {
  return (
    <section className="rounded-3xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-xs font-bold text-white">
          {n}
        </div>
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-neutral-700">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Range({ label, value, min, max, step, set, suffix = "" }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-800">
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
          {value}
          {suffix}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="accent-neutral-950"
      />
    </label>
  );
}

function Text({ label, value, set }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-800">
      {label}
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
      />
    </label>
  );
}

function Num({ label, value, set, min = 0.5, max = 3, step = 0.5 }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-neutral-800">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => set(Math.max(min, Math.min(max, Number(e.target.value))))}
        className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
      />
    </label>
  );
}

export default function VinylMockupAnimator() {
  const canvas = useRef(null);
  const chunks = useRef([]);

  const [src, setSrc] = useState({
    front: "",
    back: "",
    spine: "",
    vinyl: "",
    label: "",
    bg: "",
  });

  const [s, setS] = useState({ ...BASE });
  const [profileName, setProfileName] = useState("");
  const [profiles, setProfiles] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [imgs, setImgs] = useState({});
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState("");
  const [rec, setRec] = useState(false);
  const [progress, setProgress] = useState(0);

  const canRec = useMemo(() => typeof MediaRecorder !== "undefined", []);

  const up = (k, v) => setS((o) => ({ ...o, [k]: v }));
  const upSrc = (k, v) => setSrc((o) => ({ ...o, [k]: v }));

  const storeProfiles = (next) => {
    setProfiles(next);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    } catch {}
  };

  const saveProfile = () => {
    const name = (profileName.trim() || `Profil ${profiles.length + 1}`).slice(0, 40);
    if (!name) return;

    const i = profiles.findIndex((p) => p.name === name);
    if (i < 0 && profiles.length >= 5) return;

    const item = { name, settings: cleanSettings(s) };

    storeProfiles(
      i >= 0 ? profiles.map((p, j) => (j === i ? item : p)) : [...profiles, item]
    );

    setProfileName("");
  };

  const loadProfile = (p) => {
    setS({ ...BASE, ...cleanSettings(p.settings) });
    clearExport();
  };

  const deleteProfile = (name) => {
    storeProfiles(profiles.filter((p) => p.name !== name));
  };

  useEffect(() => {
    let off = false;

    Promise.all([src.front, src.back, src.spine, src.vinyl, src.label, src.bg].map(loadImg)).then(
      ([front, back, spine, vinyl, label, bg]) => {
        if (!off) setImgs({ front, back, spine, vinyl, label, bg });
      }
    );

    return () => {
      off = true;
    };
  }, [src]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!ctx) return;

    c.width = OUT.w;
    c.height = OUT.h;

    let f;
    const start = performance.now();

    const loop = (now) => {
      scene(ctx, imgs, s, ((now - start) / 1000) % s.duration);
      f = requestAnimationFrame(loop);
    };

    f = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(f);
  }, [imgs, s]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  function clearExport() {
    if (url) URL.revokeObjectURL(url);
    setUrl("");
    setBlob(null);
    setProgress(0);
  }

  function download() {
    if (!blob) return;

    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = u;
    a.download = "vinyl-product-loop.webm";

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(u), 1500);
  }

  function exportVideo() {
    const c = canvas.current;
    if (!c || !canRec || rec) return;

    clearExport();
    chunks.current = [];
    setRec(true);

    const stream = c.captureStream(OUT.fps);
    const type =
      ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) =>
        MediaRecorder.isTypeSupported(t)
      ) || "video/webm";

    const mr = new MediaRecorder(stream, { mimeType: type });

    mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);

    mr.onstop = () => {
      const b = new Blob(chunks.current, { type });
      setBlob(b);
      setUrl(URL.createObjectURL(b));
      setRec(false);
      setProgress(100);
    };

    mr.start();

    const start = performance.now();
    const dur = s.duration * 1000;

    const int = setInterval(() => {
      const p = Math.min(100, ((performance.now() - start) / dur) * 100);
      setProgress(Math.round(p));

      if (p >= 100) clearInterval(int);
    }, 100);

    setTimeout(() => {
      if (mr.state !== "inactive") mr.stop();
      stream.getTracks().forEach((t) => t.stop());
    }, dur);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-neutral-100">
      <header className="border-b border-white/10 bg-neutral-950/80 px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500">
              Vinyl product loop maker
            </p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
              Générateur de mockup vidéo vinyle
            </h1>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-neutral-400">
            <span className="rounded-full border border-white/10 px-3 py-1">9:16</span>
            <span className="rounded-full border border-white/10 px-3 py-1">1080 × 1920</span>
            <span className="rounded-full border border-white/10 px-3 py-1">{s.duration}s</span>
            <span className="rounded-full border border-white/10 px-3 py-1">
              {Object.values(src).filter(Boolean).length}/6 fichiers
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 p-4 md:p-8 lg:grid-cols-[440px_1fr]">
        <aside className="space-y-4 rounded-[2rem] bg-white p-4 text-neutral-950 shadow-2xl md:p-5">
          <Sec n="1" title="Modèle">
            <div className="grid gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setS({ ...p.settings });
                    clearExport();
                  }}
                  className={`rounded-2xl border p-3 text-left ${
                    s.mode === p.settings.mode
                      ? "border-neutral-950 bg-neutral-950 text-white"
                      : "border-neutral-200 bg-white hover:border-neutral-400"
                  }`}
                >
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="mt-1 text-xs opacity-70">{p.desc}</div>
                </button>
              ))}
            </div>
          </Sec>

          <Sec n="1B" title="Profils enregistrés">
            <div className="grid gap-3">
              <div className="flex gap-2">
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  maxLength={40}
                  placeholder={profiles.length >= 5 ? "5 profils maximum" : "Nom du profil"}
                  className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
                />

                <button
                  type="button"
                  disabled={
                    profiles.length >= 5 && !profiles.some((p) => p.name === profileName.trim())
                  }
                  onClick={saveProfile}
                  className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Enregistrer
                </button>
              </div>

              <div className="grid gap-2">
                {profiles.length ? (
                  profiles.map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-2"
                    >
                      <button
                        type="button"
                        onClick={() => loadProfile(p)}
                        className="min-w-0 flex-1 truncate px-2 text-left text-sm font-semibold text-neutral-800"
                      >
                        {p.name}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setS({ ...BASE, ...cleanSettings(p.settings) });
                          setProfileName(p.name);
                        }}
                        className="rounded-lg bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-600"
                      >
                        Modifier
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteProfile(p.name)}
                        className="rounded-lg bg-neutral-950 px-2 py-1 text-xs font-semibold text-white"
                      >
                        Effacer
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-neutral-500">
                    Aucun profil enregistré. Les profils sont stockés localement dans ce navigateur.
                  </p>
                )}
              </div>

              <p className="text-xs text-neutral-500">{profiles.length}/5 profils utilisés.</p>
            </div>
          </Sec>

          <Sec n="2" title="Images">
            <div className="grid gap-3">
              <Upload
                label="Pochette recto"
                value={src.front}
                set={(v) => upSrc("front", v)}
                hint="Carré HD"
                req
              />

              <Upload
                label="Pochette verso"
                value={src.back}
                set={(v) => upSrc("back", v)}
                hint="Pour Album 360°"
              />

              <Upload
                label="Tranche / spine"
                value={src.spine}
                set={(v) => upSrc("spine", v)}
                hint="Image verticale de la tranche"
              />

              <Upload
                label="Vinyle"
                value={src.vinyl}
                set={(v) => upSrc("vinyl", v)}
                hint="PNG recommandé"
              />

              <Upload
                label="Label central"
                value={src.label}
                set={(v) => upSrc("label", v)}
                hint="Optionnel"
              />

              <Upload
                label="Image de fond"
                value={src.bg}
                set={(v) => upSrc("bg", v)}
                hint="Mode fond image"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setSrc({ front: "", back: "", spine: "", vinyl: "", label: "", bg: "" });
                clearExport();
              }}
              className="mt-3 text-xs font-semibold text-neutral-500 hover:text-neutral-950"
            >
              Réinitialiser les images
            </button>
          </Sec>

          <Sec n="3" title="Animation">
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-neutral-800">
                Type d’animation
                <select
                  value={s.mode}
                  onChange={(e) => up("mode", e.target.value)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="reveal">Disque visible aux deux tiers</option>
                  <option value="album360">Album complet 360°</option>
                  <option value="coverOnly">Pochette seule</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Text label="Durée" value={s.duration} set={(v) => up("duration", Number(v))} />
                <Text label="Échelle" value={s.scale} set={(v) => up("scale", Number(v))} />
              </div>

              <Range
                label="Rotation du disque"
                value={s.discSpin}
                min="0"
                max="5"
                step="0.1"
                set={(v) => up("discSpin", v)}
              />

              <Range
                label="Vitesse de révolution"
                value={s.revSpeed}
                min="0.5"
                max="2"
                step="0.1"
                set={(v) => up("revSpeed", v)}
              />

              <Range
                label="Angle du bloc"
                value={s.blockRot}
                min="-45"
                max="45"
                step="1"
                suffix="°"
                set={(v) => up("blockRot", v)}
              />

              <Range
                label="Opacité ombre album"
                value={s.shadowA}
                min="0"
                max="0.6"
                step="0.02"
                set={(v) => up("shadowA", v)}
              />

              <Range
                label="Épaisseur pochette"
                value={s.sleeveDepth ?? 8}
                min="3"
                max="18"
                step="0.5"
                suffix="px"
                set={(v) => up("sleeveDepth", v)}
              />

              <Range
                label="Épaisseur vinyle"
                value={s.discDepth ?? 3.5}
                min="1.5"
                max="10"
                step="0.5"
                suffix="px"
                set={(v) => up("discDepth", v)}
              />

              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="mb-3 text-sm font-semibold">Échelle par phase</div>

                <div className="grid grid-cols-2 gap-3">
                  {s.phaseScales.map((v, i) => (
                    <Num
                      key={i}
                      label={`Phase ${i + 1}`}
                      value={v}
                      step={0.5}
                      set={(val) =>
                        up(
                          "phaseScales",
                          s.phaseScales.map((x, j) => (j === i ? val : x))
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="mb-3 text-sm font-semibold">Position par phase — X / Y</div>

                <div className="grid gap-4">
                  {(s.phasePos || [
                    [0, 0],
                    [0, 0],
                    [0, 0],
                    [0, 0],
                    [0, 0],
                    [0, 0],
                  ]).map((v, i) => (
                    <div key={i} className="grid gap-2">
                      <div className="text-xs font-semibold text-neutral-500">
                        Phase {i + 1}
                      </div>

                      <Range
                        label="X"
                        value={v[0]}
                        min="-300"
                        max="300"
                        step="10"
                        set={(val) =>
                          up(
                            "phasePos",
                            (s.phasePos || [
                              [0, 0],
                              [0, 0],
                              [0, 0],
                              [0, 0],
                              [0, 0],
                              [0, 0],
                            ]).map((p, j) => (j === i ? [val, p[1]] : p))
                          )
                        }
                      />

                      <Range
                        label="Y"
                        value={v[1]}
                        min="-300"
                        max="300"
                        step="10"
                        set={(val) =>
                          up(
                            "phasePos",
                            (s.phasePos || [
                              [0, 0],
                              [0, 0],
                              [0, 0],
                              [0, 0],
                              [0, 0],
                              [0, 0],
                            ]).map((p, j) => (j === i ? [p[0], val] : p))
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Sec>

          <Sec n="4" title="Fond & habillage">
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-neutral-800">
                Mode de fond
                <select
                  value={s.bgMode}
                  onChange={(e) => up("bgMode", e.target.value)}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"
                >
                  <option value="gradient">Dégradé couleur</option>
                  <option value="image">Image uploadée</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2 text-sm font-medium">
                  Couleur A
                  <input
                    type="color"
                    value={s.bgA}
                    onChange={(e) => up("bgA", e.target.value)}
                    className="h-11 rounded-xl border border-neutral-200 p-1"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Couleur B
                  <input
                    type="color"
                    value={s.bgB}
                    onChange={(e) => up("bgB", e.target.value)}
                    className="h-11 rounded-xl border border-neutral-200 p-1"
                  />
                </label>
              </div>

              <Text label="Titre" value={s.title} set={(v) => up("title", v)} />
              <Text label="Sous-titre" value={s.subtitle} set={(v) => up("subtitle", v)} />

              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["badge", "Titre affiché"],
                  ["floor", "Ombre sol"],
                  ["safe", "Safe area"],
                  ["sweep", "Reflet lumineux"],
                ].map(([k, l]) => (
                  <label
                    key={k}
                    className="flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-neutral-200"
                  >
                    <input
                      type="checkbox"
                      checked={!!s[k]}
                      onChange={(e) => up(k, e.target.checked)}
                      className="accent-neutral-950"
                    />
                    {l}
                  </label>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-3">
                <div className="mb-3 text-sm font-semibold">Reflet lumineux</div>

                <Range
                  label="Intensité"
                  value={s.sweepI}
                  min="0"
                  max="0.8"
                  step="0.05"
                  set={(v) => up("sweepI", v)}
                />

                <Range
                  label="Largeur"
                  value={s.sweepW}
                  min="0.08"
                  max="0.5"
                  step="0.01"
                  set={(v) => up("sweepW", v)}
                />

                <Range
                  label="Vitesse"
                  value={s.sweepS}
                  min="0.2"
                  max="3"
                  step="0.1"
                  set={(v) => up("sweepS", v)}
                />

                <Range
                  label="Angle"
                  value={s.sweepA}
                  min="-60"
                  max="60"
                  step="1"
                  suffix="°"
                  set={(v) => up("sweepA", v)}
                />
              </div>
            </div>
          </Sec>

          <Sec n="5" title="Export">
            <div className="grid gap-3">
              <button
                type="button"
                disabled={!canRec || rec}
                onClick={exportVideo}
                className="rounded-2xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {rec ? `Export — ${progress}%` : "Exporter la boucle vidéo"}
              </button>

              {rec && (
                <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full bg-neutral-950" style={{ width: `${progress}%` }} />
                </div>
              )}

              {blob && (
                <>
                  <button
                    type="button"
                    onClick={download}
                    className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold"
                  >
                    Télécharger la vidéo générée
                  </button>

                  <video src={url} controls className="aspect-video w-full rounded-2xl bg-black" />
                </>
              )}
            </div>
          </Sec>
        </aside>

        <main className="rounded-[2rem] border border-white/10 bg-neutral-950 p-4 shadow-2xl md:p-6 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="flex h-full flex-col gap-4">
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-400">
                  Aperçu live
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  L’animation se met à jour automatiquement.
                </p>
              </div>

              <div className="flex gap-2 text-xs text-neutral-400">
                <span className="rounded-full bg-white/5 px-3 py-1">{s.mode}</span>
                <span className="rounded-full bg-white/5 px-3 py-1">{s.bgMode}</span>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 place-items-center rounded-[1.5rem] bg-[radial-gradient(circle_at_top,#343434,transparent_40%),#070707] p-3 md:p-6">
              <div className="relative w-full max-w-[440px] overflow-hidden rounded-[2rem] bg-black shadow-2xl ring-1 ring-white/10">
                <canvas ref={canvas} className="block aspect-[9/16] w-full" />

                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75 backdrop-blur">
                  1080 × 1920 · loop preview
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
