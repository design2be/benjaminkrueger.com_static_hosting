if (typeof Chart !== "undefined") {
  Chart.defaults.font.family = "'Manrope', system-ui, sans-serif";
  // Ensure consistent line thickness across all charts.
  Chart.defaults.elements.line.borderWidth = 2;
  Chart.defaults.datasets.line.borderWidth = 2;
}

// All backend calls go to the deployed API host. The page itself is served from
// a different origin (e.g. benjaminkrueger.com), so paths must be absolute and
// requests must use credentials: "include" for the session cookie to ride along.
// CORS for this origin is configured on the server (see server/main.py).
const API_BASE = "https://api.backtestai.benjaminkrueger.com";

let chartInstance = null;
let backtestInFlight = false;

/** Selected window for API: 1m | 1y | 2y | 5y (matches server LOOKBACK_BY_KEY). */
let selectedLookback = "1y";
/** Selected Binance spot symbol, e.g. BTCUSDT. */
let selectedSymbol = "BTCUSDT";
/** True after a successful backtest/demo/rerun so timeframe clicks refetch without Gemini. */
let canRerunBacktest = false;
/** User-entered strategy text shown with the current results. */
let lastStrategyDescription = "";

let assetChoices = [
  { symbol: "BTCUSDT", name: "Bitcoin / TetherUS", icon: "btc", iconText: "₿" },
  { symbol: "ETHUSDT", name: "Ethereum / TetherUS", icon: "eth", iconText: "Ξ" },
  { symbol: "SOLUSDT", name: "Solana / TetherUS", icon: "sol", iconText: "S" },
  { symbol: "BNBUSDT", name: "BNB / TetherUS", icon: "bnb", iconText: "B" },
  { symbol: "XRPUSDT", name: "XRP / TetherUS", icon: "xrp", iconText: "X" },
  { symbol: "ADAUSDT", name: "Cardano / TetherUS", icon: "ada", iconText: "A" },
  { symbol: "DOGEUSDT", name: "Dogecoin / TetherUS", icon: "doge", iconText: "D" },
  { symbol: "AVAXUSDT", name: "Avalanche / TetherUS", icon: "avax", iconText: "V" },
  { symbol: "LINKUSDT", name: "Chainlink / TetherUS", icon: "link", iconText: "L" },
  { symbol: "SUIUSDT", name: "Sui / TetherUS", icon: "sui", iconText: "S" },
];

async function loadAssetsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/assets`, { credentials: "include" });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || typeof data !== "object") return;
    const rows = Array.isArray(data.assets) ? data.assets : [];
    const cleaned = rows
      .map((r) => {
        const sym = r && typeof r.symbol === "string" ? r.symbol.trim().toUpperCase() : "";
        const name = r && typeof r.name === "string" ? r.name.trim() : "";
        if (!/^[A-Z0-9]{3,20}USDT$/.test(sym)) return null;
        return { symbol: sym, name: name || sym, icon: "", iconText: "$" };
      })
      .filter(Boolean);
    if (cleaned.length >= 10) {
      // Keep BTC/ETH/SOL icons at top if present, then append the rest.
      const pinned = new Map(assetChoices.map((c) => [c.symbol, c]));
      const merged = [];
      cleaned.forEach((c) => {
        merged.push(pinned.get(c.symbol) || c);
      });
      assetChoices = merged;
    }
  } catch (_) {
    // Non-fatal: selector falls back to built-in curated list.
  }
}

function normalizeSymbol(raw) {
  const s = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!s) return "BTCUSDT";
  // Binance spot symbols are uppercase and typically have no punctuation; we enforce a small safe subset.
  if (!/^[A-Z0-9]{3,20}USDT$/.test(s)) return "BTCUSDT";
  return s;
}

function setSelectedSymbol(sym) {
  selectedSymbol = normalizeSymbol(sym);
  const label = document.getElementById("asset-pill-label");
  if (label) label.textContent = selectedSymbol;
}

function initAssetSelector() {
  const btn = document.getElementById("asset-btn");
  const pop = document.getElementById("asset-popover");
  const list = document.getElementById("asset-list");
  const empty = document.getElementById("asset-empty");
  const search = document.getElementById("asset-search");
  if (!btn || !pop || !list || !empty || !search) return;

  const iconEl = btn.querySelector(".asset-pill__icon");

  function openPopover() {
    if (backtestInFlight) return;
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    search.value = "";
    renderList("");
    // Defer focus so layout paints first.
    setTimeout(() => search.focus(), 0);
  }

  function closePopover() {
    pop.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }

  function isOpen() {
    return !pop.classList.contains("hidden");
  }

  function choiceIconClass(choice) {
    const k = (choice && choice.icon) || "";
    if (k === "btc") return "asset-row__icon asset-row__icon--btc";
    if (k === "eth") return "asset-row__icon asset-row__icon--eth";
    if (k === "sol") return "asset-row__icon asset-row__icon--sol";
    return "asset-row__icon";
  }

  function updatePillIcon() {
    if (!iconEl) return;
    const c = assetChoices.find((x) => x.symbol === selectedSymbol);
    iconEl.textContent = c && c.iconText ? c.iconText : "$";
  }

  function renderList(query) {
    const q = typeof query === "string" ? query.trim().toLowerCase() : "";
    const items = assetChoices.filter((c) => {
      if (!q) return true;
      return (
        c.symbol.toLowerCase().includes(q) ||
        (c.name || "").toLowerCase().includes(q)
      );
    });

    list.innerHTML = items
      .map((c) => {
        const active = c.symbol === selectedSymbol ? " is-active" : "";
        const iconClass = choiceIconClass(c);
        const iconText = c.iconText ? escapeHtml(c.iconText) : "$";
        return (
          `<div class="asset-row${active}" role="option" data-symbol="${escapeHtml(
            c.symbol
          )}" aria-selected="${c.symbol === selectedSymbol ? "true" : "false"}">` +
          `<span class="${iconClass}">${iconText}</span>` +
          `<span class="asset-row__sym">${escapeHtml(c.symbol)}</span>` +
          `<span class="asset-row__desc">${escapeHtml(c.name || "")}</span>` +
          `</div>`
        );
      })
      .join("");

    const has = items.length > 0;
    empty.classList.toggle("hidden", has);
    list.classList.toggle("hidden", !has);
  }

  btn.addEventListener("click", () => {
    if (isOpen()) closePopover();
    else openPopover();
  });

  search.addEventListener("input", () => {
    renderList(search.value);
  });

  list.addEventListener("click", (e) => {
    const row = e.target.closest(".asset-row[data-symbol]");
    if (!row) return;
    const sym = row.getAttribute("data-symbol");
    setSelectedSymbol(sym);
    updatePillIcon();
    closePopover();
    const ta = document.getElementById("strategy");
    if (ta) ta.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!isOpen()) return;
    e.preventDefault();
    closePopover();
    btn.focus();
  });

  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (e.target === btn || btn.contains(e.target)) return;
    if (e.target === pop || pop.contains(e.target)) return;
    closePopover();
  });

  // Initialize pill label from default state.
  setSelectedSymbol(selectedSymbol);
  updatePillIcon();
}

function setLookbackUI(activeKey) {
  document.querySelectorAll(".time-range-btn[data-lookback]").forEach((btn) => {
    const k = btn.getAttribute("data-lookback");
    const on = k === activeKey;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function syncTimeRangeButtons() {
  const busy = backtestInFlight;
  document.querySelectorAll(".time-range-btn[data-lookback]").forEach((btn) => {
    btn.disabled = busy;
  });
}

function showError(msg, opts) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.classList.remove("hidden");
  if (!opts || !opts.keepResults) {
    showForm();
  }
}

function hideError() {
  document.getElementById("error").classList.add("hidden");
}

function hideForm() {
  const form = document.getElementById("form");
  if (form) form.classList.add("hidden");
}

function showForm() {
  const form = document.getElementById("form");
  if (form) form.classList.remove("hidden");
}

const TRADE_COL_ORDER = [
  "EntryTime",
  "ExitTime",
  "Duration",
  "Size",
  "EntryPrice",
  "ExitPrice",
  "PnL",
];

/** Columns omitted from the trades table (still present in payload for charts/stats). */
const TRADE_COL_EXCLUDE = new Set([
  "ReturnPct",
  "EntryBar",
  "ExitBar",
  "Tag",
  "SL",
  "TP",
  "Commission",
]);

function tradeColumnKeys(trades) {
  const seen = new Set();
  trades.forEach((row) => {
    if (row && typeof row === "object") {
      Object.keys(row).forEach((k) => {
        if (!TRADE_COL_EXCLUDE.has(k)) seen.add(k);
      });
    }
  });
  const preferred = TRADE_COL_ORDER.filter((k) => seen.has(k));
  const rest = [...seen].filter((k) => !preferred.includes(k)).sort();
  return [...preferred, ...rest];
}

function formatTradeTimestamp(val) {
  if (val === null || val === undefined) return "—";
  if (typeof val === "number" && Number.isFinite(val)) {
    let ms;
    if (val > 1e12) ms = val;
    else if (val > 1e6) ms = val * 1000;
    else return String(val);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return String(val);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  const t = Date.parse(String(val));
  if (Number.isNaN(t)) return String(val);
  const d = new Date(t);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatTradePnL(val) {
  if (val === null || val === undefined) return "—";
  if (typeof val !== "number" || !Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  const maxFrac = abs >= 100 ? 2 : abs >= 1 ? 4 : Math.min(8, 6);
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

function formatTradeCell(col, val) {
  if (col === "EntryTime" || col === "ExitTime") return formatTradeTimestamp(val);
  if (col === "PnL") return formatTradePnL(val);

  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (typeof val === "number") {
    if (!Number.isFinite(val)) return "—";
    if (Number.isInteger(val) && Math.abs(val) < 1e15) return String(val);
    const a = Math.abs(val);
    const digits = a >= 100 ? 2 : a >= 1 ? 4 : Math.min(8, 6);
    return val.toFixed(digits);
  }
  return String(val);
}

const TRADE_NUMERIC_COLS = new Set([
  "Size",
  "EntryPrice",
  "ExitPrice",
  "PnL",
]);

function isNumericTradeColumn(col, rowSample) {
  if (TRADE_NUMERIC_COLS.has(col)) return true;
  if (col.startsWith("Entry_") || col.startsWith("Exit_")) {
    const v = rowSample[col];
    return typeof v === "number" && Number.isFinite(v);
  }
  return false;
}

function renderTradesTable(trades) {
  const section = document.getElementById("trades-section");
  const wrap = document.getElementById("trades-wrap");
  const emptyEl = document.getElementById("trades-empty");
  section.classList.remove("hidden");

  if (!trades || trades.length === 0) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  wrap.classList.remove("hidden");
  const cols = tradeColumnKeys(trades);

  let thead =
    "<thead><tr>" +
    cols.map((c) => "<th>" + escapeHtml(c) + "</th>").join("") +
    "</tr></thead>";

  let body = "";
  trades.forEach((row) => {
    const outcome = tradeOutcomeKind(row);
    const rowCls =
      outcome === "profit"
        ? "trades-row--profit"
        : outcome === "loss"
          ? "trades-row--loss"
          : "";
    body += "<tr" + (rowCls ? ' class="' + rowCls + '"' : "") + ">";
    cols.forEach((c) => {
      const numeric = isNumericTradeColumn(c, row);
      const parts = [];
      if (numeric) parts.push("num");
      if (c === "PnL") parts.push("trade-pnl", "trade-pnl--" + outcome);
      const tdClass = parts.length ? ' class="' + parts.join(" ") + '"' : "";
      body += "<td" + tdClass + ">" + escapeHtml(formatTradeCell(c, row[c])) + "</td>";
    });
    body += "</tr>";
  });

  wrap.innerHTML =
    '<table class="trades-table">' + thead + "<tbody>" + body + "</tbody></table>";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDetail(detail) {
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return String(detail);
  }
}

function normalizeIsoDay(v) {
  if (v == null) return null;
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** USD notional from trade size (BTC) and price (USD/BTC). Matches FractionalBacktest output units. */
function tradeNotionalUsd(size, price) {
  const s = Number(size);
  const p = Number(price);
  if (!Number.isFinite(s) || !Number.isFinite(p)) return null;
  return Math.abs(s) * p;
}

/**
 * Capital deployed for the overview: net summed increments, unless leg entry
 * size is stable (ratio last/first under 1.6) then sum of entry notionals — see
 * `backtest_runner._increment_deploy_totals_usd`.
 */
function incrementalLongDeployStats(trades) {
  if (!Array.isArray(trades) || trades.length === 0) return null;
  const rows = [];
  for (const t of trades) {
    if (!t || typeof t !== "object") continue;
    const size = Number(t.Size);
    if (!Number.isFinite(size) || size <= 0) continue;
    const ep = Number(t.EntryPrice);
    const xp = Number(t.ExitPrice);
    if (!Number.isFinite(ep) || !Number.isFinite(xp)) continue;
    const eb = Number(t.EntryBar);
    const xb = Number(t.ExitBar);
    if (!Number.isFinite(eb) || !Number.isFinite(xb)) continue;
    rows.push({
      eb,
      xb,
      en: Math.abs(size) * ep,
      exn: Math.abs(size) * xp,
    });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.eb - b.eb || a.xb - b.xb);
  const incs = [];
  let prevExit = null;
  for (const r of rows) {
    const inc = prevExit === null ? r.en : r.en - prevExit;
    incs.push(inc);
    prevExit = r.exn;
  }
  const ens = rows.map((r) => r.en);
  const pos = incs.map((x) => (x > 0 ? x : 0));
  const totalNetDeployed = pos.reduce((a, b) => a + b, 0);
  const sumEntry = ens.reduce((a, b) => a + b, 0);
  const maxEntry = pos.length ? Math.max(...pos) : 0;
  const firstEn = ens[0];
  const lastEn = ens[ens.length - 1];
  let displayTotal = totalNetDeployed;
  if (ens.length > 1) {
    const ratio = lastEn / Math.max(firstEn, 1e-12);
    if (ratio < 1.6) displayTotal = sumEntry;
  }
  return {
    totalDeployed: displayTotal,
    totalNetDeployed,
    sumEntry,
    firstEn,
    lastEn,
    maxEntry,
    incs,
  };
}

function formatUsdTooltip(value) {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(n);
}

/**
 * Map a trade to a bar index in `dates` (labels). Uses bar fields when in range,
 * otherwise matches Entry/Exit time to the label after server-side date alignment.
 */
function resolveTradeBar(barKey, timeKey, row, dates) {
  const n = dates.length;
  const bar = row[barKey];
  if (typeof bar === "number" && Number.isFinite(bar)) {
    const b = Math.trunc(bar);
    if (b >= 0 && b < n) return b;
  }
  const day = normalizeIsoDay(row[timeKey]);
  if (!day) return null;
  for (let i = 0; i < n; i++) {
    if (normalizeIsoDay(dates[i]) === day) return i;
  }
  return null;
}

/**
 * Chart.js scatter datasets for trade entry/exit on the strategy equity (normalized) line.
 * Exit trade details appear in the HTML hover card (`resultsEquityExternalTooltip`) on exit bars.
 */
let __cachedBuyPointStyle = null;
function getBuyPointStyle() {
  if (__cachedBuyPointStyle) return __cachedBuyPointStyle;

  const size = 24; // px; scaled by Chart.js pointRadius
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "circle";

  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  // White circle with grey border, containing a "B".
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#d0d7de";
  ctx.stroke();

  ctx.fillStyle = "#24292f";
  ctx.font = "bold 10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("B", cx, cy);

  __cachedBuyPointStyle = c;
  return __cachedBuyPointStyle;
}

/** Profit / loss / flat for coloring exit markers; prefers PnL, then ReturnPct. */
function tradeExitOutcomeSign(tr) {
  if (!tr || typeof tr !== "object") return 0;
  const pnl = Number(tr.PnL);
  if (Number.isFinite(pnl)) {
    if (pnl > 0) return 1;
    if (pnl < 0) return -1;
    return 0;
  }
  const rp = Number(tr.ReturnPct);
  if (Number.isFinite(rp)) {
    if (rp > 0) return 1;
    if (rp < 0) return -1;
    return 0;
  }
  return 0;
}

function tradeOutcomeKind(row) {
  const s = tradeExitOutcomeSign(row);
  if (s > 0) return "profit";
  if (s < 0) return "loss";
  return "flat";
}

const __cachedSellPointStyleBySign = Object.create(null);
function getSellPointStyleForTrade(tr) {
  const sign = tradeExitOutcomeSign(tr);
  if (__cachedSellPointStyleBySign[sign]) return __cachedSellPointStyleBySign[sign];

  const size = 24;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "circle";

  const rad = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;

  let fill;
  let textColor;
  let strokeStyle;
  if (sign > 0) {
    fill = "#068069";
    textColor = "#ffffff";
    strokeStyle = "rgba(0, 0, 0, 0.15)";
  } else if (sign < 0) {
    fill = "#F13044";
    textColor = "#ffffff";
    strokeStyle = "rgba(0, 0, 0, 0.15)";
  } else {
    fill = "#ffffff";
    textColor = "#24292f";
    strokeStyle = "#d0d7de";
  }

  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeStyle;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = "bold 10px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("S", cx, cy);

  __cachedSellPointStyleBySign[sign] = c;
  return c;
}

function buildTradeOverlayDatasets(dates, equity, trades, equityAxisId = "y") {
  const n = Math.min(dates.length, equity.length);
  if (!trades || trades.length === 0 || n === 0) return [];

  const longEntry = [];
  const shortEntry = [];
  const exitPts = [];

  for (const t of trades) {
    if (!t || typeof t !== "object") continue;

    const eb = resolveTradeBar("EntryBar", "EntryTime", t, dates);
    if (eb !== null) {
      const y = Number(equity[eb]);
      if (Number.isFinite(y)) {
        const pt = { x: dates[eb], y, trade: t };
        const size = Number(t.Size);
        if (size > 0) longEntry.push(pt);
        else if (size < 0) shortEntry.push(pt);
        else longEntry.push(pt);
      }
    }

    const xb = resolveTradeBar("ExitBar", "ExitTime", t, dates);
    if (xb !== null) {
      const y = Number(equity[xb]);
      if (Number.isFinite(y)) exitPts.push({ x: dates[xb], y, trade: t });
    }
  }

  const base = {
    type: "scatter",
    yAxisID: equityAxisId,
    pointHoverRadius: 16,
    pointBorderWidth: 1,
    pointBorderColor: "#d0d7de",
    // Draw above lines/fills and don't clip markers at the chart area boundary.
    order: 100,
    clip: false,
  };

  const out = [];
  if (longEntry.length) {
    out.push({
      ...base,
      label: "Long entry",
      data: longEntry,
      pointStyle: getBuyPointStyle(),
      pointRadius: 6,
    });
  }
  if (shortEntry.length) {
    out.push({
      ...base,
      label: "Short entry",
      data: shortEntry,
      pointStyle: "rectRot",
      pointRadius: 10,
      pointBackgroundColor: "#f85149",
    });
  }
  if (exitPts.length) {
    out.push({
      ...base,
      label: "Exit",
      data: exitPts,
      pointStyle(ctx) {
        const pt = ctx.dataset.data[ctx.dataIndex];
        return getSellPointStyleForTrade(pt?.trade);
      },
      pointRadius: 6,
      pointBackgroundColor: "transparent",
    });
  }
  return out;
}

/** Shared time axis for result charts (aligned date ticks). */
function resultsChartXAxisOptions() {
  return {
    offset: false,
    ticks: {
      autoSkip: false,
      maxRotation: 0,
      color: "#57606a",
      font: { size: 13 },
      callback(value, index) {
        const labels = this.chart.data.labels || [];
        const cur = labels[index];
        if (!cur) return "";
        const d = new Date(cur);
        if (isNaN(d.getTime())) return "";
        if (index === 0) {
          return d.toLocaleString(undefined, { month: "short" });
        }
        const prev = new Date(labels[index - 1]);
        if (
          !isNaN(prev.getTime()) &&
          prev.getMonth() === d.getMonth() &&
          prev.getFullYear() === d.getFullYear()
        ) {
          return "";
        }
        return d.toLocaleString(undefined, { month: "short" });
      },
    },
    grid: { display: false, drawTicks: false },
    border: { display: false },
  };
}

/** Strategy equity line + area gradient from fractional total return (metrics.total_return). */
function strategyChartColors(totalReturn) {
  if (totalReturn !== undefined && totalReturn !== null && Number.isFinite(Number(totalReturn))) {
    const r = Number(totalReturn);
    if (r > 0) {
      return {
        borderColor: "#068069",
        backgroundColor: "rgba(6, 128, 105, 0.1)",
        fillGradientTop: "rgba(6, 128, 105, 0.32)",
      };
    }
    if (r < 0) {
      return {
        borderColor: "#F13044",
        backgroundColor: "rgba(241, 48, 68, 0.1)",
        fillGradientTop: "rgba(241, 48, 68, 0.32)",
      };
    }
  }
  return {
    borderColor: "#bc4c00",
    backgroundColor: "rgba(188, 76, 0, 0.1)",
    fillGradientTop: "rgba(188, 76, 0, 0.32)",
  };
}

/** Vertical fade under the strategy line: stronger near the top of the chart, transparent at the baseline. */
function strategyEquityAreaBackground(context, strategyColors) {
  const chart = context.chart;
  const { ctx, chartArea } = chart;
  if (!chartArea) return strategyColors.backgroundColor;
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  g.addColorStop(0, "rgba(255, 255, 255, 0)");
  g.addColorStop(1, strategyColors.fillGradientTop);
  return g;
}

/** USD for chart axes/tooltips; uses a K suffix when |value| ≥ 1000. */
function formatUsdChartLabel(v) {
  if (v === undefined || v === null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs < 1000) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
  const sign = n < 0 ? "-" : "";
  const k = abs / 1000;
  let num;
  if (k >= 100) {
    num = Math.round(k).toString();
  } else if (abs % 1000 === 0) {
    num = String(Math.round(k));
  } else {
    const rounded = Math.round(k * 10) / 10;
    num = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(/\.0$/, "");
  }
  return sign + "$" + num + "K";
}

/** Matches server backtest default `cash` / equity normalization scale. */
const RESULTS_CHART_START_SCALE = 1000;

function parseChartLabelToUtcMidnight(label) {
  if (typeof label !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(label);
  if (!m) {
    const t = Date.parse(label);
    if (Number.isNaN(t)) return null;
    return new Date(t);
  }
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}

function formatResultsChartHoverDatetimeLines(label) {
  const d = parseChartLabelToUtcMidnight(label);
  if (!d || Number.isNaN(d.getTime())) {
    return { dateLine: typeof label === "string" ? label : "—", timeLine: "" };
  }
  const dateLine = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  const timeLine = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "UTC",
  });
  return { dateLine, timeLine };
}

function totalStrategyUsdAtBar(equity, idx, startUsd, e0) {
  const ei = Number(equity[idx]);
  if (!Number.isFinite(ei) || !Number.isFinite(e0) || e0 === 0 || !Number.isFinite(startUsd)) {
    return null;
  }
  return (ei / e0) * startUsd;
}

function exitTradesAtBarIndex(dates, trades, barIdx) {
  const out = [];
  if (!Array.isArray(trades) || !Number.isFinite(barIdx)) return out;
  for (const tr of trades) {
    if (!tr || typeof tr !== "object") continue;
    const xb = resolveTradeBar("ExitBar", "ExitTime", tr, dates);
    if (xb === barIdx) out.push(tr);
  }
  return out;
}

function buildResultsChartTooltipHtml(meta, dataIndex) {
  const { dates, equity, closes, trades, showTradeOverlays, startUsd, equity0 } = meta;
  const idx = dataIndex;
  if (!Number.isFinite(idx) || idx < 0 || idx >= dates.length) return "";

  const spot =
    closes && idx < closes.length && closes[idx] != null && Number.isFinite(Number(closes[idx]))
      ? Number(closes[idx])
      : null;
  const priceLine =
    spot != null ? formatUsdChartLabel(spot) : "—";

  const { dateLine, timeLine } = formatResultsChartHoverDatetimeLines(dates[idx]);
  const totalCap = totalStrategyUsdAtBar(equity, idx, startUsd, equity0);
  const capLine =
    totalCap != null
      ? "Total capital " + formatUsdTooltip(totalCap)
      : "Total capital —";

  let html =
    '<div class="results-chart-tooltip__price">' +
    escapeHtml(priceLine) +
    "</div>" +
    '<div class="results-chart-tooltip__muted">' +
    escapeHtml(dateLine) +
    "</div>";
  if (timeLine) {
    html += '<div class="results-chart-tooltip__muted">' + escapeHtml(timeLine) + "</div>";
  }
  html += '<div class="results-chart-tooltip__capital">' + escapeHtml(capLine) + "</div>";

  if (showTradeOverlays && trades.length) {
    const exits = exitTradesAtBarIndex(dates, trades, idx);
    for (const tr of exits) {
      const size = Number(tr.Size);
      const wasLong = Number.isFinite(size) && size > 0;
      const action = wasLong ? "SOLD" : "COVERED";
      const forLabel = wasLong ? "Sold for" : "Covered for";
      const exitPx = Number(tr.ExitPrice);
      const atExit = tradeNotionalUsd(size, exitPx);
      html += '<div class="results-chart-tooltip__trade">';
      html +=
        '<div class="results-chart-tooltip__trade-action">' + escapeHtml(action) + "</div>";
      if (atExit != null) {
        html +=
          '<div class="results-chart-tooltip__muted">' +
          escapeHtml(forLabel + " " + formatUsdTooltip(atExit)) +
          "</div>";
      }
      const pnl = Number(tr.PnL);
      if (Number.isFinite(pnl)) {
        let pnlClass = "results-chart-tooltip__pnl--flat";
        if (pnl > 0) pnlClass = "results-chart-tooltip__pnl--up";
        else if (pnl < 0) pnlClass = "results-chart-tooltip__pnl--down";
        const pnlWords = pnl > 0 ? "Profit" : pnl < 0 ? "Loss" : "P/L";
        html +=
          '<div class="results-chart-tooltip__pnl ' +
          pnlClass +
          '">' +
          escapeHtml(pnlWords + " " + formatUsdTooltip(pnl)) +
          "</div>";
      }
      html += "</div>";
    }
  }

  return html;
}

function resultsEquityExternalTooltip(context) {
  const { chart, tooltip } = context;
  const host = chart.canvas && chart.canvas.parentNode;
  if (!host) return;

  let el = host.querySelector("[data-results-chart-tooltip]");
  if (!el) {
    el = document.createElement("div");
    el.setAttribute("data-results-chart-tooltip", "1");
    el.className = "results-chart-tooltip";
    el.setAttribute("role", "tooltip");
    host.appendChild(el);
  }

  if (tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
    el.style.opacity = "0";
    return;
  }

  const meta = chart.$resultsHoverMeta;
  if (!meta) {
    el.style.opacity = "0";
    return;
  }

  const idx = tooltip.dataPoints[0].dataIndex;
  el.innerHTML = buildResultsChartTooltipHtml(meta, idx);

  const cx = chart.canvas.offsetLeft + (tooltip.caretX || 0);
  const cy = chart.canvas.offsetTop + (tooltip.caretY || 0);
  el.style.left = Math.round(cx + 12) + "px";
  el.style.top = Math.round(cy) + "px";
  el.style.transform = "translateY(-50%)";
  el.style.opacity = "1";
}

const hoverVerticalLinePlugin = {
  id: "hoverVerticalLine",
  afterDatasetsDraw(chart) {
    const active = chart.getActiveElements();
    if (!active.length) return;

    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    if (!Number.isFinite(x)) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(31, 35, 40, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Chart.js config shared by the main results chart and success-strategy cards.
 * Preset cards pass `{ showTradeOverlays: false }` to omit entry/exit markers only.
 */
function buildResultsEquityChartConfig(data, opts = {}) {
  const showTradeOverlays = opts.showTradeOverlays !== false;

  const dates = Array.isArray(data.dates) ? data.dates : [];
  const equity = Array.isArray(data.equity) ? data.equity : [];
  if (!dates.length || !equity.length) return null;

  const metrics = data.metrics || {};
  const closes =
    Array.isArray(data.close) && data.close.length === dates.length ? data.close : null;

  let trades = [];
  if (showTradeOverlays) {
    trades = Array.isArray(data.trades)
      ? data.trades
      : data.backtesting && Array.isArray(data.backtesting.trades)
        ? data.backtesting.trades
        : [];
  }

  const closeNums =
    closes && closes.length === dates.length
      ? closes.map((c) => Number(c)).filter((x) => Number.isFinite(x))
      : [];
  const useSpotAxis = closeNums.length > 0;
  /** Investment (normalized equity) on the left; spot price on the right when present. */
  const equityAxisId = "y";
  const spotAxisId = "y1";

  const symRaw =
    typeof data.symbol === "string" && data.symbol.trim()
      ? data.symbol.trim().toUpperCase()
      : "BTCUSDT";
  const spotDatasetLabel = symRaw + " spot";

  const datasets = [];
  if (useSpotAxis) {
    datasets.push({
      label: spotDatasetLabel,
      data: closes.map((c) => Number(c)),
      yAxisID: spotAxisId,
      borderColor: "#B5CAEC",
      backgroundColor: "transparent",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      order: -1,
    });
  }
  const strategyColors = strategyChartColors(metrics.total_return);
  datasets.push(
    {
      label: "Strategy (normalized)",
      data: equity,
      yAxisID: equityAxisId,
      borderColor: strategyColors.borderColor,
      backgroundColor: (ctx) => strategyEquityAreaBackground(ctx, strategyColors),
      fill: "start",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.1,
      order: 0,
    },
    ...(showTradeOverlays
      ? buildTradeOverlayDatasets(dates, equity, trades, equityAxisId)
      : []),
  );

  const spotSpan =
    useSpotAxis && closeNums.length > 0
      ? Math.max(Math.max(...closeNums) - Math.min(...closeNums), 1e-12)
      : 0;

  const equityNums = equity.map((e) => Number(e)).filter((x) => Number.isFinite(x));
  const eqSpan =
    equityNums.length > 0
      ? Math.max(Math.max(...equityNums) - Math.min(...equityNums), 1e-12)
      : 1e-12;

  const yScaleSpot = useSpotAxis
    ? {
        type: "linear",
        position: "right",
        ticks: {
          color: "#57606a",
          maxTicksLimit: 6,
          callback(value) {
            return formatUsdChartLabel(Number(value));
          },
        },
        grid: { display: false },
        border: { display: false },
        suggestedMin: Math.min(...closeNums) - spotSpan * 0.02,
        suggestedMax: Math.max(...closeNums) + spotSpan * 0.02,
      }
    : null;

  const yScaleEquity = useSpotAxis
    ? {
        type: "linear",
        position: "left",
        ticks: {
          color: "#57606a",
          maxTicksLimit: 6,
          callback(value) {
            return Number(value).toFixed(3);
          },
        },
        grid: { display: false },
        border: { display: false },
        ...(equityNums.length > 0
          ? {
              suggestedMin: Math.min(...equityNums) - eqSpan * 0.02,
              suggestedMax: Math.max(...equityNums) + eqSpan * 0.02,
            }
          : {}),
      }
      : {
        ticks: { color: "#57606a" },
        grid: { display: false },
        border: { display: false },
      };

  const e0 = equity.length ? Number(equity[0]) : NaN;
  const capObj = data.capital && typeof data.capital === "object" ? data.capital : null;
  const startUsdResolved =
    capObj && typeof capObj.start_usd === "number" && Number.isFinite(Number(capObj.start_usd))
      ? Number(capObj.start_usd)
      : Number.isFinite(e0)
        ? e0 * RESULTS_CHART_START_SCALE
        : RESULTS_CHART_START_SCALE;

  const resultsHoverMetaPlugin = {
    id: "resultsHoverMeta",
    beforeInit(chart) {
      chart.$resultsHoverMeta = {
        dates,
        equity,
        closes,
        trades,
        showTradeOverlays,
        startUsd: startUsdResolved,
        equity0: e0,
      };
    },
  };

  return {
    type: "line",
    data: {
      labels: dates,
      datasets,
    },
    plugins: [hoverVerticalLinePlugin, resultsHoverMetaPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6 } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: resultsChartXAxisOptions(),
        ...(useSpotAxis ? { y: yScaleEquity, y1: yScaleSpot } : { y: yScaleEquity }),
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: resultsEquityExternalTooltip,
        },
      },
    },
  };
}

function setSubmitRunning(running) {
  const submit = document.getElementById("submit");
  if (submit) {
    submit.disabled = running;
    submit.classList.toggle("is-loading", running);
    submit.setAttribute("aria-label", running ? "Running backtest" : "Test my strategy");
  }
  const strategyEl = document.getElementById("strategy");
  if (strategyEl instanceof HTMLTextAreaElement) {
    strategyEl.disabled = running;
    strategyEl.setAttribute("aria-busy", String(running));
  }
  const sampleIdeaBtn = document.getElementById("strategy-sample-idea");
  if (sampleIdeaBtn instanceof HTMLButtonElement) {
    sampleIdeaBtn.disabled = running;
  }
  syncTimeRangeButtons();
}

function applyBacktestPayload(data, opts) {
    const dates = data.dates;
    const equity = data.equity;
    const metrics = data.metrics || {};

    document.getElementById("chart-section").classList.remove("hidden");
    hideForm();

    const descriptionSection = document.getElementById("strategy-description-section");
    const descriptionBody = document.getElementById("strategy-description-body");
    const descriptionText =
      opts && typeof opts.strategyDescription === "string"
        ? opts.strategyDescription.trim()
        : lastStrategyDescription;
    if (descriptionText) {
      lastStrategyDescription = descriptionText;
      descriptionBody.textContent = descriptionText;
      descriptionSection.classList.remove("hidden");
    } else {
      descriptionBody.textContent = "";
      descriptionSection.classList.add("hidden");
    }

    const explanationSection = document.getElementById("explanation-section");
    const explanationBody = document.getElementById("explanation-body");
    const explanationText =
      typeof data.strategy_explanation === "string" ? data.strategy_explanation.trim() : "";
    if (explanationText) {
      explanationBody.textContent = explanationText;
      explanationSection.classList.remove("hidden");
    } else {
      explanationBody.textContent = "";
      explanationSection.classList.add("hidden");
    }

    const noteEl = document.getElementById("alignment-note");
    if (data.alignment_note) {
      noteEl.textContent = data.alignment_note;
      noteEl.classList.remove("hidden");
    } else {
      noteEl.textContent = "";
      noteEl.classList.add("hidden");
    }

    function formatPctFromFraction(x) {
      if (x === undefined || x === null || !Number.isFinite(Number(x))) return "—";
      const n = Number(x);
      return (n * 100).toFixed(2) + "%";
    }

    function formatDrawdownFraction(x) {
      if (x === undefined || x === null || !Number.isFinite(Number(x))) return "—";
      return (Math.abs(Number(x)) * 100).toFixed(2) + "%";
    }

    function formatUsd(x) {
      if (x === undefined || x === null || !Number.isFinite(Number(x))) return "—";
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(x));
    }

    function assetShortLabel(symbol) {
      const s =
        typeof symbol === "string" && symbol.trim()
          ? symbol.trim().toUpperCase()
          : "BTCUSDT";
      const quoted = s.match(/^(.+)(USDT|USDC|BUSD|USD)$/);
      if (quoted) return quoted[1];
      return s.length <= 6 ? s : s.slice(0, 4);
    }

    const overviewBar = document.getElementById("overview-bar");

    const symRaw = typeof data.symbol === "string" ? data.symbol.trim().toUpperCase() : "";
    const symbolFull = symRaw || "BTCUSDT";
    const assetEl = document.getElementById("overview-asset");
    if (assetEl) {
      assetEl.textContent = assetShortLabel(symbolFull);
      assetEl.setAttribute("aria-label", `Asset ${symbolFull}`);
    }

    const profitEl = document.getElementById("overview-profit");
    profitEl.textContent = formatPctFromFraction(metrics.total_return);
    profitEl.className = "overview-value";
    const ret = metrics.total_return;
    if (ret !== undefined && ret !== null && Number.isFinite(Number(ret))) {
      const r = Number(ret);
      if (r > 0) profitEl.classList.add("overview-value--up");
      else if (r < 0) profitEl.classList.add("overview-value--down");
    }

    const cap = data.capital && typeof data.capital === "object" ? data.capital : null;
    let startUsd = cap && typeof cap.start_usd === "number" ? cap.start_usd : null;
    let endUsd = cap && typeof cap.end_usd === "number" ? cap.end_usd : null;
    if (
      (startUsd === null || endUsd === null) &&
      equity.length > 0 &&
      dates.length > 0
    ) {
      const scale = 1_000;
      const e0 = Number(equity[0]);
      const e1 = Number(equity[equity.length - 1]);
      if (Number.isFinite(e0) && Number.isFinite(e1)) {
        startUsd = e0 * scale;
        endUsd = e1 * scale;
      }
    }

    const trades =
      Array.isArray(data.trades)
        ? data.trades
        : data.backtesting && Array.isArray(data.backtesting.trades)
          ? data.backtesting.trades
          : [];

    let capitalDeployedUsd = null;
    if (cap && typeof cap.total_deployed_usd === "number") {
      const v = Number(cap.total_deployed_usd);
      if (Number.isFinite(v)) capitalDeployedUsd = v;
    }
    if (capitalDeployedUsd === null && trades.length > 0) {
      const st = incrementalLongDeployStats(trades);
      if (st && Number.isFinite(st.totalDeployed)) capitalDeployedUsd = st.totalDeployed;
    }
    if (
      capitalDeployedUsd === null &&
      cap &&
      typeof cap.max_invested_usd === "number" &&
      trades.length === 0
    ) {
      const legacy = Number(cap.max_invested_usd);
      if (Number.isFinite(legacy)) capitalDeployedUsd = legacy;
    }
    document.getElementById("overview-factor").textContent = formatUsd(capitalDeployedUsd);
    document.getElementById("overview-factor").className = "overview-value";

    document.getElementById("overview-start").textContent = formatUsd(startUsd);
    document.getElementById("overview-start").className = "overview-value";
    document.getElementById("overview-end").textContent = formatUsd(endUsd);
    document.getElementById("overview-end").className = "overview-value";

    const ddEl = document.getElementById("overview-drawdown");
    const ddStr = formatDrawdownFraction(metrics.max_drawdown);
    ddEl.textContent = ddStr;
    ddEl.className = "overview-value";
    if (
      ddStr !== "—" &&
      metrics.max_drawdown !== undefined &&
      metrics.max_drawdown !== null &&
      Number.isFinite(Number(metrics.max_drawdown)) &&
      Number(metrics.max_drawdown) !== 0
    ) {
      ddEl.classList.add("overview-value--down");
    }

    overviewBar.classList.remove("hidden");

    if (chartInstance) chartInstance.destroy();

    const chartCfg = buildResultsEquityChartConfig(data, { showTradeOverlays: true });
    if (chartCfg) {
      const ctx = document.getElementById("chart").getContext("2d");
      chartInstance = new Chart(ctx, chartCfg);
    }

    renderTradesTable(trades);
    canRerunBacktest = true;
}

async function rerunBacktest(lookbackKey) {
  if (backtestInFlight || !canRerunBacktest) return;

  hideError();
  backtestInFlight = true;
  setSubmitRunning(true);

  try {
    const res = await fetch(`${API_BASE}/api/backtest/rerun`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ lookback: lookbackKey, symbol: selectedSymbol }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail !== undefined ? data.detail : data;
      showError(formatDetail(detail), { keepResults: true });
      return;
    }

    applyBacktestPayload(data);
  } catch (err) {
    showError(err.message || String(err), { keepResults: true });
  } finally {
    backtestInFlight = false;
    setSubmitRunning(false);
  }
}

async function runBacktest(strategyText) {
  hideError();
  document.getElementById("chart-section").classList.add("hidden");

  const text = typeof strategyText === "string" ? strategyText.trim() : "";
  if (!text) {
    showError("Enter a strategy description.");
    return;
  }

  if (backtestInFlight) return;

  backtestInFlight = true;
  setSubmitRunning(true);

  try {
    const res = await fetch(`${API_BASE}/api/backtest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        strategyText: text,
        lookback: selectedLookback,
        symbol: selectedSymbol,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail !== undefined ? data.detail : data;
      showError(formatDetail(detail));
      return;
    }

    lastStrategyDescription = "";
    applyBacktestPayload(data);
  } catch (err) {
    showError(err.message || String(err));
  } finally {
    backtestInFlight = false;
    setSubmitRunning(false);
  }
}

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const strategyText = document.getElementById("strategy").value.trim();
  await runBacktest(strategyText);
});

loadAssetsFromServer().finally(() => {
  initAssetSelector();
});

setLookbackUI(selectedLookback);

const timeRangeSelector = document.getElementById("time-range-selector");
if (timeRangeSelector) {
  timeRangeSelector.addEventListener("click", (e) => {
    const btn = e.target.closest(".time-range-btn[data-lookback]");
    if (!btn || backtestInFlight) return;
    const key = btn.getAttribute("data-lookback");
    if (!key || key === selectedLookback) return;
    selectedLookback = key;
    setLookbackUI(key);
    if (canRerunBacktest) {
      rerunBacktest(key);
    }
  });
}

const STANDARD_STRATEGY_IDEA =
  "Each time the asset goes 7% down we double the invest that we have currently in. When all trades combined are giving us 2% profit, we sell all of it. Enter the market with it fell again from last peak.";

const strategyField = document.getElementById("strategy");

/** Grow/shrink the strategy textarea so its height always fits the full text. */
function autosizeStrategyField() {
  if (!(strategyField instanceof HTMLTextAreaElement)) return;
  strategyField.style.height = "auto";
  strategyField.style.height = strategyField.scrollHeight + "px";
}

if (strategyField instanceof HTMLTextAreaElement) {
  strategyField.addEventListener("input", autosizeStrategyField);
  autosizeStrategyField();
}

let demoStrategyTypingTimer = null;
let demoStrategySubmitTimer = null;

if (strategyField) {
  strategyField.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    if (e.isComposing) return;
    if (backtestInFlight) return;
    if (demoStrategyTypingTimer !== null) {
      e.preventDefault();
      cancelDemoStrategyAutoFlow();
      return;
    }
    if (demoStrategySubmitTimer !== null) cancelDemoStrategySubmitTimer();
    e.preventDefault();
    document.getElementById("form").requestSubmit();
  });
}

function cancelDemoStrategySubmitTimer() {
  if (demoStrategySubmitTimer !== null) {
    clearTimeout(demoStrategySubmitTimer);
    demoStrategySubmitTimer = null;
  }
}

function cancelDemoStrategyTyping() {
  if (demoStrategyTypingTimer !== null) {
    clearInterval(demoStrategyTypingTimer);
    demoStrategyTypingTimer = null;
  }
}

function cancelDemoStrategyAutoFlow() {
  cancelDemoStrategyTyping();
  cancelDemoStrategySubmitTimer();
}

function typeDemoStrategyIntoField() {
  if (!(strategyField instanceof HTMLTextAreaElement)) return;
  cancelDemoStrategyAutoFlow();
  strategyField.value = "";
  autosizeStrategyField();
  strategyField.focus();
  const text = STANDARD_STRATEGY_IDEA;
  let i = 0;
  demoStrategyTypingTimer = window.setInterval(() => {
    if (backtestInFlight) {
      cancelDemoStrategyAutoFlow();
      return;
    }
    if (i >= text.length) {
      cancelDemoStrategyTyping();
      cancelDemoStrategySubmitTimer();
      demoStrategySubmitTimer = window.setTimeout(() => {
        demoStrategySubmitTimer = null;
        if (backtestInFlight) return;
        const form = document.getElementById("form");
        if (form) form.requestSubmit();
      }, 200);
      return;
    }
    strategyField.value += text[i];
    i += 1;
    const end = strategyField.value.length;
    strategyField.setSelectionRange(end, end);
    autosizeStrategyField();
  }, 18);
}

const strategySampleIdeaBtn = document.getElementById("strategy-sample-idea");
if (strategySampleIdeaBtn instanceof HTMLButtonElement && strategyField instanceof HTMLTextAreaElement) {
  strategySampleIdeaBtn.addEventListener("click", () => {
    if (backtestInFlight) return;
    typeDemoStrategyIntoField();
  });
  strategyField.addEventListener("keydown", (e) => {
    if ((demoStrategyTypingTimer !== null || demoStrategySubmitTimer !== null) && e.isTrusted) {
      cancelDemoStrategyAutoFlow();
    }
  });
  strategyField.addEventListener("paste", (e) => {
    if ((demoStrategyTypingTimer !== null || demoStrategySubmitTimer !== null) && e.isTrusted) {
      cancelDemoStrategyAutoFlow();
    }
  });
}

const testAgainBtn = document.getElementById("test-again");
if (testAgainBtn) {
  testAgainBtn.addEventListener("click", async () => {
    canRerunBacktest = false;
    try {
      await fetch(`${API_BASE}/api/session/forget-last-strategy`, {
        method: "POST",
        credentials: "include",
      });
    } catch (_) {
      /* non-fatal */
    }
    document.getElementById("chart-section").classList.add("hidden");
    lastStrategyDescription = "";
    hideError();
    showForm();
    const ta = document.getElementById("strategy");
    if (ta) ta.focus();
  });
}

const successChartInstances = new Map();

function setSuccessStatus(card, text, isError) {
  const statusEl = card.querySelector('[data-role="status"]');
  if (!statusEl) return;
  statusEl.textContent = text || "";
  statusEl.classList.toggle("success-card__status--error", !!isError);
  statusEl.style.display = text ? "" : "none";
}

function setSuccessReturn(card, totalReturn) {
  const el = card.querySelector('[data-role="return"]');
  if (!el) return;
  el.classList.remove("success-card__return--up", "success-card__return--down");
  if (totalReturn === undefined || totalReturn === null || !Number.isFinite(Number(totalReturn))) {
    el.textContent = "—";
    return;
  }
  const r = Number(totalReturn);
  const sign = r > 0 ? "+" : "";
  el.textContent = sign + (r * 100).toFixed(2) + "%";
  if (r > 0) el.classList.add("success-card__return--up");
  else if (r < 0) el.classList.add("success-card__return--down");
}

function renderSuccessChart(card, data) {
  const canvas = card.querySelector('[data-role="chart"]');
  if (!canvas) return;

  const preset = card.dataset.preset || "";
  const prev = successChartInstances.get(preset);
  if (prev) prev.destroy();

  const chartCfg = buildResultsEquityChartConfig(data, { showTradeOverlays: false });
  if (!chartCfg) return;

  const chart = new Chart(canvas.getContext("2d"), chartCfg);
  successChartInstances.set(preset, chart);
  requestAnimationFrame(() => {
    chart.resize();
  });
}

async function loadSuccessPreset(card) {
  const preset = card.dataset.preset;
  if (!preset) return;
  setSuccessStatus(card, "Loading…", false);
  try {
    const res = await fetch(`${API_BASE}/api/backtest/preset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: preset, symbol: selectedSymbol }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data && data.detail !== undefined ? data.detail : data;
      setSuccessStatus(card, "Failed: " + formatDetail(detail), true);
      return;
    }
    setSuccessReturn(card, data && data.metrics ? data.metrics.total_return : null);
    renderSuccessChart(card, data);
    setSuccessStatus(card, "", false);
  } catch (err) {
    setSuccessStatus(card, "Failed: " + (err.message || String(err)), true);
  }
}

function loadSuccessfulStrategies() {
  const cards = document.querySelectorAll(".success-card[data-preset]");
  cards.forEach((card) => loadSuccessPreset(card));
}

loadSuccessfulStrategies();
