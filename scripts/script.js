const PROJECTS_JSON_URL = "./data/projects.json";

let waitlistModalLastActive = null;
let waitlistModalScrollY = 0;
let waitlistModalScrollLocked = false;

function focusNoScroll(el) {
  if (!(el instanceof HTMLElement)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

function lockWaitlistBackgroundScroll() {
  if (waitlistModalScrollLocked) return;
  waitlistModalScrollLocked = true;
  waitlistModalScrollY = window.scrollY || window.pageYOffset || 0;

  // Keep the visual scroll position stable while preventing background scroll.
  document.body.style.position = "fixed";
  document.body.style.top = `-${waitlistModalScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.dataset.waitlistScrollLock = "true";
}

function unlockWaitlistBackgroundScroll() {
  if (!waitlistModalScrollLocked) return;
  waitlistModalScrollLocked = false;

  const y = waitlistModalScrollY;
  waitlistModalScrollY = 0;

  if (document.body.dataset.waitlistScrollLock === "true") {
    delete document.body.dataset.waitlistScrollLock;
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
  }

  window.scrollTo({ top: y, behavior: "auto" });
}

function getWaitlistModalEls() {
  const root = document.getElementById("waitlist-modal");
  if (!(root instanceof HTMLElement)) return null;
  const dialog = root.querySelector(".waitlist-modal__dialog");
  const email = root.querySelector('input[name="email"]');
  if (!(dialog instanceof HTMLElement)) return null;
  const emailInput = email instanceof HTMLInputElement ? email : null;
  return { root, dialog, emailInput };
}

function isWaitlistModalOpen() {
  const els = getWaitlistModalEls();
  return Boolean(els && !els.root.hidden);
}

function closeWaitlistModal({ restoreFocus = true } = {}) {
  const els = getWaitlistModalEls();
  if (!els) return;
  if (els.root.hidden) return;

  els.root.hidden = true;
  document.body.classList.remove("is-modal-open");
  unlockWaitlistBackgroundScroll();

  if (restoreFocus && waitlistModalLastActive instanceof HTMLElement) {
    focusNoScroll(waitlistModalLastActive);
  }
  waitlistModalLastActive = null;
}

function openWaitlistModal({ focus = true } = {}) {
  const els = getWaitlistModalEls();
  if (!els) return;

  if (!isWaitlistModalOpen()) {
    waitlistModalLastActive = document.activeElement;
    lockWaitlistBackgroundScroll();
    els.root.hidden = false;
    document.body.classList.add("is-modal-open");
  }

  if (els.emailInput) {
    els.emailInput.value = "";
  }

  // Ensure focus happens after layout is updated.
  if (focus) {
    window.requestAnimationFrame(() => {
      const { emailInput, dialog } = getWaitlistModalEls() || {};
      if (emailInput) focusNoScroll(emailInput);
      else if (dialog) focusNoScroll(dialog);
    });
  }
}

function initWaitlistModal() {
  const els = getWaitlistModalEls();
  if (!els) return;
  if (els.root.dataset.waitlistInit === "true") return;
  els.root.dataset.waitlistInit = "true";

  // Open on any "Get Early Access"/waitlist trigger.
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const openEl = target?.closest("[data-waitlist-open]");
    if (!openEl) return;
    e.preventDefault();
    openWaitlistModal();
  });

  // Close on backdrop / close button.
  els.root.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const closeEl = target.closest("[data-waitlist-close]");
    if (!closeEl) return;
    e.preventDefault();
    closeWaitlistModal();
  });

  // Escape to close + trap focus.
  document.addEventListener("keydown", (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (!isWaitlistModalOpen()) return;

    if (e.key === "Escape") {
      e.preventDefault();
      closeWaitlistModal();
      return;
    }

    if (e.key !== "Tab") return;

    const { dialog } = getWaitlistModalEls() || {};
    if (!dialog) return;

    const focusables = Array.from(
      dialog.querySelectorAll(
        [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          '[tabindex]:not([tabindex="-1"])',
        ].join(","),
      ),
    ).filter((n) => n instanceof HTMLElement && n.offsetParent !== null);

    if (focusables.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

function detectFlexGapSupport() {
  // Older Safari/WebKit doesn't support flex gap. When missing, many layouts look "broken"
  // (no spacing, bad wrapping). We toggle a class so CSS can provide safe fallbacks.
  try {
    const flex = document.createElement("div");
    flex.style.display = "flex";
    flex.style.flexDirection = "column";
    flex.style.rowGap = "10px";
    flex.style.position = "absolute";
    flex.style.top = "-9999px";
    flex.style.left = "-9999px";
    const c1 = document.createElement("div");
    const c2 = document.createElement("div");
    // Use non-zero heights so measurement is reliable across Safari/WebKit versions.
    c1.style.height = "10px";
    c2.style.height = "10px";
    flex.append(c1, c2);
    document.body.appendChild(flex);
    const h = flex.getBoundingClientRect().height;
    const isSupported = Math.round(h) === 30; // 10 + 10 + 10(gap)
    flex.remove();
    document.documentElement.classList.toggle("no-flexgap", !isSupported);
  } catch {
    // If detection fails for any reason, assume "no gap" and fall back.
    document.documentElement.classList.add("no-flexgap");
  }
}

function updateViewportCssVars() {
  // Safari has had multiple edge-cases with calc()/max() when mixing vw/px inside custom properties.
  // We compute the key sizing vars in JS to keep spacing consistent across engines.
  const root = document.documentElement;
  const cs = window.getComputedStyle(root);
  const contentMax = Number.parseFloat(cs.getPropertyValue("--content-max-width")) || 1200;
  const gutter = Number.parseFloat(cs.getPropertyValue("--page-gutter")) || 20;

  // Prefer layout viewport width (matches CSS vw most closely).
  const vw = root.clientWidth || window.innerWidth || 0;
  if (vw > 0) {
    root.style.setProperty("--viewport-width", `${vw}px`);
    const pageInset = Math.max(gutter, (vw - contentMax) / 2 + gutter);
    root.style.setProperty("--page-inset", `${pageInset}px`);
  }
}

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

function getProjectStateLabel(project) {
  const explicit = String(project?.badge || "").trim();
  if (explicit) return explicit;

  const status = String(project?.status || "")
    .trim()
    .toLowerCase();

  switch (status) {
    case "building":
      return "Currently Building";
    case "testing":
      return "Testing";
    case "live":
      return "Live";
    case "launched":
    case "completed":
      return "Launched";
    default:
      return status ? status : "In Progress";
  }
}

function getProjectStatusKey(project) {
  return String(project?.status || "")
    .trim()
    .toLowerCase();
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

function getPrimaryCtaLabel(project) {
  const raw = typeof project?.primaryCtaLabel === "string" ? project.primaryCtaLabel.trim() : "";
  return raw;
}

function getVideoHref(project) {
  const direct =
    typeof project?.videoHref === "string"
      ? project.videoHref
      : typeof project?.videoUrl === "string"
        ? project.videoUrl
        : typeof project?.video === "string"
          ? project.video
          : "";
  const directHref = String(direct || "").trim();
  if (directHref && directHref !== "#") return directHref;

  const links = Array.isArray(project?.links) ? project.links : [];
  const videoLink = links.find((l) => String(l?.kind || "").trim().toLowerCase() === "video");
  const href = typeof videoLink?.href === "string" ? videoLink.href.trim() : "";
  if (!href || href === "#") return "";
  return href;
}

function normalizeTone(project, fallbackColor = "") {
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
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdownToHtml(markdownRaw) {
  const md = String(markdownRaw || "").replace(/\r\n/g, "\n");
  const lines = md.split("\n");
  const out = [];

  let para = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) out.push("</ul>");
    if (inOl) out.push("</ol>");
    inUl = false;
    inOl = false;
  };

  const flushPara = () => {
    if (para.length === 0) return;
    closeLists();
    out.push(`<p>${para.join("<br>")}</p>`);
    para = [];
  };

  const inline = (text) => {
    let s = escapeHtml(text);
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const safeAlt = String(alt || "");
      const safeUrl = String(url || "");
      return `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" decoding="async" />`;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeLabel = String(label || "");
      const safeUrl = String(url || "");
      const external = /^https?:\/\//i.test(safeUrl);
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<a href="${safeUrl}"${attrs}>${safeLabel}</a>`;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    return s;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      closeLists();
      const level = Math.min(6, 3 + heading[1].length); // start at h4-ish since title already exists
      out.push(`<h${level} class="project-detail__heading">${inline(heading[2] || "")}</h${level}>`);
      continue;
    }

    const ul = /^-\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inline(ul[1] || "")}</li>`);
      continue;
    }

    const ol = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${inline(ol[2] || "")}</li>`);
      continue;
    }

    para.push(inline(trimmed));
  }

  flushPara();
  closeLists();
  return out.join("\n");
}

function renderProjectHtml(htmlRaw) {
  const html = String(htmlRaw || "");
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  const fragmentRoot = tpl.content;
  for (const node of Array.from(fragmentRoot.querySelectorAll("script"))) {
    node.remove();
  }

  // If a full HTML document was provided, prefer the <body> contents.
  const body = fragmentRoot.querySelector("body");
  return body ? body.innerHTML : tpl.innerHTML;
}

const projectDetailCache = new Map();

async function fetchTextCached(url) {
  const key = String(url || "").trim();
  if (!key) return "";
  if (projectDetailCache.has(key)) return projectDetailCache.get(key);
  const res = await fetch(key, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${key} (${res.status})`);
  const text = await res.text();
  projectDetailCache.set(key, text);
  return text;
}

function normalizeImageList(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const s = String(item || "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function createImageRotator({ images, alt = "Project preview", ariaLabel = "Project screenshots" } = {}) {
  const items = normalizeImageList(images);
  const root = el("div", "image-rotator");
  root.setAttribute("role", "group");
  root.setAttribute("aria-roledescription", "carousel");
  root.setAttribute("aria-label", ariaLabel);

  const viewport = el("div", "image-rotator__viewport");
  const img = document.createElement("img");
  img.className = "image-rotator__img";
  img.alt = String(alt || "").trim() || "Project preview";
  img.loading = "eager";
  img.decoding = "async";
  viewport.append(img);

  const footer = el("div", "image-rotator__footer");
  const counter = el("div", "image-rotator__counter");
  counter.hidden = true;
  const dots = el("div", "image-rotator__dots");
  footer.append(counter, dots);

  let index = 0;
  let dotButtons = [];
  let swapSeq = 0;
  let autoRotateTimer = null;
  let autoRotatePaused = false;
  const AUTO_ROTATE_MS = 3000;

  const clampIndex = (i) => {
    const n = items.length;
    if (n <= 0) return 0;
    const normalized = ((i % n) + n) % n;
    return normalized;
  };

  const setImageSrc = (src, { animate = false } = {}) => {
    const nextSrc = String(src || "").trim();
    if (!nextSrc) return;
    if (img.src && img.src === new URL(nextSrc, window.location.href).href) return;

    if (prefersReducedMotion() || !animate || typeof img.animate !== "function") {
      img.src = nextSrc;
      return;
    }

    swapSeq += 1;
    const seq = swapSeq;

    const fadeOut = img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-out" });
    fadeOut.onfinish = () => {
      if (seq !== swapSeq) return;
      img.src = nextSrc;
      const fadeIn = img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
      fadeIn.onfinish = () => {
        // no-op; keep stable opacity
      };
    };
  };

  const preloadNeighbors = () => {
    if (items.length <= 1) return;
    const nextIdx = clampIndex(index + 1);
    const prevIdx = clampIndex(index - 1);
    for (const i of [nextIdx, prevIdx]) {
      const src = items[i];
      if (!src) continue;
      const pre = new Image();
      pre.decoding = "async";
      pre.src = src;
    }
  };

  const render = ({ animate = false } = {}) => {
    if (items.length === 0) {
      root.dataset.hasImages = "false";
      img.removeAttribute("src");
      img.hidden = true;
      counter.textContent = "";
      dots.replaceChildren();
      return;
    }

    root.dataset.hasImages = "true";
    img.hidden = false;
    setImageSrc(items[index], { animate });
    img.loading = index === 0 ? "eager" : "lazy";
    counter.textContent = "";

    if (items.length > 1) {
      for (const [i, btn] of dotButtons.entries()) {
        btn.classList.toggle("is-active", i === index);
        btn.setAttribute("aria-current", i === index ? "true" : "false");
      }
    }

    preloadNeighbors();
  };

  const go = (next, { animate = true } = {}) => {
    if (items.length <= 1) return;
    index = clampIndex(next);
    render({ animate });
    scheduleAutoRotate();
  };

  const clearAutoRotate = () => {
    if (autoRotateTimer) window.clearTimeout(autoRotateTimer);
    autoRotateTimer = null;
  };

  const scheduleAutoRotate = () => {
    if (items.length <= 1) return;
    clearAutoRotate();
    if (autoRotatePaused) return;
    if (!root.isConnected) return;
    if (document.hidden) return;

    autoRotateTimer = window.setTimeout(() => {
      autoRotateTimer = null;
      if (!root.isConnected) return;
      if (autoRotatePaused) return;
      if (document.hidden) return;
      go(index + 1, { animate: true });
    }, AUTO_ROTATE_MS);
  };

  const setAutoRotatePaused = (paused) => {
    autoRotatePaused = Boolean(paused);
    if (autoRotatePaused) clearAutoRotate();
    else scheduleAutoRotate();
  };

  if (items.length > 1) {
    root.tabIndex = 0;

    dotButtons = items.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "image-rotator__dot";
      b.setAttribute("aria-label", `Show image ${i + 1} of ${items.length}`);
      b.addEventListener("click", () => go(i, { animate: true }));
      return b;
    });
    dots.append(...dotButtons);

    root.addEventListener("keydown", (e) => {
      if (!(e instanceof KeyboardEvent)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1, { animate: true });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1, { animate: true });
      }
    });

    root.addEventListener("pointerenter", () => setAutoRotatePaused(true));
    root.addEventListener("pointerleave", () => setAutoRotatePaused(false));
    root.addEventListener("focusin", () => setAutoRotatePaused(true));
    root.addEventListener("focusout", () => setAutoRotatePaused(false));

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) clearAutoRotate();
        else scheduleAutoRotate();
      },
      { passive: true },
    );
  } else {
    root.classList.add("image-rotator--single");
    footer.hidden = true;
  }

  root.append(viewport, footer);
  render({ animate: false });
  scheduleAutoRotate();
  return root;
}

function renderProjectDetail(project, { cardEl } = {}) {
  const section = document.getElementById("project-detail");
  const inner = document.getElementById("project-detail-inner");
  if (!(section instanceof HTMLElement)) return;
  if (!(inner instanceof HTMLElement)) return;

  if (!project) {
    section.hidden = true;
    inner.replaceChildren();
    return;
  }

  const projectNameForLabel = String(project?.name || "").trim();
  section.setAttribute("aria-label", projectNameForLabel ? `Project details for ${projectNameForLabel}` : "Project details");

  const bg = typeof project?.cardColor === "string" ? project.cardColor.trim() : "";
  const tone = normalizeTone(project, bg);
  section.style.setProperty("--project-detail-bg", bg || "#ffffff");
  section.classList.toggle("project-detail--tone-light", tone === "light");
  section.classList.toggle("project-detail--tone-dark", tone === "dark");
  if (typeof project?.id === "string" && project.id.trim()) {
    section.dataset.projectId = project.id.trim();
  } else {
    delete section.dataset.projectId;
  }

  // Chevron points to the selected card.
  if (cardEl instanceof HTMLElement) {
    section.dataset.projectCardId = cardEl.id || "";
    const cardRect = cardEl.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const x = cardRect.left + cardRect.width / 2 - sectionRect.left;
    section.style.setProperty("--project-detail-chevron-x", `${x.toFixed(1)}px`);
  }

  const header = el("div", "project-detail__header");
  const headerLeft = el("div", "project-detail__header-left");
  const titleText = String(project?.name || "").trim() || "Untitled";
  const title = el("h3", "project-detail__title", titleText);

  const meta = el("div", "project-detail__meta");
  const stateLabel = getProjectStateLabel(project);
  const statusKey = getProjectStatusKey(project);
  const badgeVariant =
    statusKey === "launched" || statusKey === "completed" ? "project-card__badge--green" : "project-card__badge--blue";
  const launch = formatMonthYear(project?.launchDate);
  meta.append(el("span", "project-detail__meta-item", launch || "TBD"));
  meta.append(el("div", `project-card__badge ${badgeVariant}`, stateLabel));

  headerLeft.append(meta, title);
  header.append(headerLeft);

  const body = elHTML("div", "project-detail__body", "<p class=\"muted\">Loading…</p>");

  const contentBox = el("div", "content");
  const layout = el("div", "project-detail__layout");
  const bodyCol = el("div", "project-detail__body-col");
  const descriptionText = String(project?.shortDescription || "").trim();
  const description = descriptionText ? el("p", "project-detail__description", descriptionText) : null;

  const media = el("div", "project-detail__media");

  const detailBg = typeof project?.cardColor === "string" ? project.cardColor.trim() : "";
  const imageFallbackBg = typeof project?.imageColor === "string" ? project.imageColor.trim() : "";
  const mediaBg = detailBg || imageFallbackBg;
  if (mediaBg) media.style.setProperty("--project-detail-media-bg", mediaBg);

  const projectName = String(project?.name || "").trim();
  const images = normalizeImageList(project?.detailImages);

  const alt = projectName ? `Screenshot of ${projectName}` : "Project screenshot";
  const ariaLabel = projectName ? `Screenshots for ${projectName}` : "Project screenshots";
  if (images.length > 0) {
    media.append(createImageRotator({ images, alt, ariaLabel }));
  } else {
    media.classList.add("project-detail__media--empty");
    media.append(el("div", "project-detail__media-placeholder", "No preview yet."));
  }

  layout.append(bodyCol, media);

  const cta = el("div", "project-detail__cta");

  const productHref = getPrimaryHref(project);
  if (productHref) {
    const a = document.createElement("a");
    a.className = "btn btn--action-primary";
    a.href = productHref;
    a.textContent = getPrimaryCtaLabel(project) || "Try Product";
    if (isExternalHref(productHref)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    cta.append(a);
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--action-primary";
    btn.textContent = "Join Waitlist";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.addEventListener("click", () => openWaitlistModal());
    cta.append(btn);
  }

  const videoHref = getVideoHref(project);
  if (videoHref) {
    const a = document.createElement("a");
    a.className = "btn btn--action";
    a.href = videoHref;
    a.textContent = "Watch Video";
    if (isExternalHref(videoHref)) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    cta.append(a);
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--action is-disabled";
    btn.disabled = true;
    btn.textContent = "Watch Video";
    cta.append(btn);
  }

  bodyCol.append(header);
  if (description) bodyCol.append(description);
  bodyCol.append(body, cta);

  contentBox.append(layout);

  inner.replaceChildren(contentBox);
  section.hidden = false;

  const projectId = typeof project?.id === "string" ? project.id.trim() : "";
  const detailHtml = typeof project?.detailHtml === "string" ? project.detailHtml.trim() : "";
  const detailMd = typeof project?.detailMd === "string" ? project.detailMd.trim() : "";
  const detailUrl = detailHtml || detailMd;
  if (!detailUrl) {
    body.innerHTML = "<p class=\"muted\">No details yet.</p>";
    return;
  }

  fetchTextCached(detailUrl)
    .then((text) => {
      // Avoid race conditions if the user clicks another card quickly.
      if (projectId && section.dataset.projectId && section.dataset.projectId !== projectId) return;
      const looksLikeHtmlFile = /\.html?(\?|#|$)/i.test(detailUrl);
      const shouldRenderAsHtml = Boolean(detailHtml) || looksLikeHtmlFile;
      body.innerHTML = shouldRenderAsHtml ? renderProjectHtml(text) : renderMarkdownToHtml(text);
    })
    .catch(() => {
      body.innerHTML = "<p class=\"muted\">Couldn’t load details right now.</p>";
    });
}

let projectDetailTrackingAttached = false;

function updateProjectDetailChevron() {
  const section = document.getElementById("project-detail");
  const track = document.getElementById("projects-list");
  if (!(section instanceof HTMLElement)) return;
  if (!(track instanceof HTMLElement)) return;
  if (section.hidden) return;

  const byId = () => {
    const cardId = String(section.dataset.projectCardId || "").trim();
    if (!cardId) return null;
    const node = document.getElementById(cardId);
    if (node instanceof HTMLElement && track.contains(node)) return node;
    return null;
  };

  const escapeCssValue = (value) => {
    const v = String(value || "");
    if (typeof window.CSS?.escape === "function") return window.CSS.escape(v);
    return v.replace(/["\\]/g, "\\$&");
  };

  const byProjectId = () => {
    const projectId = String(section.dataset.projectId || "").trim();
    if (!projectId) return null;
    const selector = `[data-project-id="${escapeCssValue(projectId)}"]`;
    const node = track.querySelector(selector);
    return node instanceof HTMLElement ? node : null;
  };

  const selected = byId() || byProjectId();
  if (!selected) return;

  const cardRect = selected.getBoundingClientRect();
  const sectionRect = section.getBoundingClientRect();
  const x = cardRect.left + cardRect.width / 2 - sectionRect.left;
  section.style.setProperty("--project-detail-chevron-x", `${x.toFixed(1)}px`);
}

function attachProjectDetailChevronTracking() {
  if (projectDetailTrackingAttached) return;
  projectDetailTrackingAttached = true;

  const track = document.getElementById("projects-list");
  if (track instanceof HTMLElement) {
    track.addEventListener("scroll", () => updateProjectDetailChevron(), { passive: true });
  }
  window.addEventListener("resize", () => updateProjectDetailChevron());
}

function scrollProjectDetailIntoView({ onlyIfNeeded = true, cardEl } = {}) {
  const section = document.getElementById("project-detail");
  if (!(section instanceof HTMLElement)) return;
  if (section.hidden) return;

  const behavior = prefersReducedMotion() ? "auto" : "smooth";

  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const cardRect = cardEl instanceof HTMLElement ? cardEl.getBoundingClientRect() : null;
  const cardPeekPxRaw = cardRect ? cardRect.height * 0.12 : 72;
  const cardPeekPx = Math.max(56, Math.min(96, cardPeekPxRaw));
  const desiredTop = vh > 0 ? Math.min(vh * 0.45, Math.max(72, cardPeekPx + 16)) : cardPeekPx + 16;

  if (onlyIfNeeded) {
    const rect = section.getBoundingClientRect();
    if (vh > 0) {
      const withinBand = rect.top >= desiredTop - 24 && rect.top <= desiredTop + 24;
      const mostlyBelowTop = rect.bottom > desiredTop + 32;
      if (withinBand && mostlyBelowTop) return;
    }
  }

  const rect = section.getBoundingClientRect();
  const currentY = window.scrollY || window.pageYOffset || 0;
  const targetY = Math.max(0, currentY + rect.top - desiredTop);
  window.scrollTo({ top: targetY, behavior });
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

  for (const [index, project] of sorted.entries()) {
    const cardEl = document.createElement("button");
    cardEl.type = "button";
    cardEl.className = "project-card project-card--selectable";
    cardEl.setAttribute("aria-label", project?.name ? `Show details for ${project.name}` : "Show project details");
    const projectId = typeof project?.id === "string" ? project.id.trim() : "";
    if (projectId) {
      cardEl.dataset.projectId = projectId;
      cardEl.id = `project-card-${projectId}`;
    }

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

    cardEl.addEventListener("click", () => {
      renderProjectDetail(project, { cardEl });
      updateProjectDetailChevron();
      window.requestAnimationFrame(() => scrollProjectDetailIntoView({ onlyIfNeeded: true, cardEl }));
    });

    target.append(cardEl);
    cards.push(cardEl);
  }

  registerAppearElements(cards);
  window.requestAnimationFrame(() => animateVisibleRegisteredInOrder());

  // Pre-open the first project on initial render so visitors immediately see a detail panel.
  // (We avoid scrolling; this simply sets the initial selected state + detail content.)
  const detailSection = document.getElementById("project-detail");
  const shouldAutoOpen = detailSection instanceof HTMLElement ? detailSection.hidden : true;
  const firstCard = cards[0];
  const firstProject = sorted[0];
  if (shouldAutoOpen && firstCard instanceof HTMLElement && firstProject) {
    renderProjectDetail(firstProject, { cardEl: firstCard });

    // The cards animate in, so re-measure after layout settles.
    window.requestAnimationFrame(() => updateProjectDetailChevron());
    if (!prefersReducedMotion()) {
      window.setTimeout(() => updateProjectDetailChevron(), 800);
    }
  }
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

  const getStep = () => {
    const first = track.querySelector(".project-card, .project-card__link");
    const rect = first instanceof HTMLElement ? first.getBoundingClientRect() : null;
    const style = window.getComputedStyle(track);
    const gap = Number.parseFloat(style.columnGap || style.gap || "0") || 0;
    const w = rect?.width || 360;
    return w + gap;
  };

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

  const getSnapPoints = () => {
    const items = getItems();
    if (items.length === 0) return [];
    const inset = getSnapInset();
    return items.map((el) => Math.max(0, el.offsetLeft - inset));
  };

  const getNearestSnapIndex = (x, points) => {
    // Find the closest snap point using midpoints between cards.
    let idx = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const mid = (points[i] + points[i + 1]) / 2;
      if (x >= mid) idx = i + 1;
      else break;
    }
    return idx;
  };

  const scrollByCards = (dir) => {
    const points = getSnapPoints();
    const behavior = prefersReducedMotion() ? "auto" : "smooth";

    if (points.length === 0) {
      track.scrollBy({ left: dir * getStep(), behavior });
      return;
    }

    const current = getNearestSnapIndex(track.scrollLeft, points);
    const nextIdx = Math.max(0, Math.min(points.length - 1, current + dir));
    const targetLeft = points[nextIdx] ?? 0;
    track.scrollTo({ left: targetLeft, behavior });
  };

  if (prev instanceof HTMLButtonElement) prev.addEventListener("click", () => scrollByCards(-1));
  if (next instanceof HTMLButtonElement) next.addEventListener("click", () => scrollByCards(1));

  track.addEventListener("keydown", (e) => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollByCards(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollByCards(1);
    }
  });
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
    attachProjectDetailChevronTracking();
  } catch (err) {
    target.replaceChildren();
    target.setAttribute("aria-busy", "false");
    target.append(el("p", "muted", "Couldn’t load projects right now."));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  detectFlexGapSupport();
  updateViewportCssVars();
  initAppearAnimations();
  initStartupsMarquee();
  initProjectsSliderControls();
  loadProjects();
  initWaitlistModal();
  initIdeaForm();
  initImprintToggle();
  initDataPolicyToggle();
  initPolicyDeepLinks();
});

let viewportVarsRaf = 0;
window.addEventListener(
  "resize",
  () => {
    if (viewportVarsRaf) window.cancelAnimationFrame(viewportVarsRaf);
    viewportVarsRaf = window.requestAnimationFrame(() => {
      viewportVarsRaf = 0;
      updateViewportCssVars();
    });
  },
  { passive: true },
);

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
    el.style.transform = "";
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
        // Clear inline transform so CSS hover/selected transforms can apply.
        $el.css({ transform: "", opacity: "1", willChange: "" });
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
      el.style.transform = "";
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
        ".profile__early-access",
        ".profile__early-access-note",
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
