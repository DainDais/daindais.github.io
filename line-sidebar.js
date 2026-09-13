// LineSidebar — vanilla JS port of the React Bits <LineSidebar /> component, used here as an
// accordion: each item's row is a button that expands the panel beneath it (one open at a time).
//
// Markup (per item):
//   <li class="line-sidebar__item">
//     <button class="line-sidebar__row" aria-controls="panel-id">
//       <span class="line-sidebar__marker"></span>
//       <span class="line-sidebar__label"><span class="line-sidebar__index">01</span><span class="line-sidebar__text">Label</span></span>
//     </button>
//     <div class="line-sidebar__panel" id="panel-id"><div class="line-sidebar__panel-inner">…</div></div>
//   </li>

const FALLOFF_CURVES = {
  linear: (p) => p,
  smooth: (p) => p * p * (3 - 2 * p),
  sharp: (p) => p * p * p,
};

export function initLineSidebar(
  root,
  {
    accentColor = "#A855F7",
    textColor = "#c4c4c4",
    markerColor = "#6c6c6c",
    showIndex = true,
    showMarker = true,
    proximityRadius = 100,
    maxShift = 30,
    falloff = "smooth",
    markerLength = 60,
    markerGap = 0,
    tickScale = 0.5,
    scaleTick = true,
    itemGap = 20,
    fontSize = 1.1,
    smoothing = 100,
    defaultActive = null,
    onItemClick,
    // [site addition] after a panel opens, scroll just enough to show its bottom edge
    revealOnOpen = false,
    revealMargin = 32,
  } = {}
) {
  root.classList.add("line-sidebar");
  root.classList.toggle("line-sidebar--markers", showMarker);
  root.classList.toggle("line-sidebar--scale-tick", scaleTick);
  const vars = {
    "--accent-color": accentColor,
    "--text-color": textColor,
    "--marker-color": markerColor,
    "--marker-length": `${markerLength}px`,
    "--marker-gap": `${markerGap}px`,
    "--tick-scale": tickScale,
    "--max-shift": `${maxShift}px`,
    "--item-gap": `${itemGap}px`,
    "--font-size": `${fontSize}rem`,
    "--smoothing": `${smoothing}ms`,
  };
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

  const list = root.querySelector(".line-sidebar__list");
  const items = [...list.querySelectorAll(":scope > .line-sidebar__item")];
  const rows = items.map((item) => item.querySelector(".line-sidebar__row"));
  const panels = items.map((item) => item.querySelector(".line-sidebar__panel"));
  if (!showMarker) root.querySelectorAll(".line-sidebar__marker").forEach((m) => m.remove());
  if (!showIndex) root.querySelectorAll(".line-sidebar__index").forEach((m) => m.remove());

  const targets = items.map(() => 0);
  const current = items.map(() => 0);
  let active = defaultActive;
  let raf = null;
  let last = 0;

  // Single rAF loop that eases every item's --effect toward its target using
  // frame-rate independent exponential smoothing.
  const runFrame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const tau = Math.max(smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);
    let moving = false;
    items.forEach((el, i) => {
      const target = Math.max(targets[i] || 0, active === i ? 1 : 0);
      const next = current[i] + (target - current[i]) * k;
      const settled = Math.abs(target - next) < 0.0015;
      current[i] = settled ? target : next;
      el.style.setProperty("--effect", current[i].toFixed(4));
      if (!settled) moving = true;
    });
    raf = moving ? requestAnimationFrame(runFrame) : null;
  };

  const startLoop = () => {
    if (raf != null) cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(runFrame);
  };

  // Proximity is measured to each item's row (not the whole item) so an open panel
  // doesn't move the point that lights the label up.
  list.addEventListener("pointermove", (e) => {
    const listTop = list.getBoundingClientRect().top;
    const pointerY = e.clientY - listTop;
    const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      const center = r.top - listTop + r.height / 2;
      targets[i] = ease(Math.max(0, 1 - Math.abs(pointerY - center) / proximityRadius));
    });
    startLoop();
  });

  list.addEventListener("pointerleave", () => {
    targets.fill(0);
    startLoop();
  });

  const setPanel = (i, open) => {
    const item = items[i];
    const panel = panels[i];
    rows[i].setAttribute("aria-expanded", String(open));
    item.classList.toggle("is-open", open);
    if (!panel) return;
    panel.inert = !open;
    if (!open) panel.classList.remove("is-settled");
  };

  // Scroll down only as far as needed to show the bottom of item i, never pushing its
  // header above the top of the screen. Does nothing if the item is already fully visible.
  const reveal = (i) => {
    const bottom = items[i].getBoundingClientRect().bottom;
    const headerTop = rows[i].getBoundingClientRect().top;
    // Use the visible area: on phones window.innerHeight includes space behind the browser's toolbars.
    const vv = window.visualViewport;
    const visibleTop = vv ? vv.offsetTop : 0;
    const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const needed = bottom + revealMargin - visibleBottom;
    const by = Math.min(needed, headerTop - visibleTop - revealMargin);
    if (by <= 0) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: by, behavior: reduceMotion ? "auto" : "smooth" });
  };

  let pendingReveal = null;
  const settle = (i) => {
    panels[i]?.classList.add("is-settled");
    if (pendingReveal?.index === i) {
      clearTimeout(pendingReveal.timer);
      pendingReveal = null;
      reveal(i);
    }
  };

  panels.forEach((panel, i) => {
    panel?.addEventListener("transitionend", (e) => {
      if (e.target !== panel || e.propertyName !== "grid-template-rows") return;
      if (items[i].classList.contains("is-open")) settle(i);
    });
  });

  const activate = (index, { userInitiated = false } = {}) => {
    active = index;
    items.forEach((_, i) => setPanel(i, i === active));
    startLoop();
    if (pendingReveal) clearTimeout(pendingReveal.timer);
    pendingReveal = null;
    if (revealOnOpen && userInitiated && index != null) {
      // Wait for the open animation (and any panel above closing) to finish; the timer is a
      // fallback in case no transition runs.
      pendingReveal = { index, timer: setTimeout(() => settle(index), 500) };
    }
  };

  rows.forEach((row, i) => {
    row.addEventListener("click", () => {
      const label = row.querySelector(".line-sidebar__text")?.textContent ?? "";
      activate(active === i ? null : i, { userInitiated: true }); // clicking the open item collapses it
      onItemClick?.(i, label);
    });
  });

  activate(defaultActive);
  if (defaultActive != null) panels[defaultActive]?.classList.add("is-settled");

  return { open: activate };
}

export default initLineSidebar;
