(async () => {
  const yearEl = document.getElementById("js-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const initDiscontinuedModal = () => {
    const modal = document.querySelector("[data-discontinued-modal]");
    if (!(modal instanceof HTMLElement)) return;

    const triggers = Array.from(document.querySelectorAll("[data-discontinued-trigger]"));
    const closeEls = Array.from(document.querySelectorAll("[data-discontinued-close]"));
    const dialog = modal.querySelector(".discontinuedModal__dialog");
    let lastTrigger = null;

    const open = (trigger) => {
      lastTrigger = trigger instanceof HTMLElement ? trigger : null;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");

      const firstClose = modal.querySelector("[data-discontinued-close]");
      if (firstClose instanceof HTMLElement) firstClose.focus();
    };

    const close = () => {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      if (lastTrigger instanceof HTMLElement) lastTrigger.focus();
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        open(trigger);
      });
    });

    closeEls.forEach((button) => {
      button.addEventListener("click", close);
    });

    modal.addEventListener("click", (event) => {
      if (dialog instanceof HTMLElement && !dialog.contains(event.target)) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("is-open")) close();
    });
  };

  // --- Teaser collage images (preset manifest) ---
  // Prefers: ./assets/presets/manifest.json
  // Fallback: ./assets/teaser/manifest.json (placeholders)
  const loadImageManifest = async (url) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const images = Array.isArray(data?.images) ? data.images.filter(Boolean) : [];
      return images.filter((p) => typeof p === "string" && p.trim()).map((p) => p.trim());
    } catch {
      return [];
    }
  };

  const canLoadImage = (url, timeoutMs = 6000) =>
    new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // Prevent late handlers from firing after resolve.
        img.onload = null;
        img.onerror = null;
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      img.src = url;
    });

  const shuffleInPlace = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const filterLoadableImages = async (images, maxChecks = 20) => {
    const pool = shuffleInPlace(images.slice());
    const checked = pool.slice(0, Math.max(1, Math.min(pool.length, maxChecks)));
    const results = await Promise.all(checked.map((p) => canLoadImage(p)));
    return checked.filter((p, i) => results[i]);
  };

  const pickRandomUnique = (pool, count) => {
    const unique = Array.from(new Set((Array.isArray(pool) ? pool : []).filter(Boolean)));
    shuffleInPlace(unique);
    return unique.slice(0, Math.max(0, Math.min(unique.length, Math.floor(count || 0))));
  };

  const pickLoadableImages = async (pool, desiredCount = 5, maxChecks = 40) => {
    const list = shuffleInPlace(Array.from(new Set((Array.isArray(pool) ? pool : []).filter(Boolean))));
    const desired = Math.max(0, Math.floor(desiredCount || 0));
    const limit = Math.max(0, Math.floor(maxChecks || 0));
    const out = [];
    for (let i = 0; i < list.length && i < limit && out.length < desired; i++) {
      const url = list[i];
      if (!url) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await canLoadImage(url)) out.push(url);
    }
    return out;
  };

  const loadPresetsJson = async (url) => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const presets = Array.isArray(data?.presets) ? data.presets.filter(Boolean) : [];
      return presets.filter((p) => typeof p?.id === "string" && p.id.trim());
    } catch {
      return [];
    }
  };

  const FIXED_PRESET_IDS = {
    teaser: [
      "preset_desert_confident_portrait",
      "preset_private_jet_candid",
      "preset_studio_black_white_portrait",
      "preset_guitar_stage_moody",
    ],
    dating: [
      "preset_tropical_water_portrait",
      "preset_private_jet_candid",
      "preset_desert_confident_portrait",
      "preset_greenhouse_casual_smile",
    ],
    social: ["preset_travel_doorway_portrait", "preset_guitar_stage_moody", "preset_sunny_fitness_low_angle"],
    personalBrand: [
      "preset_studio_black_white_portrait",
      "preset_conference_speaker_stage",
      "preset_cafe_relaxed_moment",
    ],
  };

  const presetUrlFromId = (id) => {
    const s = String(id || "").trim();
    return s ? `./assets/presets/${s}.jpg` : "";
  };

  const fixedUrls = (key) => {
    const ids = FIXED_PRESET_IDS?.[key];
    const list = (Array.isArray(ids) ? ids : []).map(presetUrlFromId).filter(Boolean);
    return list;
  };

  const presetIdFromUrl = (url) => {
    const s = String(url || "");
    const m = s.match(/(?:^|\/)assets\/presets\/(preset_[^\/]+)\.(png|webp|jpg|jpeg)$/i);
    return m ? m[1] : "";
  };

  const initStyleShowcaseFromPresets = (presetsInput) => {
    const grid = document.querySelector("[data-styles-grid]");
    const filtersRoot = document.querySelector("[data-style-filters]");
    if (!grid || !filtersRoot) return;

    const fallbackUrl = "./assets/teaser/02.svg";
    const presets = Array.isArray(presetsInput) ? presetsInput : [];

    // Deduplicate by id (presets.json may contain duplicates).
    const byId = new Map();
    for (const p of presets) {
      const id = String(p?.id || "").trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, p);
    }
    const uniquePresets = Array.from(byId.values());

    const getCategoryKey = (p) =>
      String(p?.options?.backgroundType || "other")
        .trim()
        .toLowerCase() || "other";

    const humanize = (s) =>
      String(s || "")
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

    const categoryOrder = ["studio", "travel", "nature", "city", "home", "office", "cafe", "gym", "other"];

    const categoriesSet = new Set(uniquePresets.map(getCategoryKey));
    const categories = ["popular"].concat(
      Array.from(categoriesSet)
        .filter((c) => c && c !== "all")
        .sort((a, b) => {
          const ia = categoryOrder.indexOf(a);
          const ib = categoryOrder.indexOf(b);
          if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          return a.localeCompare(b);
        })
    );

    const buildTags = (p) => {
      const tags = [];
      const bg = p?.options?.backgroundType ? humanize(p.options.backgroundType) : "";
      const tod = p?.options?.timeOfDay ? humanize(p.options.timeOfDay) : "";
      const outfit = p?.options?.outfitType ? humanize(p.options.outfitType) : "";
      if (bg) tags.push(bg);
      if (tod) tags.push(tod);
      if (outfit) tags.push(outfit);
      return tags.length ? tags : ["Preset"];
    };

    const createTag = (label) => {
      const li = document.createElement("li");
      li.className = "styleCard__tag";
      li.textContent = label;
      return li;
    };

    const createCard = (preset) => {
      const id = String(preset?.id || "").trim();
      const title = String(preset?.title || "").trim() || humanize(id.replace(/^preset_/, ""));
      const desc =
        String(preset?.description || "").trim() ||
        "A distinct mood and background you can try instantly from the same upload.";

      const card = document.createElement("article");
      card.className = "styleCard";
      card.setAttribute("role", "listitem");

      const media = document.createElement("div");
      media.className = "styleCard__media";

      const img = document.createElement("img");
      img.className = "styleCard__img";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = `Preset example: ${title}`;
      img.onerror = () => {
        img.onerror = null;
        img.src = fallbackUrl;
      };
      // Convention: preset image file uses preset id.
      img.src = id ? `./assets/presets/${id}.jpg` : fallbackUrl;
      media.appendChild(img);

      const body = document.createElement("div");
      body.className = "styleCard__body";

      const h = document.createElement("h3");
      h.className = "styleCard__title";
      h.textContent = title;

      const p = document.createElement("p");
      p.className = "styleCard__desc";
      p.textContent = desc;

      const ul = document.createElement("ul");
      ul.className = "styleCard__tags";
      ul.setAttribute("aria-label", "Tags");
      for (const t of buildTags(preset).slice(0, 3)) ul.appendChild(createTag(t));

      body.appendChild(h);
      body.appendChild(p);
      body.appendChild(ul);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    };

    const popularPresets = uniquePresets.slice(0, 9);
    let activeCategory = "popular";

    const renderGrid = () => {
      const list =
        activeCategory === "popular"
          ? popularPresets
          : uniquePresets.filter((p) => getCategoryKey(p) === activeCategory);

      grid.innerHTML = "";
      for (const p of list) grid.appendChild(createCard(p));
    };

    const setActiveButton = (categoryKey) => {
      const buttons = Array.from(filtersRoot.querySelectorAll("button.styles__filterBtn[data-category]"));
      for (const btn of buttons) {
        const isActive = btn.getAttribute("data-category") === categoryKey;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    };

    const renderButtons = () => {
      filtersRoot.innerHTML = "";
      for (const key of categories) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "styles__filterBtn";
        btn.setAttribute("data-category", key);
        btn.setAttribute("aria-pressed", key === activeCategory ? "true" : "false");
        btn.textContent = key === "popular" ? "Most popular" : humanize(key);
        btn.addEventListener("click", () => {
          activeCategory = key;
          setActiveButton(activeCategory);
          renderGrid();
        });
        filtersRoot.appendChild(btn);
      }
      setActiveButton(activeCategory);
    };

    renderButtons();
    renderGrid();
  };

  const initTeaserColumns = (imagePool) => {
    const colsRoot = document.querySelector(".teaser__cols[data-teaser-cols]");
    if (!colsRoot) return;

    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const fallbackUrl = "./assets/teaser/02.svg";
    const safePool = Array.isArray(imagePool) && imagePool.length ? imagePool : [fallbackUrl];

    const pickRandom = (avoid = []) => {
      if (safePool.length === 1) return safePool[0];
      for (let i = 0; i < 8; i++) {
        const next = safePool[Math.floor(Math.random() * safePool.length)];
        if (!avoid.includes(next)) return next;
      }
      return safePool[Math.floor(Math.random() * safePool.length)];
    };

    const createTile = (src) => {
      const img = document.createElement("img");
      img.className = "teaser__tile";
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.onerror = null;
        img.src = fallbackUrl;
      };
      img.src = src;
      return img;
    };

    const getSpeed = (colEl) => {
      const raw = getComputedStyle(colEl).getPropertyValue("--teaser-speed").trim();
      const v = parseFloat(raw);
      return Number.isFinite(v) && v > 0 ? v : 18;
    };

    const getOffset = (colEl) => {
      const raw = getComputedStyle(colEl).getPropertyValue("--teaser-offset").trim();
      const v = parseFloat(raw);
      return Number.isFinite(v) ? v : 0;
    };

    const getGapPx = (stackEl) => {
      const cs = getComputedStyle(stackEl);
      const g = cs.rowGap || cs.gap || "0px";
      const px = parseFloat(g);
      return Number.isFinite(px) ? px : 0;
    };

    const ensureFilled = (state) => {
      const { stack, viewport } = state;
      // Keep enough content so we never show empty space.
      const target = viewport.clientHeight + Math.max(0, -state.y) + viewport.clientHeight * 1.25;
      const avoid = state.recent.slice(-3);
      while (stack.scrollHeight < target) {
        const next = pickRandom(avoid);
        stack.appendChild(createTile(next));
        state.recent.push(next);
        if (state.recent.length > 10) state.recent = state.recent.slice(-10);
      }
    };

    const desiredColumnCount = () => {
      // Requirements:
      // - iPhone: 3 cols
      // - 4K screens: 8 cols
      // Use a reasonable min column width and clamp [3..8].
      const w = colsRoot.clientWidth || window.innerWidth || 0;
      const minColW = 240; // px
      const guess = Math.floor(w / minColW);
      return Math.max(3, Math.min(8, guess || 3));
    };

    const buildColumns = (count) => {
      colsRoot.style.setProperty("--teaser-cols", String(count));
      colsRoot.innerHTML = "";

      for (let i = 0; i < count; i++) {
        const col = document.createElement("div");
        col.className = "teaser__col";

        // Different upward speeds (px/s) and random start offsets (px).
        const speed = 16 + (i % 5) * 2 + Math.random() * 3;
        const offset = 60 + Math.random() * 520;
        col.style.setProperty("--teaser-speed", String(speed.toFixed(2)));
        col.style.setProperty("--teaser-offset", String(offset.toFixed(0)));

        const stack = document.createElement("div");
        stack.className = "teaser__colStack";
        stack.setAttribute("data-teaser-col", String(i));

        // Seed a few initial tiles so layout is stable while we fill.
        for (let k = 0; k < 4; k++) {
          stack.appendChild(createTile(pickRandom()));
        }

        col.appendChild(stack);
        colsRoot.appendChild(col);
      }
    };

    let rafId = 0;
    let currentCols = 0;
    let states = [];
    let lastT = performance.now();
    let resizeTimer = 0;

    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    const start = () => {
      stop();
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    };

    const rebuild = () => {
      const nextCols = desiredColumnCount();
      if (nextCols !== currentCols) {
        currentCols = nextCols;
        buildColumns(currentCols);
      }

      const stacks = Array.from(colsRoot.querySelectorAll(".teaser__colStack[data-teaser-col]"));
      states = stacks.map((stack) => {
        const colEl = stack.closest(".teaser__col");
        return {
          colEl,
          viewport: colEl,
          stack,
          y: -getOffset(colEl),
          speed: getSpeed(colEl), // px / second
          gapPx: getGapPx(stack),
          recent: [],
        };
      });

      for (const s of states) {
        // Capture current sources as "recent" to reduce duplicates.
        const existing = Array.from(s.stack.querySelectorAll("img.teaser__tile"));
        s.recent = existing.map((img) => img.currentSrc || img.src).filter(Boolean).slice(-10);
        ensureFilled(s);
        s.stack.style.transform = `translateY(${s.y}px)`;
      }

      if (!prefersReducedMotion) start();
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuild, 120);
    };

    const tick = (t) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;

      for (const s of states) {
        s.y -= s.speed * dt;
        s.stack.style.transform = `translateY(${s.y}px)`;

        // When the first tile fully leaves the viewport, remove it and append a new one.
        // Adjust y so the scroll is continuous (no visible reset).
        let first = s.stack.firstElementChild;
        while (first) {
          const h = first.offsetHeight || first.getBoundingClientRect().height;
          const step = h + s.gapPx;
          if (-s.y < step) break;

          s.y += step;
          s.stack.style.transform = `translateY(${s.y}px)`;
          s.stack.removeChild(first);

          const next = pickRandom(s.recent.slice(-3));
          s.stack.appendChild(createTile(next));
          s.recent.push(next);
          if (s.recent.length > 10) s.recent = s.recent.slice(-10);

          first = s.stack.firstElementChild;
        }

        ensureFilled(s);
      }

      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener("resize", onResize, { passive: true });
    rebuild();
  };

  const applyTeaserManifest = async () => {
    try {
      // Use the full presets image manifest for the teaser background grid.
      // Fallback order:
      // - presets image manifest (all preset images)
      // - presets.json (all presets, mapped to images)
      // - fixed ids (small curated set)
      // - SVG placeholders
      let images = await loadImageManifest("./assets/presets/manifest.json");
      let presets = [];

      if (!images.length) {
        presets = await loadPresetsJson("./assets/presets/presets.json");
        images = presets.map((p) => presetUrlFromId(p?.id)).filter(Boolean);
      }

      if (!images.length) images = fixedUrls("teaser");

      // De-dupe while preserving order.
      if (images.length) images = Array.from(new Set(images));

      // Best-effort: if nothing from the pool can be loaded, fall back to SVG placeholders.
      if (images.length) {
        const anyLoadable = await filterLoadableImages(images, 8);
        if (!anyLoadable.length) images = [];
      }

      if (!images.length) images = ["./assets/teaser/01.svg", "./assets/teaser/02.svg", "./assets/teaser/03.svg"];

      initTeaserColumns(images);

      // Also hydrate the teaser "After" demo.
      // Requirement: loop of 5 randomly selected pictures from the male presets.
      const randomTargets = Array.from(document.querySelectorAll("img[data-random-preset='true']"));
      const backA = document.querySelector("img[data-teaser-demo-back-a]");
      const backB = document.querySelector("img[data-teaser-demo-back-b]");

      if (!presets.length) presets = await loadPresetsJson("./assets/presets/presets.json");

      // Deduplicate by id (presets.json may contain duplicates).
      const byId = new Map();
      for (const p of presets) {
        const id = String(p?.id || "").trim();
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, p);
      }
      const uniquePresets = Array.from(byId.values());

      const malePresetUrls = uniquePresets
        .filter((p) => String(p?.gender || "").trim().toLowerCase() === "male")
        .map((p) => presetUrlFromId(p?.id))
        .filter(Boolean);

      // Prefer loadable male preset images; fall back gracefully.
      let loopImages = await pickLoadableImages(malePresetUrls, 5, 60);
      if (loopImages.length < 5) loopImages = pickRandomUnique(malePresetUrls, 5);
      if (loopImages.length < 2) loopImages = fixedUrls("teaser");
      if (loopImages.length < 2) loopImages = images;
      if (loopImages.length > 5) loopImages = loopImages.slice(0, 5);

      const fallbackUrl = "./assets/teaser/02.svg";
      const setSrcSafe = (img, src) => {
        if (!img || !src) return;
        img.onerror = () => {
          img.onerror = null;
          img.src = fallbackUrl;
        };
        img.src = src;
      };

      for (let i = 0; i < randomTargets.length; i++) setSrcSafe(randomTargets[i], loopImages[i % loopImages.length]);
      // Keep the visible back stack varied too.
      if (loopImages.length) {
        setSrcSafe(backA, loopImages[1] || loopImages[0]);
        setSrcSafe(backB, loopImages[2] || loopImages[0]);
      }
    } catch {
      // Ignore manifest errors; placeholders remain.
    }
  };

  const applyStylePresets = async () => {
    const presets = await loadPresetsJson("./assets/presets/presets.json");
    if (presets.length) {
      initStyleShowcaseFromPresets(presets);
      return;
    }
    // Fallback: keep section non-empty if presets.json can't load.
    initStyleShowcaseFromPresets([
      {
        id: "",
        title: "Preset library",
        description: "Add presets to `assets/presets/presets.json` to see them here.",
        options: { backgroundType: "other" },
      },
    ]);
  };

  const initDatingSlider = (root, images) => {
    const imgCurrent = root.querySelector("[data-dating-current]");
    const imgNext = root.querySelector("[data-dating-next]");
    if (!imgCurrent || !imgNext) return;

    const pool = Array.isArray(images) ? images.filter(Boolean) : [];
    if (pool.length < 2) return;

    let currentIdx = 0;
    let nextIdx = 1;

    const setSrcSafe = (img, src) => {
      if (!src) return;
      img.onerror = () => {
        img.onerror = null;
        // If a preset image fails to load, keep whatever is currently showing.
      };
      img.src = src;
    };

    setSrcSafe(imgCurrent, pool[currentIdx]);
    setSrcSafe(imgNext, pool[nextIdx]);

    let dragging = false;
    let animating = false;
    let startX = 0;
    let startOffset = 0;
    let offset = 0;
    const AUTOPLAY_MS = 3000;

    const widthPx = () => Math.max(1, root.getBoundingClientRect().width || 1);
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

    const setOffset = (px) => {
      offset = clamp(px, 0, widthPx());
      imgCurrent.style.transform = `translateX(${offset}px)`;
    };

    const setAnimating = (on) => {
      animating = on;
      root.classList.toggle("is-animating", on);
    };

    const setDragging = (on) => {
      dragging = on;
      root.classList.toggle("is-dragging", on);
    };

    const advance = () => {
      if (animating) return;
      setAnimating(true);
      setOffset(widthPx());

      let finished = false;
      let fallbackTimer = 0;

      const onDone = () => {
        if (finished) return;
        finished = true;
        if (fallbackTimer) window.clearTimeout(fallbackTimer);

        // Promote next -> current.
        currentIdx = nextIdx;
        nextIdx = (nextIdx + 1) % pool.length;

        setAnimating(false);
        // Snap back without transition.
        imgCurrent.style.transform = "translateX(0px)";
        setSrcSafe(imgCurrent, pool[currentIdx]);
        setSrcSafe(imgNext, pool[nextIdx]);
        offset = 0;
      };

      imgCurrent.addEventListener("transitionend", onDone, { once: true });
      // Fallback in case transitionend doesn't fire (e.g. background tab).
      fallbackTimer = window.setTimeout(onDone, 320);
    };

    const revert = () => {
      if (animating) return;
      setAnimating(true);
      setOffset(0);
      imgCurrent.addEventListener(
        "transitionend",
        () => {
          setAnimating(false);
        },
        { once: true }
      );
    };

    root.addEventListener("pointerdown", (e) => {
      if (animating) return;
      // Only primary button for mouse; pointerType touch/pen is fine.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      setDragging(true);
      startX = e.clientX;
      startOffset = offset;
      root.setPointerCapture?.(e.pointerId);
    });

    root.addEventListener("pointermove", (e) => {
      if (!dragging || animating) return;
      const dx = e.clientX - startX;
      // Only allow left->right reveal.
      setOffset(startOffset + Math.max(0, dx));
    });

    const endDrag = () => {
      if (!dragging) return;
      setDragging(false);
      const w = widthPx();
      const threshold = w * 0.35;
      if (offset >= threshold) advance();
      else revert();
    };

    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
    root.addEventListener("lostpointercapture", endDrag);

    // Autoplay: slide to next picture every 3 seconds.
    const intervalId = window.setInterval(() => {
      if (dragging || animating) return;
      advance();
    }, AUTOPLAY_MS);

    // Cleanup if the element is removed (best-effort).
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        window.clearInterval(intervalId);
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  };

  const applyDatingSlider = async () => {
    const root = document.querySelector("[data-dating-slider]");
    if (!root) return;

    let images = fixedUrls("dating");
    if (images.length) images = await filterLoadableImages(images, 8);
    if (images.length < 2) return;
    initDatingSlider(root, images);
  };

  const applyBrandGallery = async () => {
    const root = document.querySelector("[data-brand-gallery]");
    if (!root) return;

    const imgEls = Array.from(root.querySelectorAll("img[data-brand-img]"));
    if (!imgEls.length) return;

    let pool = fixedUrls("personalBrand");
    if (pool.length) pool = await filterLoadableImages(pool, 8);
    if (!pool.length) return;

    for (let i = 0; i < imgEls.length; i++) {
      const img = imgEls[i];
      const src = pool[i % pool.length];
      if (!src) continue;
      img.onerror = () => {
        img.onerror = null;
        img.src = "./assets/teaser/02.svg";
      };
      img.src = src;
    }
  };

  const initTeaserDemoStackRotator = () => {
    const root = document.querySelector("[data-teaser-demo-stack]");
    const track = root?.querySelector("[data-teaser-demo-track]");
    if (!root || !track) return;

    const slides = () => Array.from(track.children).filter((el) => el && el.nodeType === 1);
    if (slides().length < 2) return;

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (prefersReducedMotion) return;

    const ROTATE_EVERY_MS = 2600;
    const SLIDE_MS = 650;
    let intervalId = 0;
    let animating = false;

    const stop = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = 0;
    };

    const rotateOnce = () => {
      if (document.hidden) return;
      if (animating) return;
      const s = slides();
      if (s.length < 2) return;

      const first = s[0];
      const second = s[1];
      if (!first || !second) return;

      animating = true;

      // Slide left so the "next" image comes in from the right.
      track.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      track.style.transform = "translate3d(-100%, 0, 0)";

      const onEnd = (e) => {
        if (e?.target !== track) return;
        track.removeEventListener("transitionend", onEnd);

        // Reorder slides without animation.
        track.style.transition = "none";
        track.appendChild(first);
        track.style.transform = "translate3d(0%, 0, 0)";
        // Force reflow so next animation always triggers.
        track.getBoundingClientRect();
        track.style.transition = "";

        animating = false;
      };

      track.addEventListener("transitionend", onEnd, { once: false });
    };

    const start = () => {
      stop();
      intervalId = window.setInterval(() => rotateOnce(), ROTATE_EVERY_MS);
    };

    const hasIO = typeof IntersectionObserver !== "undefined";
    const io = hasIO
      ? new IntersectionObserver(
          (entries) => {
            const on = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25);
            if (on) start();
            else stop();
          },
          { threshold: [0, 0.25, 0.5, 1] }
        )
      : null;

    if (io) io.observe(root);
    else start();

    track.style.transform = "translate3d(0%, 0, 0)";

    // Best-effort cleanup if removed.
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        stop();
        io?.disconnect();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  };

  const applyIgAutoScroll = async () => {
    const feed = document.querySelector("[data-ig-feed]");
    if (!feed) return;

    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    if (prefersReducedMotion) return;

    const templatePost = feed.querySelector(".igMock__post");
    if (!templatePost) return;

    const setSrcSafe = (img, src) => {
      if (!img || !src) return;
      img.onerror = () => {
        img.onerror = null;
        img.src = "./assets/teaser/02.svg";
      };
      img.src = src;
    };

    const pickRandom = (pool, avoid = []) => {
      const list = (Array.isArray(pool) ? pool : []).filter(Boolean);
      if (!list.length) return "";
      const avoidSet = new Set((Array.isArray(avoid) ? avoid : []).filter(Boolean));
      const filtered = list.filter((p) => !avoidSet.has(p));
      const pickFrom = filtered.length ? filtered : list;
      return pickFrom[Math.floor(Math.random() * pickFrom.length)] || "";
    };

    // Build an image pool.
    let images = fixedUrls("social");
    if (images.length) images = await filterLoadableImages(images, 8);
    if (!images.length) images = ["./assets/teaser/01.svg", "./assets/teaser/02.svg", "./assets/teaser/03.svg"];

    const users = [
      { u: "epicphotoai", a: "E", sub: "Featured preset", cap: "Same upload, new vibe. #preset #portrait" },
      { u: "benjamin", a: "B", sub: "New post", cap: "Fresh set for my next carousel. #creator" },
      { u: "mila", a: "M", sub: "Weekend drop", cap: "New look, same me. #explore" },
      { u: "jules", a: "J", sub: "Photo dump", cap: "Posting again because why not. #grid" },
      { u: "kai", a: "K", sub: "Today", cap: "Lighting was too good not to post. #vibes" },
      { u: "sara", a: "S", sub: "Just now", cap: "Trying a new preset. Thoughts? #creator" },
    ];

    const formatLikes = () => {
      const base = 1200 + Math.floor(Math.random() * 9200);
      return base.toLocaleString();
    };

    const formatTime = () => {
      const options = ["JUST NOW", "5 MIN AGO", "1 HOUR AGO", "2 HOURS AGO", "YESTERDAY"];
      return options[Math.floor(Math.random() * options.length)] || "JUST NOW";
    };

    const recent = [];

    const hydrateExisting = () => {
      const imgs = Array.from(feed.querySelectorAll("img.igMock__postImg"));
      for (const img of imgs) {
        const next = pickRandom(images, recent.slice(-3));
        if (next) setSrcSafe(img, next);
        recent.push(next);
        if (recent.length > 12) recent.splice(0, recent.length - 12);
      }
    };

    const createPost = () => {
      const node = templatePost.cloneNode(true);

      const who = users[Math.floor(Math.random() * users.length)] || users[0];
      const avatar = node.querySelector(".igMock__postAvatar");
      const userEl = node.querySelector(".igMock__postUser");
      const subEl = node.querySelector(".igMock__postSub");
      const likesEl = node.querySelector(".igMock__likes strong");
      const capStrong = node.querySelector(".igMock__caption strong");
      const capText = node.querySelector(".igMock__caption");
      const timeEl = node.querySelector(".igMock__time");
      const img = node.querySelector("img.igMock__postImg");

      if (avatar) avatar.textContent = who.a;
      if (userEl) userEl.textContent = who.u;
      if (subEl) subEl.textContent = who.sub;
      if (likesEl) likesEl.textContent = `${formatLikes()} likes`;
      if (capStrong) capStrong.textContent = who.u;
      if (capText && capStrong) {
        // Keep <strong>username</strong> and replace the tail text.
        const tail = document.createTextNode(` ${who.cap}`);
        // Remove everything after the strong node.
        while (capStrong.nextSibling) capStrong.parentNode.removeChild(capStrong.nextSibling);
        capStrong.parentNode.appendChild(tail);
      }
      if (timeEl) timeEl.textContent = formatTime();

      const next = pickRandom(images, recent.slice(-3));
      if (img && next) setSrcSafe(img, next);
      recent.push(next);
      if (recent.length > 12) recent.splice(0, recent.length - 12);

      return node;
    };

    const ensureMinPosts = (minCount = 6) => {
      const posts = feed.querySelectorAll(".igMock__post");
      const missing = Math.max(0, minCount - posts.length);
      for (let i = 0; i < missing; i++) feed.appendChild(createPost());
    };

    const pruneOldPosts = (maxCount = 10) => {
      const posts = Array.from(feed.querySelectorAll(".igMock__post"));
      while (posts.length > maxCount) {
        const first = posts.shift();
        if (!first) break;
        const h = first.offsetHeight || first.getBoundingClientRect().height || 0;
        first.remove();
        // Keep scroll position visually stable after removing from top.
        feed.scrollTop = Math.max(0, feed.scrollTop - h);
      }
    };

    const stepScroll = () => {
      // Append next random picture and scroll down to it.
      const nextPost = createPost();
      feed.appendChild(nextPost);

      // Scroll so the new post becomes visible (smooth).
      const top = nextPost.offsetTop;
      feed.scrollTo({ top, behavior: "smooth" });

      pruneOldPosts(10);
    };

    hydrateExisting();
    ensureMinPosts(6);

    // Only animate while the mock is in view.
    const root = feed.closest(".phoneMock--ig") || feed;
    let intervalId = 0;

    const stop = () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = 0;
    };

    const start = () => {
      stop();
      intervalId = window.setInterval(stepScroll, 3000);
    };

    const hasIO = typeof IntersectionObserver !== "undefined";
    const io = hasIO
      ? new IntersectionObserver(
          (entries) => {
            const on = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25);
            if (on) start();
            else stop();
          },
          { threshold: [0, 0.25, 0.5, 1] }
        )
      : null;

    if (io) io.observe(root);
    else start();

    // Best-effort cleanup if removed.
    const mo = new MutationObserver(() => {
      if (!document.body.contains(root)) {
        stop();
        io?.disconnect();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  };

  initDiscontinuedModal();
  await applyTeaserManifest();
  await applyStylePresets();
  await applyDatingSlider();
  await applyBrandGallery();
  initTeaserDemoStackRotator();
  await applyIgAutoScroll();
})();

