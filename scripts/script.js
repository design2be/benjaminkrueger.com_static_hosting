const PROJECTS_JSON_URL = "./data/projects.json";

function isExternalHref(href) {
  try {
    const url = new URL(href, window.location.href);
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof text === "string") node.textContent = text;
  return node;
}

function elHTML(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (typeof html === "string") node.innerHTML = html;
  return node;
}

function formatMonthYear(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  // Support YYYY-MM by normalizing to an ISO date.
  const iso = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;

  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(d);
  } catch {
    return "";
  }
}

function parseProjectDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}$/.test(s) ? `${s}-01` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function projectSortKey(project) {
  const d = parseProjectDate(project?.launchDate || project?.date || project?.createdAt);
  return d ? d.getTime() : -Infinity;
}

function getPrimaryHref(project) {
  const links = Array.isArray(project?.links) ? project.links : [];
  const primaryLink = links.find((l) => String(l?.kind || "").trim().toLowerCase() === "primary");
  const hrefRaw =
    typeof primaryLink?.href === "string"
      ? primaryLink.href
      : typeof links[0]?.href === "string"
        ? links[0].href
        : "";
  const href = String(hrefRaw || "").trim();
  if (!href || href === "#") return "";
  return href;
}

function renderProjects(target, projects) {
  target.replaceChildren();
  target.setAttribute("aria-busy", "false");

  if (!Array.isArray(projects) || projects.length === 0) {
    target.append(el("p", "muted", "No projects found."));
    return;
  }

  const sorted = [...projects].sort((a, b) => projectSortKey(b) - projectSortKey(a));
  const cards = [];

  const normalizeTone = (project, fallbackColor = "") => {
    const raw = String(project?.tone || "").trim().toLowerCase();
    if (raw === "light" || raw === "dark") return raw;

    const hex = String(fallbackColor || "").trim();
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if (!m) return "dark";
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luma >= 0.72 ? "light" : "dark";
  };

  for (const [index, project] of sorted.entries()) {
    const href = getPrimaryHref(project);
    const cardEl = el("article", "project-card");

    const bg = typeof project?.cardColor === "string" ? project.cardColor.trim() : "";
    if (bg) cardEl.style.setProperty("--project-card-bg", bg);

    const cardImageSrc = typeof project?.cardImage === "string" ? project.cardImage.trim() : "";
    if (cardImageSrc) {
      // Use CSS variable so we can keep other background styles in CSS.
      const safeUrl = cardImageSrc.replace(/"/g, '\\"');
      const urlValue = `url("${safeUrl}")`;
      cardEl.style.setProperty("--project-card-image", urlValue);
      // Also set directly to avoid any var()/browser edge-cases.
      cardEl.style.backgroundImage = urlValue;
    } else {
      const imageColor = typeof project?.imageColor === "string" ? project.imageColor.trim() : "";
      if (imageColor && !bg) {
        cardEl.style.setProperty("--project-card-bg", imageColor);
      }
    }

    const content = el("div", "project-card__content");
    const title = el("h3", "project-card__title", project?.name || "Untitled");
    const descText = String(project?.shortDescription || project?.problem || project?.oneLiner || "").trim();
    const desc = el("p", "project-card__desc", descText);

    const dateText = formatMonthYear(project?.launchDate);
    const tone = normalizeTone(project, bg);
    const metaRow = el("div", "project-card__meta-row");
    const eyebrowLabel = dateText ? dateText : index === 0 ? "Latest" : "Project";
    const eyebrow = el("div", "project-card__eyebrow", eyebrowLabel);
    if (tone === "light") eyebrow.classList.add("project-card__eyebrow--dark");
    metaRow.append(eyebrow);

    const badgeText = typeof project?.badge === "string" ? project.badge.trim() : "";
    if (badgeText) {
      const badge = el("div", "project-card__badge project-card__badge--blue", badgeText);
      metaRow.append(badge);
    }

    content.append(metaRow);

    const cardContent = typeof project?.cardContent === "string" ? project.cardContent.trim() : "";
    if (cardContent) {
      content.append(elHTML("div", "project-card__rich", cardContent));
    } else {
      content.append(title);
      if (descText) content.append(desc);
    }
    cardEl.append(content);

    if (href) {
      const a = document.createElement("a");
      a.className = "project-card__link";
      a.href = href;
      a.setAttribute("aria-label", project?.name ? `Open ${project.name}` : "Open project");
      if (isExternalHref(href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      a.append(cardEl);
      target.append(a);
      cards.push(a);
    } else {
      target.append(cardEl);
      cards.push(cardEl);
    }
  }

  registerAppearElements(cards);
  window.requestAnimationFrame(() => animateVisibleRegisteredInOrder());
}

function formatUpdatedAt(raw) {
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

function initProjectsSliderControls() {
  const track = document.getElementById("projects-list");
  if (!(track instanceof HTMLElement)) return;

  const prev = document.getElementById("projects-prev");
  const next = document.getElementById("projects-next");

  const SNAP_DISABLED_CLASS = "projects-slider__track--snap-disabled";

  const getStep = () => {
    const first = track.querySelector(".project-card, .project-card__link");
    const rect = first instanceof HTMLElement ? first.getBoundingClientRect() : null;
    const style = window.getComputedStyle(track);
    const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
    const w = rect?.width || 360;
    return w + gap;
  };

  const getMaxScrollLeft = () => Math.max(0, track.scrollWidth - track.clientWidth);

  const getDisableSnapThreshold = () => {
    // Dynamic threshold: big enough to avoid the "last snap", but small enough
    // to preserve snapping for most of the track.
    const step = getStep();
    return Math.max(24, Math.min(140, step * 0.6));
  };

  const isNearEnd = () => {
    const max = getMaxScrollLeft();
    if (max <= 0) return false;
    return max - track.scrollLeft <= getDisableSnapThreshold();
  };

  const updateSnapMode = () => {
    track.classList.toggle(SNAP_DISABLED_CLASS, isNearEnd());
  };

  const scrollByCards = (dir) => {
    track.scrollBy({ left: dir * getStep(), behavior: "smooth" });
  };

  if (prev instanceof HTMLButtonElement) prev.addEventListener("click", () => scrollByCards(-1));
  if (next instanceof HTMLButtonElement) next.addEventListener("click", () => scrollByCards(1));

  const getItems = () =>
    Array.from(track.children).filter(
      (node) =>
        node instanceof HTMLElement &&
        (node.classList.contains("project-card__link") || node.classList.contains("project-card")),
    );

  const getSnapInset = () => {
    const style = window.getComputedStyle(track);
    const paddingLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
    return paddingLeft;
  };

  const snapToNearest = () => {
    updateSnapMode();
    if (track.classList.contains(SNAP_DISABLED_CLASS)) return;

    const items = getItems();
    if (items.length === 0) return;

    const inset = getSnapInset();
    const points = items.map((el) => Math.max(0, el.offsetLeft - inset));
    const x = track.scrollLeft;

    // Find the closest snap point using midpoints between cards.
    let idx = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const mid = (points[i] + points[i + 1]) / 2;
      if (x >= mid) idx = i + 1;
      else break;
    }

    const targetLeft = points[idx] ?? 0;
    track.scrollTo({ left: targetLeft, behavior: "smooth" });
  };

  // After the user stops scrolling, snap to the nearest card.
  let scrollEndTimer = null;
  track.addEventListener(
    "scroll",
    () => {
      updateSnapMode();
      if (scrollEndTimer) window.clearTimeout(scrollEndTimer);
      scrollEndTimer = window.setTimeout(() => {
        scrollEndTimer = null;
        snapToNearest();
      }, 140);
    },
    { passive: true },
  );

  updateSnapMode();
  window.addEventListener("resize", updateSnapMode, { passive: true });
}

async function loadProjects() {
  const target = document.getElementById("projects-list");
  if (!target) return;

  target.setAttribute("aria-busy", "true");
  try {
    const res = await fetch(PROJECTS_JSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load projects (${res.status})`);
    const data = await res.json();
    const projects = data?.projects || [];
    const meta = document.getElementById("projects-meta");
    if (meta) {
      // Intentionally left blank (no "Updated … · N projects" label).
      meta.textContent = "";
    }

    renderProjects(target, projects);
  } catch (err) {
    target.replaceChildren();
    target.setAttribute("aria-busy", "false");
    target.append(el("p", "muted", "Couldn’t load projects right now."));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initAppearAnimations();
  initStartupsMarquee();
  initProjectsSliderControls();
  loadProjects();
  initIdeaForm();
  initImprintToggle();
  initDataPolicyToggle();
  initPolicyDeepLinks();
});

function initStartupsMarquee() {
  const marquee = document.querySelector(".startups-marquee");
  if (!(marquee instanceof HTMLElement)) return;

  const inner = marquee.querySelector(".startups-marquee__inner");
  const track = marquee.querySelector(".startups-marquee__track");
  if (!(inner instanceof HTMLElement)) return;
  if (!(track instanceof HTMLUListElement)) return;

  if (marquee.dataset.marqueeReady === "true") return;
  marquee.dataset.marqueeReady = "true";

  // Duplicate the track for a seamless loop.
  const clone = track.cloneNode(true);
  if (clone instanceof HTMLUListElement) {
    clone.setAttribute("aria-hidden", "true");
    // Prevent duplicate announcements if screen readers traverse images anyway.
    for (const img of clone.querySelectorAll("img")) {
      if (img instanceof HTMLImageElement) img.alt = "";
    }
    inner.append(clone);
  }

  // Set duration based on width so speed feels consistent across viewports.
  const width = track.scrollWidth || track.getBoundingClientRect().width || 0;
  const pxPerSecond = 55; // lower = slower
  const secondsRaw = width > 0 ? width / pxPerSecond : 28;
  const seconds = Math.max(18, Math.min(48, secondsRaw));
  inner.style.setProperty("--marquee-duration", `${seconds.toFixed(2)}s`);
}

function animateAppearById(id, { duration = 650, easing = "easeOut", fromY = 20, fromOpacity = 0.2 } = {}) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) return;
  if (el.dataset.appearAnimated === "true") return;

  const $ = window.jQuery;
  if (typeof $ !== "function") return;

  // jQuery core only includes "swing" and "linear" easings.
  // Add a simple "easeOut" easing without pulling in jQuery UI.
  if (typeof $.easing?.easeOut !== "function") {
    $.easing = $.easing || {};
    $.easing.easeOut = (x, t, b, c, d) => {
      t = t / d - 1;
      return c * (t * t * t + 1) + b; // easeOutCubic
    };
  }

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduceMotion) {
    el.style.opacity = "1";
    el.style.transform = "translate3d(0, 0, 0)";
    el.dataset.appearAnimated = "true";
    return;
  }

  // Ensure known starting state.
  el.style.willChange = "transform, opacity";
  el.style.opacity = String(fromOpacity);
  el.style.transform = `translate3d(0, ${fromY}px, 0)`;

  el.dataset.appearAnimated = "true";

  const $el = $(el);
  const state = { y: fromY, opacity: fromOpacity };

  $(state).stop(true).animate(
    { y: 0, opacity: 1 },
    {
      duration,
      easing: easing === "swing" ? "easeOut" : easing,
      step: (now, fx) => {
        if (fx.prop === "y") {
          $el.css("transform", `translate3d(0, ${now}px, 0)`);
        } else if (fx.prop === "opacity") {
          $el.css("opacity", now);
        }
      },
      complete: () => {
        $el.css({ transform: "translate3d(0, 0, 0)", opacity: "1", willChange: "" });
      },
    },
  );
}

const APPEAR_STAGGER_MS = 100;
const APPEAR_THRESHOLD = 0.15;
const APPEAR_DEFAULT_FROM_Y = 20;
const APPEAR_DEFAULT_FROM_OPACITY = 0.0;

let appearIdSeq = 0;
let appearObserver = null;
let appearFallbackListening = false;
let appearRescheduleRequested = false;
let appearViewportListenersAttached = false;

const appearOptions = new WeakMap();
const appearTimeouts = new WeakMap();
const appearRegistered = new Set();
const appearFallbackElements = new Set();

function compareAppearOrder(a, b) {
  const topA = a.getBoundingClientRect().top;
  const topB = b.getBoundingClientRect().top;
  if (topA !== topB) return topA - topB;

  // Stable tie-breaker: DOM order (top ties happen often for inline elements).
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function ensureAppearId(el, prefix = "appear") {
  if (el.id) return el.id;
  appearIdSeq += 1;
  const id = `${prefix}-${appearIdSeq}`;
  el.id = id;
  return id;
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function prepareAppearInitialState(el, { fromY = APPEAR_DEFAULT_FROM_Y, fromOpacity = APPEAR_DEFAULT_FROM_OPACITY } = {}) {
  el.style.willChange = "transform, opacity";
  el.style.opacity = String(fromOpacity);
  el.style.transform = `translate3d(0, ${fromY}px, 0)`;
}

function normalizeAppearOptions(options = {}) {
  return {
    duration: typeof options.duration === "number" ? options.duration : 650,
    easing: typeof options.easing === "string" ? options.easing : "easeOut",
    fromY: typeof options.fromY === "number" ? options.fromY : APPEAR_DEFAULT_FROM_Y,
    fromOpacity: typeof options.fromOpacity === "number" ? options.fromOpacity : APPEAR_DEFAULT_FROM_OPACITY,
  };
}

function clearScheduledAppear(el) {
  const timeoutId = appearTimeouts.get(el);
  if (typeof timeoutId === "number") {
    window.clearTimeout(timeoutId);
  }
  appearTimeouts.delete(el);
}

function rescheduleAppearAnimationsInViewport() {
  const toAnimate = [];

  // Cancel any scheduled animations that are no longer eligible (e.g. scrolled away).
  for (const el of appearRegistered) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.dataset.appearAnimated === "true") {
      clearScheduledAppear(el);
      continue;
    }
    if (!isInViewport(el, 0)) {
      clearScheduledAppear(el);
    }
  }

  // Build one global, deterministic list of visible elements.
  for (const el of appearRegistered) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.dataset.appearAnimated === "true") continue;
    if (!isInViewport(el, 0)) continue;
    toAnimate.push(el);
  }

  toAnimate.sort(compareAppearOrder);

  for (const [idx, el] of toAnimate.entries()) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.dataset.appearAnimated === "true") continue;

    const opts = normalizeAppearOptions(appearOptions.get(el));
    const id = ensureAppearId(el);

    // Re-schedule from scratch so the stagger always matches top-to-bottom order.
    clearScheduledAppear(el);
    const timeoutId = window.setTimeout(() => {
      appearTimeouts.delete(el);
      animateAppearById(id, opts);
      if (el.dataset.appearAnimated === "true") {
        appearObserver?.unobserve(el);
        appearFallbackElements.delete(el);
      }
    }, idx * APPEAR_STAGGER_MS);

    appearTimeouts.set(el, timeoutId);
  }
}

function requestAppearReschedule() {
  if (appearRescheduleRequested) return;
  appearRescheduleRequested = true;
  window.requestAnimationFrame(() => {
    appearRescheduleRequested = false;
    rescheduleAppearAnimationsInViewport();
  });
}

function ensureAppearViewportListeners() {
  if (appearViewportListenersAttached) return;
  appearViewportListenersAttached = true;
  // Keep ordering deterministic as the user scrolls/resizes.
  window.addEventListener("scroll", requestAppearReschedule, { passive: true });
  window.addEventListener("resize", requestAppearReschedule);
}

function ensureAppearObserver() {
  if (appearObserver) return appearObserver;
  if (!("IntersectionObserver" in window)) return null;

  appearObserver = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        const el = entry.target;
        if (!(el instanceof HTMLElement)) continue;
        if (el.dataset.appearAnimated === "true") {
          obs.unobserve(el);
          continue;
        }
      }

      // Recompute a single global top-to-bottom stagger order.
      requestAppearReschedule();
    },
    { threshold: APPEAR_THRESHOLD },
  );

  return appearObserver;
}

function fallbackAppearCheck() {
  for (const el of appearFallbackElements) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.dataset.appearAnimated === "true") {
      appearFallbackElements.delete(el);
      continue;
    }
    if (!isInViewport(el, 0)) continue;
  }
  requestAppearReschedule();

  if (appearFallbackElements.size === 0 && appearFallbackListening) {
    appearFallbackListening = false;
    window.removeEventListener("scroll", fallbackAppearCheck);
    window.removeEventListener("resize", fallbackAppearCheck);
  }
}

function animateVisibleRegisteredInOrder() {
  requestAppearReschedule();
}

function registerAppearElements(elements, options = {}) {
  const $ = window.jQuery;
  if (typeof $ !== "function") return;

  ensureAppearViewportListeners();

  const reduceMotion = prefersReducedMotion();
  const els = Array.from(elements || []).filter((el) => el instanceof HTMLElement);
  if (els.length === 0) return;

  const opts = normalizeAppearOptions(options);

  for (const el of els) {
    if (el.dataset.appearAnimated === "true") continue;
    appearRegistered.add(el);
    appearOptions.set(el, opts);

    if (reduceMotion) {
      el.style.opacity = "1";
      el.style.transform = "translate3d(0, 0, 0)";
      el.style.willChange = "";
      el.dataset.appearAnimated = "true";
      continue;
    }

    prepareAppearInitialState(el, opts);

    const observer = ensureAppearObserver();
    if (observer) {
      observer.observe(el);
    } else {
      appearFallbackElements.add(el);
    }
  }

  if (!ensureAppearObserver() && !appearFallbackListening && appearFallbackElements.size > 0) {
    appearFallbackListening = true;
    window.addEventListener("scroll", fallbackAppearCheck, { passive: true });
    window.addEventListener("resize", fallbackAppearCheck);
    fallbackAppearCheck();
  }
  requestAppearReschedule();
}

function initAppearAnimations() {
  registerAppearElements(
    document.querySelectorAll(
      [
        ".profile__image",
        ".profile__name",
        ".profile__tagline",
        ".profile__social",
        ".profile__startups",
        ".section__title",
        // Paragraphs (scoped to avoid animating the entire legal footer copy).
        // Note: exclude `.section__meta` so it can animate when populated (e.g. projects updated line).
        ".content p:not(.section__meta)",
        // Form blocks.
        ".field",
        ".idea-form__actions",
      ].join(", "),
    ),
  );

  // Step list items (left side of "Submit idea" section).
  registerAppearElements(document.querySelectorAll(".idea-process__item"), { fromY: 12, duration: 560 });

  // Ensure a deterministic top-to-bottom ordering for everything already visible.
  window.requestAnimationFrame(() => animateVisibleRegisteredInOrder());
}

function isInViewport(el, thresholdPx = 0) {
  const rect = el.getBoundingClientRect();
  const viewH = window.innerHeight || document.documentElement.clientHeight;
  const viewW = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.bottom >= thresholdPx &&
    rect.right >= thresholdPx &&
    rect.top <= viewH - thresholdPx &&
    rect.left <= viewW - thresholdPx
  );
}

function setDisclosureOpen(toggle, panel, open) {
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  panel.hidden = !open;
}

function openImprintPanel({ scroll = true, behavior = "smooth" } = {}) {
  const toggle = document.getElementById("imprint-toggle");
  const panel = document.getElementById("imprint-panel");
  if (!(toggle instanceof HTMLButtonElement)) return;
  if (!(panel instanceof HTMLElement)) return;

  setDisclosureOpen(toggle, panel, true);

  if (scroll) {
    panel.scrollIntoView({ behavior, block: "start" });
  }
}

function openDataPolicyPanel({ scroll = true, behavior = "smooth" } = {}) {
  const toggle = document.getElementById("data-policy-toggle");
  const panel = document.getElementById("data-policy-panel");
  if (!(toggle instanceof HTMLButtonElement)) return;
  if (!(panel instanceof HTMLElement)) return;

  setDisclosureOpen(toggle, panel, true);

  if (scroll) {
    panel.scrollIntoView({ behavior, block: "start" });
  }
}

function initIdeaForm() {
  const form = document.getElementById("idea-form");
  if (!form) return;

  const status = document.getElementById("idea-status");
  const result = document.getElementById("idea-result");
  const preview = document.getElementById("idea-preview");

  let latestText = "";

  function setStatus(message, { variant } = {}) {
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("idea-form__status--error", variant === "error");
  }

  function buildSubmission(data) {
    const lines = [
      "Business Idea Submission",
      "========================",
      "",
      `Email: ${data.email || ""}`,
      `Okay to contact: ${data.okToContact ? "Yes" : "No"}`,
      "",
      "Idea",
      "----",
      data.idea || "",
    ];

    lines.push("", `Submitted: ${new Date().toISOString()}`);
    return lines.join("\n");
  }

  form.addEventListener("reset", () => {
    setStatus("");
    latestText = "";
    if (result) result.hidden = true;
    if (preview) preview.textContent = "";
  });

  form.addEventListener("submit", (e) => {
    const fd = new FormData(form);
    const honeypot = String(fd.get("company") || "").trim();
    if (honeypot) {
      e.preventDefault();
      setStatus("Thanks! (Submission received.)");
      form.reset();
      return;
    }

    const data = {
      email: String(fd.get("email") || "").trim(),
      idea: String(fd.get("problem") || "").trim(),
      okToContact: Boolean(fd.get("okToContact")),
    };

    if (!data.email || !data.idea) {
      e.preventDefault();
      setStatus("Just add your email and idea to get started.", { variant: "error" });
      return;
    }

    latestText = buildSubmission(data);

    if (preview) preview.textContent = latestText;
    if (result) result.hidden = false;

    // Allow the browser to submit the form to its configured `action`.
    setStatus("Submitting…");
  });
}

function initImprintToggle() {
  const toggle = document.getElementById("imprint-toggle");
  const panel = document.getElementById("imprint-panel");
  if (!(toggle instanceof HTMLButtonElement)) return;
  if (!(panel instanceof HTMLElement)) return;

  const setOpen = (open) => {
    setDisclosureOpen(toggle, panel, open);
  };

  // Ensure consistent initial state.
  setOpen(toggle.getAttribute("aria-expanded") === "true");

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!isOpen);
  });
}

function initDataPolicyToggle() {
  const toggle = document.getElementById("data-policy-toggle");
  const panel = document.getElementById("data-policy-panel");
  if (!(toggle instanceof HTMLButtonElement)) return;
  if (!(panel instanceof HTMLElement)) return;

  const setOpen = (open) => {
    setDisclosureOpen(toggle, panel, open);
  };

  // Ensure consistent initial state.
  setOpen(toggle.getAttribute("aria-expanded") === "true");

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!isOpen);
  });
}

function initPolicyDeepLinks() {
  // Open in-footer policy panels when linked via hash.
  const hash = String(window.location.hash || "").toLowerCase();
  if (hash === "#imprint-panel" || hash === "#imprint") {
    openImprintPanel({ scroll: true, behavior: "auto" });
  }
  if (hash === "#data-policy-panel" || hash === "#data-policy") {
    // Use instant scrolling on load (mirrors native anchor navigation).
    openDataPolicyPanel({ scroll: true, behavior: "auto" });
  }

  // Intercept in-page links that are meant to open the footer policy panels.
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const imprintLink = target?.closest('a[data-open-panel="imprint"]');
    const dataPolicyLink = target?.closest('a[data-open-panel="data-policy"]');
    const link = imprintLink || dataPolicyLink;
    if (!link) return;

    e.preventDefault();
    e.stopPropagation();

    if (imprintLink) {
      if (window.location.hash !== "#imprint-panel") {
        history.pushState(null, "", "#imprint-panel");
      }
      openImprintPanel({ scroll: true });
      return;
    }

    if (window.location.hash !== "#data-policy-panel") {
      history.pushState(null, "", "#data-policy-panel");
    }

    openDataPolicyPanel({ scroll: true });
  });
}
