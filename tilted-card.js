// TiltedCard — vanilla JS port of the React Bits <TiltedCard /> behaviour, applied to existing
// page elements instead of an image. Springs mirror the component's motion settings.
//
// Mark an element with data-tilt (and optionally data-tilt-caption="Tooltip text"), then:
//   initTiltedCards({ rotateAmplitude: 6, scaleOnHover: 1.05 });
// Per element overrides: data-tilt-scale="1.03", data-tilt-amplitude="4".

const SPRING = { stiffness: 100, damping: 30, mass: 2 }; // springValues in the component
const OPACITY_SPRING = { stiffness: 100, damping: 10, mass: 1 }; // motion's useSpring defaults
const CAPTION_SPRING = { stiffness: 350, damping: 30, mass: 1 };

class Spring {
  constructor(value, { stiffness, damping, mass }) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.k = stiffness;
    this.c = damping;
    this.m = mass;
  }
  set(target) {
    this.target = target;
  }
  step(dt) {
    const force = -this.k * (this.value - this.target) - this.c * this.velocity;
    this.velocity += (force / this.m) * dt;
    this.value += this.velocity * dt;
  }
  get settled() {
    return Math.abs(this.value - this.target) < 1e-3 && Math.abs(this.velocity) < 1e-3;
  }
  snap() {
    this.value = this.target;
    this.velocity = 0;
  }
}

const cards = new Set();
let raf = 0;
let last = 0;
let caption = null;

function tick(now) {
  const elapsed = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
  last = now;
  const steps = Math.ceil(elapsed / (1 / 240));
  const dt = elapsed / steps;
  let active = false;

  for (const card of cards) {
    for (let i = 0; i < steps; i++) card.springs.forEach((s) => s.step(dt));
    const settled = card.springs.every((s) => s.settled);
    if (settled) {
      card.springs.forEach((s) => s.snap());
      if (!card.hovered) {
        card.el.style.transform = "";
        card.el.classList.remove("is-tilting");
        cards.delete(card);
        continue;
      }
    } else {
      active = true;
    }
    const { rotateX, rotateY, scale } = card;
    card.el.style.transform = `perspective(800px) rotateX(${rotateX.value}deg) rotateY(${rotateY.value}deg) scale(${scale.value})`;
  }

  if (caption) {
    for (let i = 0; i < steps; i++) {
      caption.opacity.step(dt);
      caption.rotate.step(dt);
    }
    caption.el.style.opacity = Math.max(0, Math.min(1, caption.opacity.value));
    caption.el.style.transform = `translate(${caption.x}px, ${caption.y}px) rotate(${caption.rotate.value}deg)`;
    if (!caption.opacity.settled || !caption.rotate.settled) active = true;
  }

  raf = active ? requestAnimationFrame(tick) : 0;
  if (!raf) last = 0;
}

const wake = () => {
  if (!raf) raf = requestAnimationFrame(tick);
};

function ensureCaption() {
  if (caption) return caption;
  const el = document.createElement("figcaption");
  el.className = "tilted-card-caption";
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  caption = {
    el,
    x: 0,
    y: 0,
    opacity: new Spring(0, OPACITY_SPRING),
    rotate: new Spring(0, CAPTION_SPRING),
  };
  return caption;
}

export function initTiltedCards({
  selector = "[data-tilt]",
  rotateAmplitude = 14,
  scaleOnHover = 1.1,
  showTooltip = true,
} = {}) {
  // Mouse-only, like the original (it listens to mouse events); skip for reduced motion.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.querySelectorAll(selector).forEach((el) => {
    const amplitude = parseFloat(el.dataset.tiltAmplitude) || rotateAmplitude;
    const hoverScale = parseFloat(el.dataset.tiltScale) || scaleOnHover;
    const text = el.dataset.tiltCaption || "";
    const card = {
      el,
      hovered: false,
      rotateX: new Spring(0, SPRING),
      rotateY: new Spring(0, SPRING),
      scale: new Spring(1, SPRING),
    };
    card.springs = [card.rotateX, card.rotateY, card.scale];
    let lastY = 0;

    const moveCaption = (e) => {
      if (!showTooltip || !text) return;
      const cap = ensureCaption();
      cap.x = e.clientX;
      cap.y = e.clientY;
    };

    el.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      card.hovered = true;
      card.scale.set(hoverScale);
      el.classList.add("is-tilting");
      cards.add(card);
      if (showTooltip && text) {
        const cap = ensureCaption();
        cap.el.textContent = text;
        cap.opacity.set(1);
        moveCaption(e);
      }
      wake();
    });

    el.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !card.hovered) return;
      const rect = el.getBoundingClientRect();
      const offsetX = e.clientX - rect.left - rect.width / 2;
      const offsetY = e.clientY - rect.top - rect.height / 2;
      card.rotateX.set((offsetY / (rect.height / 2)) * -amplitude);
      card.rotateY.set((offsetX / (rect.width / 2)) * amplitude);
      moveCaption(e);
      if (showTooltip && text) caption.rotate.set(-(offsetY - lastY) * 0.6);
      lastY = offsetY;
      wake();
    });

    el.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse") return;
      card.hovered = false;
      card.rotateX.set(0);
      card.rotateY.set(0);
      card.scale.set(1);
      if (caption) {
        caption.opacity.set(0);
        caption.rotate.set(0);
      }
      wake();
    });
  });
}

export default initTiltedCards;
