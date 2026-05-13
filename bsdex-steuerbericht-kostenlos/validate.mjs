import fs from "node:fs/promises";

function stripWeirdSpaces(s) {
  return (s || "").replace(/\u00a0/g, " ").trim();
}

function parseBSDexDate(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const HH = Number(m[4]);
  const MM = Number(m[5]);
  return new Date(yyyy, mm - 1, dd, HH, MM, 0, 0);
}

function parseLocaleNumber(raw) {
  const s0 = stripWeirdSpaces(raw);
  if (!s0) return null;
  if (s0.includes("–.––")) return null;
  const s1 = s0.replace(/[^\d,.\-+]/g, "");
  if (!s1) return null;
  const hasComma = s1.includes(",");
  const hasDot = s1.includes(".");
  let normalized = s1;
  if (hasComma && hasDot) normalized = s1.replace(/,/g, "");
  else if (hasComma && !hasDot) normalized = s1.replace(/,/g, ".");
  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}

function parseAssetAmount(raw) {
  const s = stripWeirdSpaces(raw);
  if (!s) return { qty: null, unit: null };
  if (s.includes("–.––")) return { qty: null, unit: null };
  const m = s.match(/^([+\-]?[0-9][0-9,.\s\u00a0]*)\s*([A-Za-z0-9]+)$/);
  if (!m) return { qty: parseLocaleNumber(s), unit: null };
  return { qty: parseLocaleNumber(m[1]), unit: m[2] };
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) throw new Error("CSV scheint leer zu sein.");
  const header = nonEmpty[0].split(";");
  const rows = nonEmpty.slice(1).map((l) => l.split(";"));
  return { header, rows };
}

function buildIndex(header) {
  const map = new Map();
  for (let i = 0; i < header.length; i += 1) {
    const key = (header[i] || "").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  }
  const idx = (name, nth = 0) => {
    const arr = map.get(name) || [];
    return arr[nth] ?? -1;
  };
  return { idx };
}

function normalizeEvents({ header, rows }) {
  const { idx } = buildIndex(header);
  const col = {
    txType: idx("Transaction type", 0),
    assetId: idx("Asset id", 0),
    amount: idx("Amount", 0),
    side: idx("Side", 0),
    filled: idx("Filled", 0),
    quoteFilled: idx("Quote filled", 0),
    quoteQuantity: idx("Quote quantity", 0),
    fee: idx("Fee", 0),
    created: idx("Created", 0),
    finalized: idx("Finalized at", 0),
    sourceAddr: idx("Source address", 0),
    targetAddr: idx("Target address", 0),
  };

  const events = [];
  const warnings = [];

  function get(row, i) {
    if (i < 0) return "";
    return row[i] ?? "";
  }

  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    const txType = stripWeirdSpaces(get(row, col.txType));
    if (!txType) continue;
    const createdAt = parseBSDexDate(get(row, col.created));
    const finalizedAt = parseBSDexDate(get(row, col.finalized));
    const timestamp = finalizedAt || createdAt;
    if (!timestamp) {
      warnings.push(`Zeile ${r + 2}: Datum konnte nicht interpretiert werden`);
      continue;
    }

    if (txType === "Market") {
      const side = stripWeirdSpaces(get(row, col.side));
      const asset = stripWeirdSpaces(get(row, col.assetId));
      const feeEUR = parseLocaleNumber(get(row, col.fee)) || 0;
      const filledEUR = parseLocaleNumber(get(row, col.filled));
      const quoteQtyEUR = parseLocaleNumber(get(row, col.quoteQuantity));
      const quoteFilled = parseAssetAmount(get(row, col.quoteFilled));
      const amount = parseAssetAmount(get(row, col.amount));

      if (side === "Buy") {
        const qtyIn = quoteFilled.qty;
        const eurOut = quoteQtyEUR ?? filledEUR;
        if (qtyIn == null || eurOut == null) {
          warnings.push(`Zeile ${r + 2}: unvollständiger Kauf`);
          continue;
        }
        events.push({ kind: "trade_buy", timestamp, asset, qty: qtyIn, eur: eurOut, feeEUR });
      } else if (side === "Sell") {
        const qtyOut = amount.qty ?? quoteFilled.qty;
        const eurIn = filledEUR;
        if (qtyOut == null || eurIn == null) {
          warnings.push(`Zeile ${r + 2}: unvollständiger Verkauf`);
          continue;
        }
        events.push({ kind: "trade_sell", timestamp, asset, qty: qtyOut, eur: eurIn, feeEUR });
      }
    } else if (txType === "Deposits" || txType === "Withdrawals") {
      const asset = stripWeirdSpaces(get(row, col.assetId));
      const amount = get(row, col.amount);
      const parsed = parseAssetAmount(amount);
      const eur = parseLocaleNumber(amount);
      if (!asset && eur != null) {
        events.push({ kind: txType === "Deposits" ? "fiat_deposit" : "fiat_withdrawal", timestamp, eur });
      } else if (asset && parsed.qty != null) {
        events.push({
          kind: txType === "Withdrawals" ? "transfer_out" : "transfer_in",
          timestamp,
          asset,
          qty: parsed.qty,
          meta: { source: stripWeirdSpaces(get(row, col.sourceAddr)), target: stripWeirdSpaces(get(row, col.targetAddr)) },
        });
      }
    }
  }

  events.sort((a, b) => a.timestamp - b.timestamp);
  return { events, warnings };
}

function fifoProcess(events) {
  const lotsByAsset = new Map();
  const balances = new Map();
  const inventoryWarnings = [];
  const processed = [];

  function getLots(asset) {
    if (!lotsByAsset.has(asset)) lotsByAsset.set(asset, []);
    return lotsByAsset.get(asset);
  }

  function getBal(asset) {
    return balances.get(asset) ?? 0;
  }

  function setBal(asset, qty) {
    balances.set(asset, qty);
  }

  function depleteLots(asset, qtyNeeded) {
    const lots = getLots(asset);
    const segments = [];
    let remaining = qtyNeeded;

    while (remaining > 1e-12 && lots.length > 0) {
      const lot = lots[0];
      const takeQty = Math.min(lot.qtyRemaining, remaining);
      const takeCost = (lot.costEurRemaining * takeQty) / lot.qtyRemaining;
      lot.qtyRemaining -= takeQty;
      lot.costEurRemaining -= takeCost;
      remaining -= takeQty;
      segments.push({ qty: takeQty, costEUR: takeCost, acquiredAt: lot.acquiredAt });
      if (lot.qtyRemaining <= 1e-12) lots.shift();
    }

    return { segments, shortfallQty: Math.max(0, remaining) };
  }

  for (const ev of events) {
    if (ev.kind === "trade_buy") {
      const costEUR = ev.eur + (ev.feeEUR || 0);
      getLots(ev.asset).push({
        acquiredAt: ev.timestamp,
        qtyRemaining: ev.qty,
        costEurRemaining: costEUR,
      });
      setBal(ev.asset, getBal(ev.asset) + ev.qty);
      processed.push({ ...ev, year: ev.timestamp.getFullYear(), remainingQty: getBal(ev.asset), costEUR });
    } else if (ev.kind === "trade_sell") {
      const proceedsEUR = ev.eur - (ev.feeEUR || 0);
      const { segments, shortfallQty } = depleteLots(ev.asset, ev.qty);
      setBal(ev.asset, getBal(ev.asset) - (ev.qty - shortfallQty));
      if (shortfallQty > 1e-12) inventoryWarnings.push(`Bestandsdefizit ${ev.asset}: Verkauf-Defizit ${shortfallQty}`);
      const totalMatchedQty = segments.reduce((s, seg) => s + seg.qty, 0);
      const perQtyProceeds = totalMatchedQty > 0 ? proceedsEUR / totalMatchedQty : 0;
      const disposalSegments = segments.map((seg) => {
        const holdingDays = (ev.timestamp - seg.acquiredAt) / (1000 * 60 * 60 * 24);
        const taxable = holdingDays <= 365;
        const proceedsSeg = perQtyProceeds * seg.qty;
        return { ...seg, holdingDays, taxable, proceedsEUR: proceedsSeg, gainEUR: proceedsSeg - seg.costEUR };
      });
      const taxableGainEUR = disposalSegments.filter((s) => s.taxable).reduce((sum, s) => sum + s.gainEUR, 0);
      const taxFreeGainEUR = disposalSegments.filter((s) => !s.taxable).reduce((sum, s) => sum + s.gainEUR, 0);
      processed.push({
        ...ev,
        year: ev.timestamp.getFullYear(),
        proceedsEUR,
        disposalSegments,
        taxableGainEUR,
        taxFreeGainEUR,
        remainingQty: getBal(ev.asset),
      });
    } else if (ev.kind === "transfer_out") {
      const { shortfallQty } = depleteLots(ev.asset, ev.qty);
      setBal(ev.asset, getBal(ev.asset) - (ev.qty - shortfallQty));
      processed.push({ ...ev, year: ev.timestamp.getFullYear(), remainingQty: getBal(ev.asset), shortfallQty });
    }
  }

  return { processed, inventoryWarnings };
}

function summarizeByYear(processed) {
  const byYear = new Map();
  function getYear(y) {
    if (!byYear.has(y)) {
      byYear.set(y, {
        year: y,
        sec23: { proceedsEUR: 0, costEUR: 0, taxableGainEUR: 0, taxFreeGainEUR: 0, disposals: 0 },
      });
    }
    return byYear.get(y);
  }
  for (const tx of processed) {
    if (tx.kind !== "trade_sell") continue;
    const y = getYear(tx.year);
    y.sec23.disposals += 1;
    y.sec23.proceedsEUR += tx.proceedsEUR || 0;
    y.sec23.taxableGainEUR += tx.taxableGainEUR || 0;
    y.sec23.taxFreeGainEUR += tx.taxFreeGainEUR || 0;
    y.sec23.costEUR += (tx.disposalSegments || []).reduce((s, seg) => s + seg.costEUR, 0);
  }
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Aufruf: node validate.mjs /pfad/zu/Transactions.csv");
  process.exit(2);
}

const text = await fs.readFile(filePath, "utf8");
const parsed = parseCSV(text);
const { events, warnings } = normalizeEvents(parsed);
const { processed, inventoryWarnings } = fifoProcess(events);
const years = summarizeByYear(processed);

console.log(`Ereignisse: ${events.length}`);
if (warnings.length) console.log(`Hinweise: ${warnings.length}`);
if (inventoryWarnings.length) console.log(`Bestandswarnungen: ${inventoryWarnings.length}`);
for (const y of years) {
  console.log(
    `${y.year} Veräußerungen=${y.sec23.disposals} Erlöse=${y.sec23.proceedsEUR.toFixed(
      2,
    )} Kosten=${y.sec23.costEUR.toFixed(2)} steuerpflichtigerGewinn=${y.sec23.taxableGainEUR.toFixed(
      2,
    )} steuerfreierGewinn=${y.sec23.taxFreeGainEUR.toFixed(2)}`,
  );
}
