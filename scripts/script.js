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

function titleCaseStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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

function createChevronIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("build-card__chevron");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M7 10l5 5 5-5");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);

  return svg;
}

function buildEyebrow(project, index) {
  return `Product MVP Build ${String(index + 1).padStart(2, "0")}`;
}

function setExpanded(card, toggleBtn, toggleLabel, detailsEl, expanded) {
  card.classList.toggle("is-expanded", expanded);
  toggleBtn?.setAttribute("aria-expanded", expanded ? "true" : "false");
  detailsEl?.setAttribute("aria-hidden", expanded ? "false" : "true");
  if (toggleLabel) toggleLabel.textContent = expanded ? "Less" : "View Build";
}

function renderProjects(target, projects) {
  target.replaceChildren();
  target.setAttribute("aria-busy", "false");

  if (!Array.isArray(projects) || projects.length === 0) {
    target.append(el("p", "muted", "No projects found."));
    return;
  }

  const sorted = [...projects];
  const cards = [];

  for (const [index, project] of sorted.entries()) {
    const card = el("article", "build-card");
    if (index === 0) card.classList.add("build-card--feature");
    card.classList.add("build-card--clickable");

    const gradient = typeof project?.gradient === "string" ? project.gradient.trim() : "";
    if (gradient) card.style.setProperty("--build-accent", gradient);

    const main = el("div", "build-card__main");

    const meta = el("div", "build-card__meta");
    meta.append(el("div", "build-card__eyebrow", buildEyebrow(project, index)));
    meta.append(el("h3", "build-card__title", project?.name || "Untitled"));
    main.append(meta);

    const side = el("div", "build-card__side");

    const thumbSrc = typeof project?.thumbnail === "string" ? project.thumbnail.trim() : "";
    if (thumbSrc) {
      const links = Array.isArray(project?.links) ? project.links : [];
      const primaryLink = links.find((l) => String(l?.kind || "").trim().toLowerCase() === "primary");
      const hrefRaw = typeof primaryLink?.href === "string" ? primaryLink.href : typeof links[0]?.href === "string" ? links[0].href : "";
      const href = String(hrefRaw || "").trim();

      const img = document.createElement("img");
      img.className = "build-card__thumb";
      img.src = thumbSrc;
      img.alt = project?.name ? `${project.name} thumbnail` : "Project thumbnail";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => img.remove());

      if (href && href !== "#") {
        const a = document.createElement("a");
        a.className = "build-card__thumb-link";
        a.href = href;
        a.setAttribute("aria-label", project?.name ? `Open ${project.name}` : "Open project");
        if (isExternalHref(href)) {
          a.target = "_blank";
          a.rel = "noopener noreferrer";
        }
        a.append(img);
        side.append(a);
      } else {
        side.append(img);
      }
    }

    const statusText = titleCaseStatus(project?.status);
    if (statusText) {
      const statusKey = String(project.status || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
      side.append(el("span", `build-card__status build-card__status--${statusKey}`, statusText));

      if (statusKey === "launched") {
        const launchText = formatMonthYear(project?.launchDate);
        if (launchText) {
          side.append(el("div", "build-card__launch-date", launchText));
        }
      }
    } else {
      side.append(el("span", "build-card__status build-card__status--unknown", "TBD"));
    }
    // Status column on the left, content on the right.
    card.append(side, main);

    const problemText = project?.problem || project?.oneLiner;
    if (problemText) {
      main.append(el("p", "build-card__summary", problemText));
    }

    const details = el("div", "build-card__details");
    // Include index to avoid DOM id collisions if `project.id` is duplicated/missing.
    const detailsId = `build-details-${index}-${String(project?.id || "project")}`.replace(/[^a-z0-9_-]/gi, "-");
    details.id = detailsId;
    details.setAttribute("aria-hidden", "true");

    const hypothesisText = project?.hypothesis || project?.whatImTesting;
    if (hypothesisText) {
      details.append(el("div", "build-card__label", "Hypothesis"));
      details.append(el("p", "build-card__detail", hypothesisText));
    }

    const detailsText = typeof project?.details === "string" ? project.details.trim() : "";
    if (detailsText) {
      details.append(el("div", "build-card__label", "Details"));
      details.append(elHTML("p", "build-card__detail", detailsText));
    }
    main.append(details);

    const actions = el("div", "build-card__actions");
    const toggleBtn = el("button", "build-card__toggle");
    toggleBtn.type = "button";
    toggleBtn.setAttribute("aria-controls", detailsId);
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.setAttribute("aria-label", `Toggle details for ${project?.name || "this build"}`);
    const toggleLabel = el("span", "build-card__toggle-label", "Details");
    toggleBtn.append(toggleLabel, createChevronIcon());
    actions.append(toggleBtn);

    const links = Array.isArray(project?.links) ? project.links : [];
    for (const link of links) {
      const href = typeof link?.href === "string" ? link.href.trim() : "";
      if (!href || href === "#") continue;
      const label = typeof link?.label === "string" ? link.label.trim() : "";
      const kind = typeof link?.kind === "string" ? link.kind.trim().toLowerCase() : "";

      const a = document.createElement("a");
      a.className = `build-card__toggle build-card__link${kind === "primary" ? " build-card__link--primary" : ""}`;
      a.href = href;
      a.textContent = label || "Open";

      if (isExternalHref(href)) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }

      actions.append(a);
    }

    main.append(actions);

    setExpanded(card, toggleBtn, toggleLabel, details, false);
    const toggleExpanded = () => {
      setExpanded(card, toggleBtn, toggleLabel, details, !card.classList.contains("is-expanded"));
    };

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleExpanded();
    });

    card.addEventListener("click", (e) => {
      // Make the full card clickable, but don't hijack other interactive elements.
      const targetEl = e.target instanceof Element ? e.target : null;
      if (targetEl?.closest("a, button, input, textarea, select, label")) return;
      toggleExpanded();
    });

    target.append(card);
    cards.push(card);
  }

  // If the last row would have a single card (because the first one is full width),
  // make that last "lonely" card full width as well.
  if (cards.length > 1 && cards.length % 2 === 0) {
    cards[cards.length - 1].classList.add("build-card--full");
  }

  // Animate cards as they appear (staggered top-to-bottom).
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
      const dateText = formatUpdatedAt(data?.updatedAt);
      const count = Array.isArray(projects) ? projects.length : 0;
      meta.textContent = dateText ? `Updated ${dateText} · ${count} builds` : `${count} builds`;
      // Register *after* content is set so it animates in the right order,
      // then cards will animate after it.
      registerAppearElements([meta]);
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

  function setStatus(message) {
    if (!status) return;
    status.textContent = message || "";
  }

  function buildSubmission(data) {
    const lines = [
      "Business Idea Submission",
      "========================",
      "",
      `Name: ${data.name || ""}`,
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
      name: String(fd.get("name") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      idea: String(fd.get("problem") || "").trim(),
      okToContact: Boolean(fd.get("okToContact")),
    };

    if (!data.name || !data.email || !data.idea) {
      e.preventDefault();
      setStatus("Please fill in all required fields (name, email, idea).");
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
