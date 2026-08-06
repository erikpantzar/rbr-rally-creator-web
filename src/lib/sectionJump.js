// rbr-rally-creator-web#105: the readiness banner's problem lines are jump
// links -- click one and the page scrolls to the section that owns the
// problem, which then pulses a brief glow (see index.css's [data-glow] /
// section-glow-pulse) as a "you are here" beacon.
//
// This is deliberately imperative DOM work rather than React state: the
// glow is purely-presentational transient feedback that nothing else reads,
// and the targets span two component trees (App.jsx owns the credentials
// section, RallyBuilder owns the other three) -- threading a
// which-section-is-glowing state prop across that boundary would be plumbing
// for plumbing's sake.

// Canonical ids for every jump-target section, shared by the components
// that render the targets (App.jsx, RallyBuilder.jsx) and the readiness
// problems that point at them -- one constant so the two sides can't drift.
export const SECTION_IDS = {
  credentials: 'credentials-section',
  rallyBasics: 'rally-basics-section',
  carGroups: 'car-groups-section',
  roadBook: 'road-book-section',
};

// index.css's section-glow-pulse runs 2s; the fallback only exists for the
// case where animationend never fires (element removed mid-pulse, etc.), so
// it just needs to sit safely past the animation.
const GLOW_FALLBACK_MS = 2600;

// Tracks the active glow cleanup per element so a second click on the same
// problem link mid-pulse restarts the beacon cleanly instead of the first
// pulse's teardown clipping the second one short.
const activeGlowCleanups = new WeakMap();

export function jumpToSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) return;

  // The global reduced-motion guard (index.css) already collapses the glow
  // animation, but scrollIntoView's behavior isn't CSS -- honor the same
  // preference here: instant jump, no beacon.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  if (reduceMotion) return;

  activeGlowCleanups.get(el)?.();

  // Remove-then-re-add with a forced reflow in between so the CSS animation
  // restarts even when the attribute was already present.
  el.removeAttribute('data-glow');
  void el.offsetWidth;
  el.setAttribute('data-glow', '');

  const cleanup = (event) => {
    // animationend bubbles -- ignore animations finishing inside the section.
    if (event && event.target !== el) return;
    clearTimeout(fallback);
    el.removeEventListener('animationend', cleanup);
    el.removeAttribute('data-glow');
    activeGlowCleanups.delete(el);
  };
  const fallback = setTimeout(cleanup, GLOW_FALLBACK_MS);
  el.addEventListener('animationend', cleanup);
  activeGlowCleanups.set(el, cleanup);
}
