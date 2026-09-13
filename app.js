(() => {
  "use strict";

  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdfjs = window.pdfjsLib;
  if (pdfjs) pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------------- PDF loading (shared by thumbnails + viewer) ---------------- */

  const pdfCache = new Map();

  function loadPdf(url) {
    if (!pdfjs) return Promise.reject(new Error("pdf.js failed to load"));
    if (!pdfCache.has(url)) {
      const promise = pdfjs.getDocument(url).promise;
      promise.catch(() => pdfCache.delete(url));
      pdfCache.set(url, promise);
    }
    return pdfCache.get(url);
  }

  /* ---------------- Thumbnails ---------------- */

  const docCards = document.querySelectorAll(".doc[data-pdf]");

  async function renderThumbnail(card) {
    const wrap = $(".doc-thumb", card);
    const canvas = $("canvas", wrap);
    try {
      const pdf = await loadPdf(card.dataset.pdf);
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const targetWidth = 130 * Math.min(window.devicePixelRatio || 1, 3) * 1.25;
      const viewport = page.getViewport({ scale: targetWidth / base.width });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      wrap.style.aspectRatio = `${base.width} / ${base.height}`;

      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    } catch (err) {
      wrap.classList.add("is-error");
      console.warn(`Could not render preview for ${card.dataset.pdf}`, err);
    } finally {
      wrap.classList.add("is-ready");
    }
  }

  docCards.forEach((card) => {
    renderThumbnail(card);
    card.addEventListener("click", () => openViewer(card));
  });

  /* ---------------- Viewer ---------------- */

  const viewer = $("#viewer");
  const viewport = $("#viewer-viewport");
  const stage = $("#viewer-stage");
  const statusEl = $("#viewer-status");
  const hintEl = $("#viewer-hint");
  const zoomLabel = $("#viewer-zoom");
  const titleEl = $("#viewer-title");
  const fileEl = $("#viewer-file");
  const openLink = $("#viewer-open");

  const PAGE_WIDTH = 816; // CSS px of one page at 100% (8.5in @ 96dpi)
  const PAGE_GAP = 16;
  const PAD = 16;
  const MIN_SCALE = 0.2;
  const MAX_SCALE = 6;
  const MAX_CANVAS_PIXELS = isTouch ? 8e6 : 16e6;

  const view = { x: 0, y: 0, scale: 1, adjusted: false };
  let pages = [];
  let stageW = 0;
  let stageH = 0;
  let session = 0;
  let lastFocus = null;
  let renderTimer = 0;
  let hintTimer = 0;

  async function openViewer(card) {
    const url = card.dataset.pdf;
    const token = ++session;

    lastFocus = document.activeElement;
    titleEl.textContent = card.dataset.title || "Document";
    fileEl.textContent = url.split("/").pop();
    openLink.href = url;

    resetStage();
    setStatus("Loading…");
    viewer.hidden = false;
    document.body.style.overflow = "hidden";
    history.pushState({ viewer: true }, "");
    $("[data-close].tool", viewer).focus();
    showHint();

    try {
      const pdf = await loadPdf(url);
      if (token !== session) return;

      let y = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        if (token !== session) return;

        const base = page.getViewport({ scale: 1 });
        const cssW = PAGE_WIDTH;
        const cssH = Math.round((PAGE_WIDTH * base.height) / base.width);
        const canvas = document.createElement("canvas");
        sizeCanvas(canvas, cssW, cssH);
        stage.append(canvas);
        pages.push({ page, baseW: base.width, cssW, cssH, canvas, ratio: 0, task: null });
        y += cssH + (i > 1 ? PAGE_GAP : 0);
      }

      stageW = PAGE_WIDTH;
      stageH = y;
      stage.style.width = `${stageW}px`;
      stage.style.height = `${stageH}px`;

      setStatus("");
      fit(false);
      renderPages();
    } catch (err) {
      if (token !== session) return;
      console.warn(`Could not open ${url}`, err);
      setStatus("Couldn't display this document here.", url);
    }
  }

  function closeViewer({ fromHistory = false } = {}) {
    if (viewer.hidden) return;
    if (!fromHistory && history.state && history.state.viewer) {
      history.back(); // popstate will call closeViewer again
      return;
    }
    session++;
    viewer.hidden = true;
    document.body.style.overflow = "";
    resetStage();
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }

  window.addEventListener("popstate", () => closeViewer({ fromHistory: true }));

  // A reload while the viewer was open leaves a stale history entry behind.
  if (history.state && history.state.viewer) history.replaceState(null, "");

  viewer.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => closeViewer()));

  function resetStage() {
    clearTimeout(renderTimer);
    pages.forEach((p) => {
      if (p.task) p.task.cancel();
      releaseCanvas(p.canvas);
    });
    pages = [];
    stage.replaceChildren();
    stageW = stageH = 0;
    pointers.clear();
    viewport.classList.remove("is-dragging");
  }

  function setStatus(message, fallbackUrl) {
    statusEl.replaceChildren();
    statusEl.hidden = !message;
    if (!message) return;
    const p = document.createElement("p");
    p.textContent = message;
    statusEl.append(p);
    if (fallbackUrl) {
      const a = document.createElement("a");
      a.href = fallbackUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Open the PDF instead";
      p.append(document.createElement("br"), a);
    }
  }

  function showHint() {
    hintEl.textContent = isTouch
      ? "Drag to move · Pinch to zoom · Double-tap"
      : "Drag to move · Ctrl/⌘ + scroll to zoom · Double-click";
    hintEl.classList.remove("is-hidden");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 4000);
  }

  function hideHint() {
    hintEl.classList.add("is-hidden");
  }

  /* ---------- Rendering ---------- */

  function sizeCanvas(canvas, cssW, cssH) {
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
  }

  function releaseCanvas(canvas) {
    canvas.width = canvas.height = 0; // frees GPU memory promptly on iOS
  }

  // Re-render pages at a resolution that matches the current zoom, once zooming settles.
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPages, 180);
  }

  function renderPages() {
    const dpr = window.devicePixelRatio || 1;
    pages.forEach((p) => {
      const maxRatio = Math.sqrt(MAX_CANVAS_PIXELS / (p.cssW * p.cssH));
      const ratio = clamp(view.scale * dpr, 0.5, maxRatio);
      const sharpEnough = p.ratio >= ratio * 0.95 && p.ratio <= ratio * 3;
      if (!sharpEnough) renderPage(p, ratio);
    });
  }

  async function renderPage(p, ratio) {
    if (p.task) p.task.cancel();
    const token = session;
    const vp = p.page.getViewport({ scale: (p.cssW * ratio) / p.baseW });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    sizeCanvas(canvas, p.cssW, p.cssH);

    const task = p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
    p.task = task;
    try {
      await task.promise;
    } catch {
      releaseCanvas(canvas); // cancelled by a newer render
      return;
    }
    if (p.task !== task || token !== session) {
      releaseCanvas(canvas);
      return;
    }
    p.task = null;
    p.canvas.replaceWith(canvas);
    releaseCanvas(p.canvas);
    p.canvas = canvas;
    p.ratio = ratio;
  }

  /* ---------- Pan & zoom ---------- */

  function fitScale() {
    if (!stageW) return 1;
    return clamp((viewport.clientWidth - PAD * 2) / stageW, MIN_SCALE, 1.25);
  }

  function apply() {
    const sw = stageW * view.scale;
    const sh = stageH * view.scale;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const keep = 60; // always keep this much of the document on screen
    view.x = clamp(view.x, keep - sw, vw - keep);
    view.y = clamp(view.y, keep - sh, vh - keep);
    stage.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
  }

  function animateNext() {
    stage.classList.add("is-animating");
    clearTimeout(animateNext.timer);
    animateNext.timer = setTimeout(() => stage.classList.remove("is-animating"), 260);
  }

  function stopAnimating() {
    stage.classList.remove("is-animating");
  }

  function fit(animate = true) {
    if (animate) animateNext();
    view.scale = fitScale();
    view.x = (viewport.clientWidth - stageW * view.scale) / 2;
    view.y = PAD;
    view.adjusted = false;
    apply();
    scheduleRender();
  }

  function zoomTo(scale, cx, cy, animate = false) {
    if (!stageW) return;
    if (animate) animateNext();
    const next = clamp(scale, MIN_SCALE, MAX_SCALE);
    const k = next / view.scale;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.scale = next;
    view.adjusted = true;
    apply();
    scheduleRender();
  }

  function zoomCenter(factor) {
    zoomTo(view.scale * factor, viewport.clientWidth / 2, viewport.clientHeight / 2, true);
  }

  function panBy(dx, dy, animate = false) {
    if (animate) animateNext();
    view.x += dx;
    view.y += dy;
    view.adjusted = true;
    apply();
  }

  function toggleZoomAt(cx, cy) {
    const f = fitScale();
    if (view.scale < f * 1.6) zoomTo(f * 2.5, cx, cy, true);
    else fit(true);
  }

  viewer.querySelector('[data-action="zoom-in"]').addEventListener("click", () => zoomCenter(1.25));
  viewer.querySelector('[data-action="zoom-out"]').addEventListener("click", () => zoomCenter(0.8));
  viewer.querySelector('[data-action="fit"]').addEventListener("click", () => fit(true));

  // Pointer events cover mouse drag, one-finger pan, and two-finger pinch.
  const pointers = new Map();
  let tap = null;
  let lastTap = null;

  function localPoint(e) {
    const r = viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function centroid() {
    const pts = [...pointers.values()];
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { cx, cy, dist };
  }

  viewport.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("a")) return;
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    pointers.set(e.pointerId, localPoint(e));
    stopAnimating();
    hideHint();
    tap = pointers.size === 1 ? { id: e.pointerId, ...localPoint(e), t: performance.now() } : null;
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const before = centroid();
    pointers.set(e.pointerId, localPoint(e));
    const after = centroid();

    view.x += after.cx - before.cx;
    view.y += after.cy - before.cy;

    if (pointers.size > 1 && before.dist > 0) {
      const next = clamp(view.scale * (after.dist / before.dist), MIN_SCALE, MAX_SCALE);
      const k = next / view.scale;
      view.x = after.cx - (after.cx - view.x) * k;
      view.y = after.cy - (after.cy - view.y) * k;
      view.scale = next;
    }

    view.adjusted = true;
    viewport.classList.add("is-dragging");
    apply();

    if (tap && Math.hypot(after.cx - tap.x, after.cy - tap.y) > 8) tap = null;
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      viewport.classList.remove("is-dragging");
      scheduleRender();
    }

    if (e.type !== "pointerup" || !tap || tap.id !== e.pointerId) return;
    const now = performance.now();
    if (now - tap.t < 300) {
      if (lastTap && now - lastTap.t < 320 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
        toggleZoomAt(tap.x, tap.y);
        lastTap = null;
      } else {
        lastTap = { x: tap.x, y: tap.y, t: now };
      }
    }
    tap = null;
  }

  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);

  // Mouse wheel / trackpad: scroll pans, Ctrl/⌘ + scroll (or trackpad pinch) zooms.
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stopAnimating();
      hideHint();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;

      if (e.ctrlKey || e.metaKey) {
        const { x, y } = localPoint(e);
        zoomTo(view.scale * Math.exp(-clamp(dy, -50, 50) * 0.01), x, y);
      } else if (e.shiftKey && !dx) {
        panBy(-dy, 0);
      } else {
        panBy(-dx, -dy);
      }
    },
    { passive: false }
  );

  // Desktop Safari reports trackpad pinch as gesture events instead of ctrl+wheel.
  let gestureBase = null;
  viewport.addEventListener("gesturestart", (e) => {
    e.preventDefault();
    if (!pointers.size) gestureBase = view.scale;
  });
  viewport.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (gestureBase == null || pointers.size) return;
    const { x, y } = localPoint(e);
    zoomTo(gestureBase * e.scale, x, y);
  });
  viewport.addEventListener("gestureend", () => (gestureBase = null));

  document.addEventListener("keydown", (e) => {
    if (viewer.hidden) return;
    const step = 80;
    switch (e.key) {
      case "Escape": closeViewer(); break;
      case "+":
      case "=": zoomCenter(1.25); break;
      case "-":
      case "_": zoomCenter(0.8); break;
      case "0": fit(true); break;
      case "ArrowUp": panBy(0, step, true); break;
      case "ArrowDown": panBy(0, -step, true); break;
      case "ArrowLeft": panBy(step, 0, true); break;
      case "ArrowRight": panBy(-step, 0, true); break;
      case "Tab": trapFocus(e); return;
      default: return;
    }
    e.preventDefault();
  });

  function trapFocus(e) {
    const focusable = [...viewer.querySelectorAll("button, a[href]")].filter((el) => el.offsetParent);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  window.addEventListener("resize", () => {
    if (viewer.hidden || !stageW) return;
    if (view.adjusted) apply();
    else fit(false);
  });
})();
