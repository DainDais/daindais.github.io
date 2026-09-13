// GridRise-style background — an original WebGL recreation modelled on the prop list of
// React Bits Pro's <GridRise /> (the Pro source isn't included here).
// A field of rounded tiles viewed from an orbiting camera; tiles near the focus point rise,
// bob, and take on the accent colour, while distant depth fades into the background.
//
// Usage:
//   const fx = mountGridRise(parentElement, { accent: "#94a3b8", cellSize: 0.05, ... });
//   fx.update({ paused: true });
//   fx.destroy();
import { Renderer, Program, Mesh, Triangle } from "./assets/vendor/ogl.min.js";

const DEFAULTS = {
  color: "#0a0a0a",
  relief: 0,
  accent: "#de7dfa",
  background: "#0a0a0a",
  accentStrength: 0.85,
  cellSize: 0.06,
  rounding: 0.1,
  gap: 0.08,
  amplitude: 0.05,
  lift: 0.06,
  liftRadius: 0.6,
  speed: 0.6,
  zoom: 4,
  orbit: 45,
  distance: 1.5,
  altitude: 1,
  haze: 1,
  samples: 2,
  dpr: 1,
  maxFps: 60,
  drift: 0.28,
  ease: 0.1,
  interactive: true,
  paused: false,
  // Additions for this site (not GridRise props):
  offsetY: 0, // shifts the grid down the screen; 1 = half the screen height
  scrollParallax: 0, // how far the grid slides up per screen scrolled; 1 = half the screen height
  bleed: 0, // extra CSS px the canvas extends above and below the framed area (framing is unchanged)
  className: "",
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uColor;
uniform vec3  uAccent;
uniform vec3  uBg;
uniform float uAccentStrength;
uniform float uRelief;
uniform float uCell;
uniform float uRounding;
uniform float uGap;
uniform float uAmp;
uniform float uLift;
uniform float uRadius;
uniform float uSpeed;
uniform float uZoom;
uniform float uHaze;
uniform int   uSamples;
uniform vec3  uRo;
uniform vec3  uFwd;
uniform vec3  uRight;
uniform vec3  uUp;
uniform vec2  uFocus;
uniform float uShift;
uniform float uBleed;

out vec4 fragColor;

const vec3 LIGHT = vec3(-0.45, 0.85, 0.3);

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float influence(vec2 id) {
  vec2 c = (id + 0.5) * uCell;
  float x = clamp(length(c - uFocus) / max(uRadius, 1e-3), 0.0, 1.0);
  return 1.0 - x * x * (3.0 - 2.0 * x);
}

float tileHeight(vec2 id, float infl) {
  float phase = hash21(id) * 6.28318;
  float bob = 0.5 + 0.5 * sin(uTime * uSpeed * 2.0 + phase);
  return infl * (uLift + uAmp * bob);
}

vec3 fog(vec3 col, float t) {
  float camDist = length(uRo);
  float f = uHaze * smoothstep(camDist * 0.6, camDist * 2.4, t);
  return mix(col, uBg, clamp(f, 0.0, 1.0));
}

vec3 shade(vec3 ro, vec3 rd) {
  if (rd.y > -1e-4) return uBg;

  float hMax = uLift + uAmp + 1e-3;
  float t = max(0.0, (ro.y - hMax) / -rd.y);
  vec3 p = ro + rd * t;

  // 2D grid walk (DDA) across the tiles the ray passes over, front to back.
  vec2 id = floor(p.xz / uCell);
  vec2 stepDir = sign(rd.xz);
  vec2 inv = 1.0 / max(abs(rd.xz), vec2(1e-6));
  vec2 nextEdge = (id + max(stepDir, 0.0)) * uCell;
  vec2 tMax = t + abs(nextEdge - p.xz) * inv;
  vec2 tDelta = uCell * inv;
  vec3 invD = 1.0 / rd;
  float halfW = 0.5 * uCell * (1.0 - uGap);

  for (int i = 0; i < 96; i++) {
    float infl = influence(id);
    float h = tileHeight(id, infl);
    vec2 cc = (id + 0.5) * uCell;

    vec3 bmin = vec3(cc.x - halfW, -1.0, cc.y - halfW);
    vec3 bmax = vec3(cc.x + halfW, h, cc.y + halfW);
    vec3 t0 = (bmin - ro) * invD;
    vec3 t1 = (bmax - ro) * invD;
    vec3 tn = min(t0, t1);
    vec3 tf = max(t0, t1);
    float tNear = max(max(tn.x, tn.y), tn.z);
    float tFar = min(min(tf.x, tf.y), tf.z);

    if (tNear <= tFar && tFar > 0.0) {
      vec3 pos = ro + rd * tNear;
      vec2 local = pos.xz - cc;
      float r = max(uRounding * halfW, 1e-5);
      vec3 n;

      if (tNear == tn.y) {
        // Top face: bend the normal over a quarter-circle near the edges to read as rounded.
        vec2 outward = abs(local.x) > abs(local.y) ? vec2(sign(local.x), 0.0) : vec2(0.0, sign(local.y));
        float k = clamp(1.0 - (halfW - max(abs(local.x), abs(local.y))) / r, 0.0, 1.0);
        n = vec3(outward.x * k, sqrt(max(1.0 - k * k, 0.0)), outward.y * k);
      } else {
        vec3 side = tNear == tn.x ? vec3(-sign(rd.x), 0.0, 0.0) : vec3(0.0, 0.0, -sign(rd.z));
        float k = clamp(1.0 - (h - pos.y) / r, 0.0, 1.0);
        n = normalize(side * sqrt(max(1.0 - k * k, 0.0)) + vec3(0.0, k, 0.0));
      }

      vec3 L = normalize(LIGHT);
      float diff = max(dot(n, L), 0.0);
      vec3 base = mix(uColor, uAccent, clamp(uAccentStrength * infl, 0.0, 1.0));
      float faceShade = mix(0.7 - 0.5 * uRelief, 1.0, smoothstep(0.3, 0.9, n.y));
      vec3 col = base * (0.3 + 0.7 * diff) * faceShade;

      float spec = pow(max(dot(reflect(-L, n), -rd), 0.0), 28.0);
      col += spec * mix(vec3(0.07), uAccent * 0.45, infl);
      col += uAccent * 0.03 * infl;

      return fog(col, tNear);
    }

    float tExit = min(tMax.x, tMax.y);
    if (ro.y + rd.y * tExit < -0.06) {
      return fog(uBg * 0.4, tExit); // fell into a seam between tiles
    }

    if (tMax.x < tMax.y) {
      tMax.x += tDelta.x;
      id.x += stepDir.x;
    } else {
      tMax.y += tDelta.y;
      id.y += stepDir.y;
    }
  }

  return uBg;
}

void main() {
  int S = clamp(uSamples, 1, 3);
  vec3 acc = vec3(0.0);
  for (int sy = 0; sy < 3; sy++) {
    if (sy >= S) break;
    for (int sx = 0; sx < 3; sx++) {
      if (sx >= S) break;
      vec2 frag = gl_FragCoord.xy - vec2(0.0, uBleed) + (vec2(float(sx), float(sy)) + 0.5) / float(S) - 0.5;
      vec2 uv = (2.0 * frag - uRes) / uRes.y;
      uv.y += uShift;
      vec3 rd = normalize(uFwd * uZoom + uv.x * uRight + uv.y * uUp);
      acc += shade(uRo, rd);
    }
  }
  fragColor = vec4(acc / float(S * S), 1.0);
}
`;

const hexToRgb = (hex) => {
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const num = parseInt(h.slice(0, 6), 16);
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
};

const normalize = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function mountGridRise(parent, initialProps = {}) {
  const props = { ...DEFAULTS, ...initialProps };
  const noop = { update() {}, destroy() {} };

  const ctn = document.createElement("div");
  ctn.className = `grid-rise-container ${props.className}`.trim();
  ctn.setAttribute("aria-hidden", "true");

  let renderer;
  try {
    renderer = new Renderer({ webgl: 2, dpr: Math.min(props.dpr, window.devicePixelRatio || 1) });
  } catch {
    return noop;
  }
  const gl = renderer.gl;
  if (!gl || !renderer.isWebgl2) {
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return noop; // needs WebGL 2 — the page's CSS background stays
  }

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uRes: { value: new Float32Array([1, 1]) },
      uTime: { value: 0 },
      uColor: { value: new Float32Array(3) },
      uAccent: { value: new Float32Array(3) },
      uBg: { value: new Float32Array(3) },
      uAccentStrength: { value: 0 },
      uRelief: { value: 0 },
      uCell: { value: 0.06 },
      uRounding: { value: 0.1 },
      uGap: { value: 0.08 },
      uAmp: { value: 0.05 },
      uLift: { value: 0.06 },
      uRadius: { value: 0.6 },
      uSpeed: { value: 0.6 },
      uZoom: { value: 4 },
      uHaze: { value: 1 },
      uSamples: { value: 2 },
      uRo: { value: new Float32Array(3) },
      uFwd: { value: new Float32Array(3) },
      uRight: { value: new Float32Array(3) },
      uUp: { value: new Float32Array(3) },
      uFocus: { value: new Float32Array(2) },
      uShift: { value: 0 },
      uBleed: { value: 0 },
    },
  });
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
  const u = program.uniforms;

  const camera = { ro: [0, 1, 1], fwd: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] };

  const applyProps = () => {
    const bg = hexToRgb(props.background);
    u.uColor.value.set(hexToRgb(props.color));
    u.uAccent.value.set(hexToRgb(props.accent));
    u.uBg.value.set(bg);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    u.uAccentStrength.value = props.accentStrength;
    u.uRelief.value = props.relief;
    u.uCell.value = Math.max(props.cellSize, 0.005);
    u.uRounding.value = Math.min(Math.max(props.rounding, 0), 1);
    u.uGap.value = Math.min(Math.max(props.gap, 0), 0.9);
    u.uAmp.value = props.amplitude;
    u.uLift.value = props.lift;
    u.uRadius.value = props.liftRadius;
    u.uSpeed.value = props.speed;
    u.uZoom.value = Math.max(props.zoom, 0.1);
    u.uHaze.value = props.haze;
    u.uSamples.value = Math.round(Math.min(Math.max(props.samples, 1), 3));

    const orbit = (props.orbit * Math.PI) / 180;
    camera.ro = [Math.sin(orbit) * props.distance, Math.max(props.altitude, 0.01), Math.cos(orbit) * props.distance];
    camera.fwd = normalize([-camera.ro[0], -camera.ro[1], -camera.ro[2]]);
    camera.right = normalize(cross(camera.fwd, [0, 1, 0]));
    camera.up = cross(camera.right, camera.fwd);
    u.uRo.value.set(camera.ro);
    u.uFwd.value.set(camera.fwd);
    u.uRight.value.set(camera.right);
    u.uUp.value.set(camera.up);
  };
  applyProps();

  // uRes is the framed area (canvas minus the bleed above and below), in device pixels.
  const resize = () => {
    renderer.setSize(ctn.offsetWidth, ctn.offsetHeight);
    const scale = gl.drawingBufferHeight / Math.max(ctn.offsetHeight, 1);
    const bleed = Math.min(Math.max(props.bleed, 0), ctn.offsetHeight / 4) * scale;
    u.uBleed.value = bleed;
    u.uRes.value.set([gl.drawingBufferWidth, Math.max(1, gl.drawingBufferHeight - 2 * bleed)]);
    if (raf === 0) renderer.render({ scene: mesh });
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Focus point on the ground plane: follows the pointer when interactive, otherwise drifts.
  const focus = [0, 0];
  let pointerTarget = null;

  // Vertical screen shift: a fixed offset, minus a little for every screen the page is scrolled.
  const shiftTarget = () => {
    if (reducedMotion.matches) return props.offsetY;
    const scrolled = window.scrollY / Math.max(window.innerHeight, 1);
    return props.offsetY - scrolled * props.scrollParallax;
  };
  let shift = shiftTarget();
  u.uShift.value = shift;

  const onPointerMove = (e) => {
    if (!props.interactive) return;
    const rect = ctn.getBoundingClientRect();
    const bleed = Math.min(Math.max(props.bleed, 0), rect.height / 4);
    const frameTop = rect.top + bleed;
    const frameHeight = rect.height - 2 * bleed;
    const x = (2 * (e.clientX - rect.left) - rect.width) / frameHeight;
    const y = -(2 * (e.clientY - frameTop) - frameHeight) / frameHeight + shift;
    const { ro, fwd, right, up } = camera;
    const z = Math.max(props.zoom, 0.1);
    const rd = normalize([0, 1, 2].map((i) => fwd[i] * z + x * right[i] + y * up[i]));
    if (rd[1] >= -1e-4) return;
    const t = -ro[1] / rd[1];
    pointerTarget = [ro[0] + rd[0] * t, ro[2] + rd[2] * t];
  };
  const onPointerLeave = () => {
    pointerTarget = null;
  };

  let raf = 0;
  let clock = 0;
  let lastTick = 0;
  let lastFrame = 0;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const minGap = 1000 / Math.max(props.maxFps, 1);
    if (lastFrame && now - lastFrame < minGap - 1) return;
    lastFrame = now;

    const dt = lastTick ? Math.min((now - lastTick) / 1000, 0.1) : 0;
    lastTick = now;
    if (!props.paused) clock += dt;

    const target =
      props.interactive && pointerTarget
        ? pointerTarget
        : [Math.cos(clock * 0.3) * props.drift, Math.sin(clock * 0.3) * props.drift];
    const ease = Math.min(Math.max(props.ease, 0), 1);
    focus[0] += (target[0] - focus[0]) * ease;
    focus[1] += (target[1] - focus[1]) * ease;

    shift += (shiftTarget() - shift) * 0.12;

    u.uTime.value = clock;
    u.uFocus.value.set(focus);
    u.uShift.value = shift;
    renderer.render({ scene: mesh });

    if (props.paused && Math.abs(target[0] - focus[0]) + Math.abs(target[1] - focus[1]) < 1e-4) stop();
  };

  const start = () => {
    if (raf !== 0 || document.hidden) return;
    if (reducedMotion.matches) {
      u.uShift.value = shift = shiftTarget();
      renderer.render({ scene: mesh });
      return;
    }
    lastTick = lastFrame = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const onVisibility = () => (document.hidden ? stop() : start());
  const onMotionPreference = () => {
    stop();
    start();
  };

  parent.append(ctn);
  ctn.appendChild(gl.canvas);
  gl.canvas.style.display = "block";

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(ctn);
  resize();

  window.addEventListener("pointermove", onPointerMove);
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  reducedMotion.addEventListener("change", onMotionPreference);
  start();

  return {
    update(nextProps = {}) {
      Object.assign(props, nextProps);
      if ("className" in nextProps) ctn.className = `grid-rise-container ${props.className}`.trim();
      if ("dpr" in nextProps) {
        renderer.dpr = Math.min(props.dpr, window.devicePixelRatio || 1);
        resize();
      }
      applyProps();
      if (raf === 0) {
        renderer.render({ scene: mesh });
        if (!props.paused) start();
      }
    },
    destroy() {
      stop();
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onMotionPreference);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      ctn.remove();
    },
  };
}

export default mountGridRise;
