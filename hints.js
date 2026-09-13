// Startup hints: a "grab me" bubble beside the lanyard badge and a "click to expand" bubble
// just above the section menu. Each disappears once its target is used, or after `duration`.

function makeBubble(text, className) {
  const el = document.createElement("div");
  el.className = `hint ${className}`;
  el.setAttribute("role", "status");
  el.textContent = text;
  return el;
}

function dismiss(el) {
  if (!el.isConnected || el.classList.contains("is-leaving")) return;
  el.classList.remove("is-visible");
  el.classList.add("is-leaving");
  setTimeout(() => el.remove(), 400);
}

// Wait (up to `timeout` ms) for the lanyard's grab area to exist and have a size.
function waitForBadge(timeout = 20000) {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const grab = document.querySelector(".lanyard-grab");
      if (grab && grab.offsetWidth > 0) return resolve(grab);
      if (performance.now() - start > timeout) return resolve(null);
      requestAnimationFrame(check);
    };
    check();
  });
}

async function badgeHint({ text, duration, delay }) {
  const stage = document.getElementById("lanyard");
  if (!stage || !document.documentElement.classList.contains("lanyard-on")) return;
  const grab = await waitForBadge();
  if (!grab) return;

  const bubble = makeBubble(text, "hint--badge");
  stage.append(bubble);

  // Follow the badge while it swings; sit to its left, overlapping it only on narrow screens.
  let raf = 0;
  const follow = () => {
    if (!bubble.isConnected) return;
    const g = grab.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const x = Math.max(8, g.left - s.left - 14 - bubble.offsetWidth);
    const y = g.top - s.top + g.height * 0.21 - bubble.offsetHeight / 2; // beside the plain strip above the photo
    bubble.style.transform = `translate(${x}px, ${y}px)`;
    raf = requestAnimationFrame(follow);
  };
  follow();

  const hide = () => {
    dismiss(bubble);
    setTimeout(() => cancelAnimationFrame(raf), 400);
  };
  grab.addEventListener("pointerdown", hide, { once: true });
  setTimeout(() => bubble.classList.add("is-visible"), delay);
  setTimeout(hide, delay + duration);
}

function menuHint({ text, duration, delay }) {
  const root = document.getElementById("sections");
  const row = root?.querySelector(".line-sidebar__row");
  const label = row?.querySelector(".line-sidebar__label");
  if (!row || !label) return;

  const bubble = makeBubble(text, "hint--menu");
  root.append(bubble);

  // Just above the first label, lined up with its start, pointing down at it.
  const place = () => {
    const r = root.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const left = Math.min(l.left - r.left - 6, viewport - 8 - bubble.offsetWidth - r.left);
    const top = l.top - r.top - bubble.offsetHeight - 8;
    bubble.style.transform = `translate(${left}px, ${top}px)`;
  };
  place();
  window.addEventListener("resize", place);

  const hide = () => {
    dismiss(bubble);
    window.removeEventListener("resize", place);
  };
  root.querySelectorAll(".line-sidebar__row").forEach((r) => r.addEventListener("click", hide, { once: true }));
  setTimeout(() => {
    place();
    bubble.classList.add("is-visible");
  }, delay);
  setTimeout(hide, delay + duration);
}

export function showStartupHints({
  badgeText = "Grab me 👉",
  menuText = "👇 Click to expand",
  duration = 10000,
} = {}) {
  badgeHint({ text: badgeText, duration, delay: 1200 }); // let the badge swing in first
  menuHint({ text: menuText, duration, delay: 1800 });
}

export default showStartupHints;
