/* eslint-disable no-alert */

(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const fileMeta = document.getElementById("fileMeta");
  const statusEl = document.getElementById("status");
  const yearBoxes = document.getElementById("yearBoxes");
  const errorsEl = document.getElementById("errors");
  const reportSuccessEl = document.getElementById("reportSuccess");
  const printBtn = document.getElementById("printBtn");
  const INVENTORY_CSV_HINT_DE =
    "Stelle sicher, dass ALLE Transaktionen im CSV sind. Dazu das früheste Datum im Export auswählen";

  function setStatus(msg) {
    statusEl.textContent = msg || "";
  }

  function showError(msg) {
    errorsEl.hidden = false;
    errorsEl.textContent = msg;
  }

  function clearError() {
    errorsEl.hidden = true;
    errorsEl.textContent = "";
  }

  function clearReportSuccess() {
    if (!reportSuccessEl) return;
    reportSuccessEl.hidden = true;
    reportSuccessEl.textContent = "";
  }

  function showReportSuccess(yearCount) {
    if (!reportSuccessEl) return;
    let msg;
    if (yearCount === 0) {
      msg = "Bericht wurde erstellt (keine Daten nach Jahr gruppiert).";
    } else if (yearCount === 1) {
      msg = "Bericht wurde erstellt (1 Kalenderjahr).";
    } else {
      msg = `Bericht wurde erstellt (${yearCount} Kalenderjahre).`;
    }
    reportSuccessEl.textContent = msg;
    reportSuccessEl.hidden = false;
  }

  function syncPrintButton() {
    if (!printBtn) return;
    const toolbar = printBtn.closest(".resultsToolbar");
    const hasReport = yearBoxes.children.length > 0;
    if (toolbar) toolbar.hidden = !hasReport;
  }

  function formatEUR(value) {
    if (value == null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatQty(value, decimals = 8) {
    if (value == null || Number.isNaN(value)) return "—";
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  function parseBSDexDate(raw) {
    const s = (raw || "").trim();
    if (!s) return null;
    // Example: "31.01.2026, 22:24"
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = Number(m[4]);
    const MM = Number(m[5]);
    return new Date(yyyy, mm - 1, dd, HH, MM, 0, 0);
  }

  function stripWeirdSpaces(s) {
    return (s || "").replace(/\u00a0/g, " ").trim();
  }

  function parseLocaleNumber(raw) {
    const s0 = stripWeirdSpaces(raw);
    if (!s0) return null;
    if (s0.includes("–.––")) return null;

    // Remove currency/unit and everything except digits, separators, sign.
    const s1 = s0.replace(/[^\d,.\-+]/g, "");
    if (!s1) return null;

    const hasComma = s1.includes(",");
    const hasDot = s1.includes(".");
    let normalized = s1;
    if (hasComma && hasDot) {
      // In sample CSV: comma thousands, dot decimal.
      normalized = s1.replace(/,/g, "");
    } else if (hasComma && !hasDot) {
      // Decimal comma style.
      normalized = s1.replace(/,/g, ".");
    }

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

  /** RFC4180-style: delimiter may be `;` or `,`; doubled quotes escape. */
  function splitDelimitedRow(line, delimiter) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cur += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCSV(text) {
    const lines = text
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n");
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length < 2) throw new Error("CSV scheint leer zu sein.");
    const first = nonEmpty[0];
    const bySemi = splitDelimitedRow(first, ";");
    const delimiter = bySemi.length > 1 ? ";" : ",";
    const header = delimiter === ";" ? bySemi : splitDelimitedRow(first, ",");
    const rows = nonEmpty.slice(1).map((l) => splitDelimitedRow(l, delimiter));
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
      orderStatus: idx("Order status", 0),
      fillStatus: idx("Fill status", 0),
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
        warnings.push(`Zeile ${r + 2}: Datum konnte nicht interpretiert werden (${get(row, col.created)})`);
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
            warnings.push(`Zeile ${r + 2}: unvollständige Kauf-Handelswerte`);
            continue;
          }
          events.push({
            kind: "trade_buy",
            sourceRow: r + 2,
            timestamp,
            asset,
            qty: qtyIn,
            eur: eurOut,
            feeEUR,
          });
        } else if (side === "Sell") {
          const qtyOut = amount.qty ?? quoteFilled.qty;
          const eurIn = filledEUR;
          if (qtyOut == null || eurIn == null) {
            warnings.push(`Zeile ${r + 2}: unvollständige Verkauf-Handelswerte`);
            continue;
          }
          events.push({
            kind: "trade_sell",
            sourceRow: r + 2,
            timestamp,
            asset,
            qty: qtyOut,
            eur: eurIn,
            feeEUR,
          });
        } else {
          warnings.push(`Zeile ${r + 2}: unbekannte Market-Seite „${side}“`);
        }
      } else if (txType === "Deposits" || txType === "Withdrawals") {
        const asset = stripWeirdSpaces(get(row, col.assetId));
        const amount = get(row, col.amount);
        const parsed = parseAssetAmount(amount);
        const eur = parseLocaleNumber(amount);

        if (!asset && eur != null) {
          events.push({
            kind: txType === "Deposits" ? "fiat_deposit" : "fiat_withdrawal",
            sourceRow: r + 2,
            timestamp,
            eur,
            meta: {
              iban: stripWeirdSpaces(get(row, idx("IBAN", 0))),
            },
          });
        } else if (asset && parsed.qty != null) {
          // Crypto withdrawal / deposit. In sample we saw withdrawals.
          events.push({
            kind: txType === "Withdrawals" ? "transfer_out" : "transfer_in",
            sourceRow: r + 2,
            timestamp,
            asset,
            qty: parsed.qty,
            meta: {
              source: stripWeirdSpaces(get(row, col.sourceAddr)),
              target: stripWeirdSpaces(get(row, col.targetAddr)),
            },
          });
        } else {
          warnings.push(`Zeile ${r + 2}: Ein-/Auszahlungszeile konnte nicht zugeordnet werden`);
        }
      } else {
        // Unknown row type in this export; keep as ignored with warning.
        warnings.push(`Zeile ${r + 2}: nicht unterstützter Transaktionstyp „${txType}“`);
      }
    }

    events.sort((a, b) => a.timestamp - b.timestamp);
    return { events, warnings };
  }

  function fifoProcess(events) {
    const lotsByAsset = new Map();
    const balances = new Map(); // asset -> qty

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

    function pushLot(asset, lot) {
      getLots(asset).push(lot);
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

        segments.push({
          qty: takeQty,
          costEUR: takeCost,
          acquiredAt: lot.acquiredAt,
        });

        if (lot.qtyRemaining <= 1e-12) {
          lots.shift();
        }
      }

      return { segments, shortfallQty: Math.max(0, remaining) };
    }

    const processed = [];
    const inventoryWarnings = [];

    for (const ev of events) {
      if (ev.kind === "trade_buy") {
        const costEUR = ev.eur + (ev.feeEUR || 0);
        pushLot(ev.asset, {
          acquiredAt: ev.timestamp,
          qtyRemaining: ev.qty,
          costEurRemaining: costEUR,
        });
        setBal(ev.asset, getBal(ev.asset) + ev.qty);

        processed.push({
          ...ev,
          year: ev.timestamp.getFullYear(),
          remainingQty: getBal(ev.asset),
          costEUR,
        });
      } else if (ev.kind === "trade_sell") {
        const qty = ev.qty;
        const proceedsEUR = ev.eur - (ev.feeEUR || 0);

        const { segments, shortfallQty } = depleteLots(ev.asset, qty);
        setBal(ev.asset, getBal(ev.asset) - (qty - shortfallQty));

        if (shortfallQty > 1e-12) {
          inventoryWarnings.push(
            `Bestandsdefizit für ${ev.asset}: Verkauf ${formatQty(qty)}, aber nur ${formatQty(
              qty - shortfallQty,
            )} verfügbar am ${formatDate(ev.timestamp)}.`,
          );
        }

        const totalMatchedQty = segments.reduce((s, seg) => s + seg.qty, 0);
        const perQtyProceeds = totalMatchedQty > 0 ? proceedsEUR / totalMatchedQty : 0;

        const disposalSegments = segments.map((seg) => {
          const proceedsSeg = perQtyProceeds * seg.qty;
          const holdingDays = (ev.timestamp - seg.acquiredAt) / (1000 * 60 * 60 * 24);
          const taxable = holdingDays <= 365;
          const gainSeg = proceedsSeg - seg.costEUR;
          return {
            ...seg,
            proceedsEUR: proceedsSeg,
            holdingDays,
            taxable,
            gainEUR: gainSeg,
          };
        });

        const taxableGainEUR = disposalSegments
          .filter((s) => s.taxable)
          .reduce((sum, s) => sum + s.gainEUR, 0);
        const taxFreeGainEUR = disposalSegments
          .filter((s) => !s.taxable)
          .reduce((sum, s) => sum + s.gainEUR, 0);

        const taxableQty = disposalSegments.filter((s) => s.taxable).reduce((sum, s) => sum + s.qty, 0);
        const taxFreeQty = disposalSegments.filter((s) => !s.taxable).reduce((sum, s) => sum + s.qty, 0);

        let taxTag = "taxable";
        if (taxableQty <= 1e-12) taxTag = "taxfree";
        else if (taxFreeQty > 1e-12) taxTag = "partial";

        processed.push({
          ...ev,
          year: ev.timestamp.getFullYear(),
          proceedsEUR,
          disposalSegments,
          taxableGainEUR,
          taxFreeGainEUR,
          taxTag,
          remainingQty: getBal(ev.asset),
          shortfallQty,
        });
      } else if (ev.kind === "transfer_out") {
        const { segments, shortfallQty } = depleteLots(ev.asset, ev.qty);
        setBal(ev.asset, getBal(ev.asset) - (ev.qty - shortfallQty));

        if (shortfallQty > 1e-12) {
          inventoryWarnings.push(
            `Bestandsdefizit für ${ev.asset}: Auszahlung ${formatQty(ev.qty)}, aber nur ${formatQty(
              ev.qty - shortfallQty,
            )} verfügbar am ${formatDate(ev.timestamp)}.`,
          );
        }

        processed.push({
          ...ev,
          year: ev.timestamp.getFullYear(),
          depletionSegments: segments,
          remainingQty: getBal(ev.asset),
          shortfallQty,
        });
      } else if (ev.kind === "transfer_in") {
        // Not in sample: treat as adding inventory with unknown cost basis (0) unless extended later.
        pushLot(ev.asset, {
          acquiredAt: ev.timestamp,
          qtyRemaining: ev.qty,
          costEurRemaining: 0,
        });
        setBal(ev.asset, getBal(ev.asset) + ev.qty);
        processed.push({
          ...ev,
          year: ev.timestamp.getFullYear(),
          remainingQty: getBal(ev.asset),
          costEUR: 0,
          warn: "transfer_in_cost_unknown",
        });
      } else {
        processed.push({
          ...ev,
          year: ev.timestamp.getFullYear(),
        });
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
          sec20: { totalEUR: 0 },
          sec22: { totalEUR: 0 },
          sec23: {
            proceedsEUR: 0,
            costEUR: 0,
            taxableGainEUR: 0,
            taxFreeGainEUR: 0,
            taxableDisposals: 0,
            disposals: 0,
          },
          transactions: [],
        });
      }
      return byYear.get(y);
    }

    for (const tx of processed) {
      const yr = tx.year;
      const bucket = getYear(yr);
      bucket.transactions.push(tx);

      if (tx.kind === "trade_sell") {
        bucket.sec23.disposals += 1;
        bucket.sec23.proceedsEUR += tx.proceedsEUR || 0;
        bucket.sec23.taxableGainEUR += tx.taxableGainEUR || 0;
        bucket.sec23.taxFreeGainEUR += tx.taxFreeGainEUR || 0;

        const cost = (tx.disposalSegments || []).reduce((s, seg) => s + seg.costEUR, 0);
        bucket.sec23.costEUR += cost;

        const taxableQty = (tx.disposalSegments || [])
          .filter((s) => s.taxable)
          .reduce((s, seg) => s + seg.qty, 0);
        if (taxableQty > 1e-12) bucket.sec23.taxableDisposals += 1;
      }
    }

    const years = Array.from(byYear.keys()).sort((a, b) => b - a);
    return years.map((y) => byYear.get(y));
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, String(v));
    }
    for (const ch of children) node.appendChild(ch);
    return node;
  }

  function renderReport(yearSummaries, csvWarnings, inventoryWarnings) {
    yearBoxes.innerHTML = "";
    clearError();

    const allHinweise = [...csvWarnings, ...inventoryWarnings];
    if (allHinweise.length) {
      errorsEl.hidden = false;
      errorsEl.replaceChildren();
      if (inventoryWarnings.length) {
        errorsEl.appendChild(
          el("p", { class: "errorsInventoryBanner", text: INVENTORY_CSV_HINT_DE }),
        );
      }
      const hinweise = el("div", { class: "errorsHinweise" });
      hinweise.appendChild(el("div", { class: "errorsHinweiseTitle", text: "Hinweise:" }));
      for (const w of allHinweise) {
        hinweise.appendChild(el("div", { class: "errorsHinweiseItem", text: `- ${w}` }));
      }
      errorsEl.appendChild(hinweise);
    }

    for (const year of yearSummaries) {
      yearBoxes.appendChild(renderYearBox(year));
    }
    syncPrintButton();
  }

  function renderYearBox(year) {
    const txCount = year.transactions.length;
    const taxable = year.sec23.taxableDisposals;
    const pill = (label, value, cls) =>
      el("div", { class: `pill ${cls || ""}`, text: `${label}: ${value}` });

    const headerLeft = el("div", {}, [
      el("div", { class: "yearTitle", text: String(year.year) }),
      el("div", { class: "yearSub", text: `${txCount} Transaktionen` }),
    ]);

    const headerRight = el("div", { class: "pillRow" }, [
      pill("23. Abs. Veräußerungen", String(year.sec23.disposals), ""),
      pill("Steuerpflichtige Veräußerungen", String(taxable), taxable > 0 ? "bad" : "good"),
    ]);

    const sec23 = el("div", {}, [
      el("div", {
        class: "sectionTitle",
        text: "23. Abs. EStG – Einkünfte aus privaten Veräußerungsgeschäften",
      }),
      el("div", { class: "kv" }, [
        kvItem("Erlöse", formatEUR(year.sec23.proceedsEUR)),
        kvItem("Anschaffungskosten (FIFO)", formatEUR(year.sec23.costEUR)),
        kvItem("Steuerpflichtiger Gewinn/Verlust", formatEUR(year.sec23.taxableGainEUR)),
        kvItem("Steuerfreier Gewinn/Verlust", formatEUR(year.sec23.taxFreeGainEUR)),
      ]),
    ]);

    const sec20 = el("div", {}, [
      el("div", { class: "sectionTitle", text: "20. Abs. EStG – Kapitalerträge" }),
      el("div", { class: "kv" }, [kvItem("Summe", formatEUR(year.sec20.totalEUR))]),
    ]);

    const sec22 = el("div", {}, [
      el("div", { class: "sectionTitle", text: "22. Abs. Nr. 3 EStG – Sonstige Einkünfte" }),
      el("div", { class: "kv" }, [kvItem("Summe", formatEUR(year.sec22.totalEUR))]),
    ]);

    const txTable = renderTxTable(year.transactions);

    return el("div", { class: "yearBox" }, [
      el("div", { class: "yearHeader" }, [headerLeft, headerRight]),
      el("div", { class: "sections" }, [sec23, sec20, sec22, txTable]),
    ]);
  }

  function kvItem(label, value) {
    return el("div", { class: "kvItem" }, [
      el("div", { class: "kvLabel", text: label }),
      el("div", { class: "kvValue", text: value }),
    ]);
  }

  function txTag(tx) {
    if (tx.kind === "trade_buy") return el("span", { class: "tag", text: "KAUF" });
    if (tx.kind === "trade_sell") {
      const cls = tx.taxTag === "taxfree" ? "taxfree" : tx.taxTag === "partial" ? "partial" : "taxable";
      const label =
        tx.taxTag === "taxfree"
          ? "VERKAUF (steuerfrei)"
          : tx.taxTag === "partial"
            ? "VERKAUF (teilweise)"
            : "VERKAUF (steuerpflichtig)";
      return el("span", { class: `tag ${cls}`, text: label });
    }
    if (tx.kind === "transfer_out") return el("span", { class: "tag transfer", text: "ÜBERTRAG (AUS)" });
    if (tx.kind === "fiat_deposit") return el("span", { class: "tag", text: "FIAT-EINZAHLUNG" });
    if (tx.kind === "fiat_withdrawal") return el("span", { class: "tag", text: "FIAT-AUSZAHLUNG" });
    return el("span", { class: "tag warn", text: (tx.kind || "UNBEKANNT").toUpperCase() });
  }

  function renderTxTable(transactions) {
    const table = el("table", { class: "txTable" });
    const thead = el("thead");
    const trh = el("tr");
    for (const h of ["Datum", "Art", "Verkauf / Kauf", "Gebühr", "Steuerliche Wirkung", "Restbestand"]) {
      trh.appendChild(el("th", { text: h }));
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const tx of transactions.slice().sort((a, b) => a.timestamp - b.timestamp)) {
      tbody.appendChild(renderTxRow(tx));
    }
    table.appendChild(tbody);

    return el("div", {}, [table]);
  }

  function formatDate(dt) {
    return new Intl.DateTimeFormat("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(dt);
  }

  function renderTxRow(tx) {
    const row = el("tr");

    const dateCell = el("td", { class: "mono", text: formatDate(tx.timestamp) });
    const typeCell = el("td", {}, [txTag(tx)]);

    const soldBoughtCell = el("td");
    if (tx.kind === "trade_buy") {
      soldBoughtCell.appendChild(
        el("div", { text: `Gekauft: ${formatQty(tx.qty)} ${tx.asset}` }),
      );
      soldBoughtCell.appendChild(
        el("div", { class: "mono", text: `Gezahlt ${formatEUR(tx.eur)} · Anschaffungskosten (inkl. Gebühr) ${formatEUR(tx.costEUR)}` }),
      );
    } else if (tx.kind === "trade_sell") {
      soldBoughtCell.appendChild(
        el("div", { text: `Verkauft: ${formatQty(tx.qty)} ${tx.asset}` }),
      );
      soldBoughtCell.appendChild(
        el("div", { class: "mono", text: `Erhalten ${formatEUR(tx.proceedsEUR)} (brutto ${formatEUR(tx.eur)})` }),
      );
    } else if (tx.kind === "transfer_out") {
      soldBoughtCell.appendChild(el("div", { text: `Gesendet: ${formatQty(tx.qty)} ${tx.asset}` }));
      if (tx.shortfallQty > 1e-12) {
        soldBoughtCell.appendChild(
          el("div", { class: "mono", text: `Defizit: ${formatQty(tx.shortfallQty)} ${tx.asset}` }),
        );
      }
    } else if (tx.kind === "fiat_deposit" || tx.kind === "fiat_withdrawal") {
      soldBoughtCell.appendChild(
        el("div", {
          text: tx.kind === "fiat_deposit" ? `Einzahlung ${formatEUR(tx.eur)}` : `Auszahlung ${formatEUR(tx.eur)}`,
        }),
      );
    } else {
      soldBoughtCell.appendChild(el("div", { text: "—" }));
    }

    const feeCell = el("td", { class: "mono", text: tx.feeEUR ? formatEUR(tx.feeEUR) : "—" });

    const taxCell = el("td");
    if (tx.kind === "trade_sell") {
      const taxable = tx.taxableGainEUR || 0;
      const taxFree = tx.taxFreeGainEUR || 0;
      const tag = tx.taxTag === "taxfree" ? "taxfree" : tx.taxTag === "partial" ? "partial" : "taxable";
      const label =
        tx.taxTag === "taxfree" ? "Steuerfrei" : tx.taxTag === "partial" ? "Teilweise" : "Steuerpflichtig";
      taxCell.appendChild(el("span", { class: `tag ${tag}`, text: label }));
      taxCell.appendChild(el("div", { class: "mono", text: `Steuerpflichtiger Gewinn: ${formatEUR(taxable)}` }));
      taxCell.appendChild(el("div", { class: "mono", text: `Steuerfreier Gewinn: ${formatEUR(taxFree)}` }));
    } else if (tx.kind === "transfer_out") {
      taxCell.appendChild(el("span", { class: "tag transfer", text: "Nicht steuerrelevant (Übertrag)" }));
    } else {
      taxCell.appendChild(el("div", { text: "—" }));
    }

    const remainingCell = el("td", { class: "mono" });
    if (tx.asset) remainingCell.textContent = `${formatQty(tx.remainingQty)} ${tx.asset}`;
    else remainingCell.textContent = "—";

    row.appendChild(dateCell);
    row.appendChild(typeCell);
    row.appendChild(soldBoughtCell);
    row.appendChild(feeCell);
    row.appendChild(taxCell);
    row.appendChild(remainingCell);
    return row;
  }

  async function handleFile(file) {
    clearError();
    clearReportSuccess();
    yearBoxes.innerHTML = "";
    syncPrintButton();
    if (!file) return;

    try {
      fileMeta.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
      setStatus("Datei wird gelesen …");
      const text = await file.text();

      setStatus("CSV wird ausgewertet …");
      const parsed = parseCSV(text);

      setStatus("Zeilen werden normalisiert …");
      const { events, warnings } = normalizeEvents(parsed);

      setStatus("FIFO und Haltefrist werden angewendet …");
      const { processed, inventoryWarnings } = fifoProcess(events);

      setStatus("Bericht wird erstellt …");
      const years = summarizeByYear(processed);
      renderReport(years, warnings, inventoryWarnings);

      showReportSuccess(years.length);
      setStatus(`Fertig. ${events.length} relevante Ereignisse verarbeitet.`);
    } catch (err) {
      console.error(err);
      clearReportSuccess();
      showError(err instanceof Error ? err.message : String(err));
      setStatus("Fehler.");
      syncPrintButton();
    }
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onDrop(e) {
    preventDefaults(e);
    dropzone.classList.remove("dragOver");
    const file = e.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  }

  function onDragOver(e) {
    preventDefaults(e);
    dropzone.classList.add("dragOver");
  }

  function onDragLeave(e) {
    preventDefaults(e);
    dropzone.classList.remove("dragOver");
  }

  dropzone.addEventListener("dragenter", onDragOver);
  dropzone.addEventListener("dragover", onDragOver);
  dropzone.addEventListener("dragleave", onDragLeave);
  dropzone.addEventListener("drop", onDrop);

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  });

  printBtn?.addEventListener("click", () => {
    window.print();
  });
})();
