// ============================================================================
// SDS ALGO — 24/7 GITHUB CLOUD SCANNER (PRE-CONFIGURED WITH SDS-ALGO-2 RELAY)
// Zero CPU Limits • Zero Subrequest Limits • Permanent opt_cache.json Memory
// ============================================================================

import fs from "fs";

const CONFIG = {
  // PRE-CONFIGURED WITH YOUR CLOUDFLARE WORKER RELAY URL:
  CF_RELAY_URL: (process.env.CF_RELAY_URL || "https://sds-algo-2.denethsds.workers.dev").trim().replace(/\/+$/, ""),

  TIMEFRAME_INTERVAL: process.env.TIMEFRAME_INTERVAL || "3", // "3" for 3m testing, change to "15" for 15m
  MIN_CLOSED_TRADES: 8,
  TARGET_RR: 1.5,
  SL_BUFFER_PCT: 0.05,
  TARGET_BARS: 2995,
  REOPTIMIZE_INTERVAL_MS: 6 * 3600 * 1000,

  AUTO_TRADE_ENABLED: true,
  LEVERAGE: 10,
  RISK_PER_TRADE_USD: 10,
  MAX_NOTIONAL_USD: 1500,
  MIN_TP_SPOT_PCT: 0.25, // 0.25% for 3m testing (change to 0.65 for 15m)

  BYBIT_DEMO_API_KEY: (process.env.BYBIT_DEMO_API_KEY || "").trim(),
  BYBIT_DEMO_SECRET:  (process.env.BYBIT_DEMO_SECRET || "").trim(),
  TG_BOT_TOKEN:       (process.env.TG_BOT_TOKEN || "").trim(),
  TG_CHAT_ID:         (process.env.TG_CHAT_ID || "").trim()
};

const ALL_24_PAIRS = [
  "BTCUSDT", "ETHUSDT", "ADAUSDT", "LTCUSDT", "AVAXUSDT", "APTUSDT",
  "SOLUSDT", "BNBUSDT", "XRPUSDT", "LINKUSDT", "SUIUSDT", "INJUSDT",
  "NEARUSDT", "FETUSDT", "RENDERUSDT", "DOGEUSDT", "SEIUSDT", "TIAUSDT",
  "ARBUSDT", "OPUSDT", "ORDIUSDT", "WLDUSDT", "AAVEUSDT", "TONUSDT"
];

const FALLBACK_SPECS = {
  BTCUSDT:    { dec: 1, qtyStep: "0.001", tickSize: "0.1",     minQty: 0.001 },
  ETHUSDT:    { dec: 2, qtyStep: "0.01",  tickSize: "0.01",    minQty: 0.01 },
  ADAUSDT:    { dec: 4, qtyStep: "1",     tickSize: "0.0001",  minQty: 1 },
  LTCUSDT:    { dec: 2, qtyStep: "0.1",   tickSize: "0.01",    minQty: 0.1 },
  AVAXUSDT:   { dec: 2, qtyStep: "0.1",   tickSize: "0.01",    minQty: 0.1 },
  APTUSDT:    { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  SOLUSDT:    { dec: 2, qtyStep: "0.1",   tickSize: "0.01",    minQty: 0.1 },
  BNBUSDT:    { dec: 2, qtyStep: "0.01",  tickSize: "0.01",    minQty: 0.01 },
  XRPUSDT:    { dec: 4, qtyStep: "1",     tickSize: "0.0001",  minQty: 1 },
  LINKUSDT:   { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  SUIUSDT:    { dec: 4, qtyStep: "1",     tickSize: "0.0001",  minQty: 1 },
  INJUSDT:    { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  NEARUSDT:   { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  FETUSDT:    { dec: 4, qtyStep: "1",     tickSize: "0.0001",  minQty: 1 },
  RENDERUSDT: { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  DOGEUSDT:   { dec: 5, qtyStep: "1",     tickSize: "0.00001", minQty: 1 },
  SEIUSDT:    { dec: 4, qtyStep: "1",     tickSize: "0.0001",  minQty: 1 },
  TIAUSDT:    { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  ARBUSDT:    { dec: 4, qtyStep: "0.1",   tickSize: "0.0001",  minQty: 0.1 },
  OPUSDT:     { dec: 4, qtyStep: "0.1",   tickSize: "0.0001",  minQty: 0.1 },
  ORDIUSDT:   { dec: 2, qtyStep: "0.01",  tickSize: "0.01",    minQty: 0.01 },
  WLDUSDT:    { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 },
  AAVEUSDT:   { dec: 2, qtyStep: "0.01",  tickSize: "0.01",    minQty: 0.01 },
  TONUSDT:    { dec: 3, qtyStep: "0.1",   tickSize: "0.001",   minQty: 0.1 }
};

const ZZ_GRID  = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
const ERR_GRID = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10];
const CACHE_FILE = "./opt_cache.json";

async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "User-Agent": "Mozilla/5.0", ...(options.headers || {}) }
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  } catch (_) {
    return null;
  }
}

function buildBybitMarketUrl(bybitPath, queryString) {
  return `${CONFIG.CF_RELAY_URL}/?bybit_path=${encodeURIComponent(bybitPath)}&${queryString}`;
}

function loadPersistentCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf8").trim();
      if (raw.startsWith("{")) return JSON.parse(raw);
    }
  } catch (_) {}
  return { activeInterval: "", optParams: {}, executedSignalKeys: [] };
}

function savePersistentCache(cacheObj) {
  try {
    if (cacheObj.executedSignalKeys.length > 500) {
      cacheObj.executedSignalKeys = cacheObj.executedSignalKeys.slice(-500);
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2), "utf8");
  } catch (_) {}
}

function countDecimalsFromStep(stepStr) {
  const s = String(stepStr).trim();
  if (!s.includes(".")) return 0;
  return s.split(".")[1].replace(/0+$/, "").length;
}

function formatByStep(value, stepStr, roundDown = true) {
  const step = parseFloat(stepStr);
  if (!step || step <= 0) return String(value);
  const dec = countDecimalsFromStep(stepStr);
  const inv = 1 / step;
  const scaled = value * inv;
  const units = roundDown ? Math.floor(scaled + 1e-8) : Math.round(scaled);
  return (units / inv).toFixed(dec);
}

async function fetchInstrumentSpecs() {
  const specs = { ...FALLBACK_SPECS };
  const url = buildBybitMarketUrl("/v5/market/instruments-info", "category=linear&limit=1000");
  const json = await safeFetchJson(url);
  for (const item of json?.result?.list || []) {
    if (ALL_24_PAIRS.includes(item.symbol)) {
      const tickSize = item.priceFilter?.tickSize || specs[item.symbol]?.tickSize || "0.01";
      const qtyStep  = item.lotSizeFilter?.qtyStep || specs[item.symbol]?.qtyStep || "0.1";
      specs[item.symbol] = {
        tickSize,
        dec: countDecimalsFromStep(tickSize),
        qtyStep,
        minQty: parseFloat(item.lotSizeFilter?.minOrderQty || qtyStep)
      };
    }
  }
  return specs;
}

async function fetchActivePositionsSet() {
  const set = new Set();
  const res = await safeFetchJson(CONFIG.CF_RELAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "get_positions",
      apiKey: CONFIG.BYBIT_DEMO_API_KEY,
      apiSecret: CONFIG.BYBIT_DEMO_SECRET
    })
  });
  if (res?.retCode === 0 && Array.isArray(res.result?.list)) {
    for (const p of res.result.list) {
      if (parseFloat(p.size || "0") > 0) set.add(p.symbol);
    }
  }
  return set;
}

async function placeBybitBracketOrderViaRelay(sig, spec, openPositionsSet) {
  const symbol = sig.symbol;
  if (openPositionsSet.has(symbol)) {
    return { executed: false, error: `Skipped: Active position already open on ${symbol}` };
  }

  const side = sig.direction === "LONG" ? "Buy" : "Sell";
  const slDist = Math.abs(sig.entry - sig.sl);
  const rawQty = slDist > 0 ? (CONFIG.RISK_PER_TRADE_USD / slDist) : spec.minQty;
  const maxQty = CONFIG.MAX_NOTIONAL_USD / sig.entry;
  let qtyStr = formatByStep(Math.max(spec.minQty, Math.min(rawQty, maxQty)), spec.qtyStep, true);
  if (parseFloat(qtyStr) < spec.minQty) qtyStr = formatByStep(spec.minQty, spec.qtyStep, false);

  const slStr = formatByStep(sig.sl, spec.tickSize, false);
  const tpStr = formatByStep(sig.tp, spec.tickSize, false);

  const orderRes = await safeFetchJson(CONFIG.CF_RELAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: CONFIG.BYBIT_DEMO_API_KEY,
      apiSecret: CONFIG.BYBIT_DEMO_SECRET,
      symbol,
      side,
      qty: qtyStr,
      sl: slStr,
      tp: tpStr,
      leverage: CONFIG.LEVERAGE,
      skipIfOpen: true
    })
  });

  if (!orderRes) {
    return { executed: false, error: "Relay returned empty/invalid response" };
  }
  if (orderRes.executed) openPositionsSet.add(symbol);
  return orderRes;
}

async function fetchClosedKlinePage(symbol, intervalStr, limit = 1000, endTime = null) {
  const tfMin = parseInt(intervalStr, 10) || 3;
  const barMs = tfMin * 60 * 1000;
  const currentBarOpenTime = Math.floor(Date.now() / barMs) * barMs;
  const endParam = endTime ? `&end=${endTime}` : "";
  const qs = `category=linear&symbol=${symbol}&interval=${intervalStr}&limit=${limit}${endParam}`;

  // Route through your Cloudflare Worker Relay to bypass US IP geoblocks
  let json = await safeFetchJson(buildBybitMarketUrl("/v5/market/kline", qs));
  if (!json?.result?.list) {
    json = await safeFetchJson(`https://api.bybit.com/v5/market/kline?${qs}`);
  }

  const list = json?.result?.list || [];
  return list
    .map(k => ({
      time: Number(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4])
    }))
    .filter(c => c.time < currentBarOpenTime)
    .reverse();
}

async function fetchFull2995Candles(symbol, intervalStr) {
  const p1 = await fetchClosedKlinePage(symbol, intervalStr, 1000, null);
  if (p1.length < 50) return p1;
  const p2 = await fetchClosedKlinePage(symbol, intervalStr, 1000, p1[0].time - 1);
  let p3 = [];
  if (p2.length > 50) {
    p3 = await fetchClosedKlinePage(symbol, intervalStr, 1000, p2[0].time - 1);
  }
  const map = new Map();
  [...p3, ...p2, ...p1].forEach(c => map.set(c.time, c));
  const sorted = Array.from(map.values()).sort((a, b) => a.time - b.time);
  if (sorted.length > CONFIG.TARGET_BARS) sorted.splice(0, sorted.length - CONFIG.TARGET_BARS);
  return sorted;
}

function computeAtr14Series(candles) {
  const n = candles.length;
  const atr14 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const tr = i === 0
      ? candles[0].high - candles[0].low
      : Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        );
    atr14[i] = i === 0 ? tr : (atr14[i - 1] * 13 + tr) / 14;
  }
  return atr14;
}

function extractPivotEventsForZZ(candles, zzLen) {
  const n = candles.length;
  const halfZz = Math.floor(zzLen / 2);
  const zz_p = [], zz_i = [];
  let dir = 0;
  const events = [];

  for (let i = zzLen; i < n; i++) {
    let ph = -Infinity, pl = Infinity;
    for (let k = i - zzLen + 1; k <= i; k++) {
      if (candles[k].high > ph) ph = candles[k].high;
      if (candles[k].low < pl)  pl = candles[k].low;
    }
    const midIdx = i - halfZz;
    const is_ph = candles[midIdx].high === ph;
    const is_pl = candles[midIdx].low === pl;

    let new_pivot = false;
    if (dir >= 0 && is_pl) {
      zz_p.unshift(candles[midIdx].low);
      zz_i.unshift(midIdx);
      dir = -1;
      new_pivot = true;
    } else if (dir <= 0 && is_ph) {
      zz_p.unshift(candles[midIdx].high);
      zz_i.unshift(midIdx);
      dir = 1;
      new_pivot = true;
    }
    if (zz_p.length > 10) { zz_p.pop(); zz_i.pop(); }

    if (new_pivot && zz_p.length >= 4) {
      events.push({ barIdx: i, pC: zz_p[0], pB: zz_p[1], pA: zz_p[2], pX: zz_p[3] });
    }
  }
  return events;
}

function evaluateCombo(candles, pivotEvents, baseErr, atr14) {
  const n = candles.length;
  let openUntilBar = -1;
  let countTp = 0, countSl = 0;
  let lastBarSignal = null;

  for (let e = 0; e < pivotEvents.length; e++) {
    const ev = pivotEvents[e];
    const i = ev.barIdx;
    if (i <= openUntilBar) continue;

    const curAtr = atr14[i];
    const d_XA = Math.abs(ev.pA - ev.pX);
    const d_AB = Math.abs(ev.pB - ev.pA);
    const r_XB = d_XA === 0 ? 0 : d_AB / d_XA;
    const is_bull = ev.pX < ev.pA;

    let pat = null, ratio = 0.0;
    if (Math.abs(r_XB - 0.618) <= baseErr) { pat = "Gartley"; ratio = 0.786; }
    else if (r_XB >= 0.382 && r_XB <= 0.50) { pat = "Bat"; ratio = 0.886; }
    else if (Math.abs(r_XB - 0.786) <= baseErr) { pat = "Butterfly"; ratio = 1.27; }
    else if (r_XB >= 0.382 && r_XB <= 0.618) { pat = "Crab"; ratio = 1.618; }
    if (!pat) continue;

    const tgt = is_bull ? (ev.pA - d_XA * ratio) : (ev.pA + d_XA * ratio);
    const dist_cd = Math.abs(ev.pC - tgt);
    const tp2_base = is_bull ? ev.pC - (dist_cd * 0.618) : ev.pC + (dist_cd * 0.618);
    const tp3_ghost = is_bull ? (ev.pC - curAtr * 12.0) : (ev.pC + curAtr * 12.0);
    const tp_hist = tp2_base + (tp3_ghost - tp2_base) * 0.618;

    const struct_sl = is_bull
      ? Math.max(ev.pA, ev.pC) * (1 + CONFIG.SL_BUFFER_PCT / 100)
      : Math.min(ev.pA, ev.pC) * (1 - CONFIG.SL_BUFFER_PCT / 100);

    const s_price = candles[i].close;
    const dist_reward = Math.abs(s_price - tp_hist);
    const required_risk_1_5 = dist_reward / CONFIG.TARGET_RR;

    let sl_hist = struct_sl;
    if (Math.abs(s_price - struct_sl) <= required_risk_1_5) {
      sl_hist = is_bull ? (s_price + required_risk_1_5) : (s_price - required_risk_1_5);
    }

    let valid = true;
    if (is_bull && (sl_hist <= s_price || tp_hist >= s_price)) valid = false;
    else if (!is_bull && (sl_hist >= s_price || tp_hist <= s_price)) valid = false;
    if (Math.abs(tp_hist - s_price) < Math.abs(s_price - sl_hist) * (CONFIG.TARGET_RR - 0.02)) valid = false;
    if (!valid) continue;

    let status = "OPEN";
    let closeBar = n - 1;
    for (let k = i + 1; k < n; k++) {
      const ck = candles[k];
      let hit_tp = false, hit_sl = false;
      if (is_bull) {
        if (ck.low <= tp_hist) hit_tp = true;
        if (ck.high >= sl_hist && !hit_tp) hit_sl = true;
      } else {
        if (ck.high >= tp_hist) hit_tp = true;
        if (ck.low <= sl_hist && !hit_tp) hit_sl = true;
      }
      if (hit_tp || hit_sl) {
        status = hit_tp ? "TP" : "SL";
        closeBar = k;
        break;
      }
    }

    openUntilBar = closeBar;
    if (status === "TP") countTp++;
    else if (status === "SL") countSl++;

    if (i === n - 1) {
      const tpSpotPct = (Math.abs(tp_hist - s_price) / s_price) * 100;
      if (tpSpotPct >= CONFIG.MIN_TP_SPOT_PCT) {
        lastBarSignal = {
          barTime: candles[i].time,
          direction: is_bull ? "SHORT" : "LONG",
          pattern: pat,
          r_XB: r_XB.toFixed(3),
          entry: s_price,
          sl: sl_hist,
          tp: tp_hist,
          tp10xPct: (tpSpotPct * 10).toFixed(1)
        };
      }
    }
  }

  const totalClosed = countTp + countSl;
  const winRate = totalClosed > 0 ? (countTp / totalClosed) * 100 : 0;
  const netR = countTp * CONFIG.TARGET_RR - countSl * 1.0;
  return { countTp, countSl, totalClosed, winRate, netR, lastBarSignal };
}

async function sendTelegramAlert(sig, orderRes, tfLabel, dec) {
  if (!CONFIG.TG_BOT_TOKEN || !CONFIG.TG_CHAT_ID) return;
  const ordBlock = orderRes?.executed
    ? `\n🤖 BYBIT V5 DEMO ORDER PLACED:\n• ${orderRes.side} ${orderRes.qty} ${sig.symbol} (#${orderRes.orderId})\n• SL: ${orderRes.sl} | TP: ${orderRes.tp}`
    : `\n⚠️ BYBIT DEMO ORDER: ${orderRes?.error || "Skipped"}`;

  const text =
    `🚨 [GITHUB 24/7 CLOUD] SDS ${tfLabel} ${sig.direction}: ${sig.symbol}\n` +
    `Pattern: ${sig.pattern} (r_XB=${sig.r_XB})\n` +
    `Locked 2,995-Bar Opt: ZZ=${sig.zz}, Err=${sig.err.toFixed(2)} (${sig.winRate}% WR | ${sig.wins}W/${sig.losses}L)\n` +
    `Entry: ${sig.entry.toFixed(dec)} | SL: ${sig.sl.toFixed(dec)} | TP: ${sig.tp.toFixed(dec)} (+${sig.tp10xPct}% @ 10x)` +
    ordBlock;

  await safeFetchJson(`https://api.telegram.org/bot${CONFIG.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CONFIG.TG_CHAT_ID, text })
  });
}

async function main() {
  const tf = CONFIG.TIMEFRAME_INTERVAL;
  const tfLabel = `${tf}M`;
  const cache = loadPersistentCache();

  if (cache.activeInterval !== tf) {
    cache.activeInterval = tf;
    cache.optParams = {};
  }

  const specs = await fetchInstrumentSpecs();
  const openPositionsSet = await fetchActivePositionsSet();
  const executedSet = new Set(cache.executedSignalKeys || []);
  let scannedCount = 0;

  for (const sym of ALL_24_PAIRS) {
    const candles = await fetchFull2995Candles(sym, tf);
    if (candles.length < 100) {
      console.log(`⚠️ ${sym}: Only ${candles.length} candles returned (make sure Universal Proxy code is deployed on sds-algo-2.denethsds.workers.dev)`);
      continue;
    }
    scannedCount++;

    const atr14 = computeAtr14Series(candles);
    let opt = cache.optParams[sym];
    const isExpired = !opt || (Date.now() - opt.optimizedAt) > CONFIG.REOPTIMIZE_INTERVAL_MS || opt.barsTested < 2800;

    if (isExpired) {
      const candidates = [];
      for (const zz of ZZ_GRID) {
        const pivs = extractPivotEventsForZZ(candles, zz);
        for (const err of ERR_GRID) {
          const r = evaluateCombo(candles, pivs, err, atr14);
          candidates.push({ zz, err, ...r });
        }
      }
      let qual = candidates.filter(c => c.totalClosed >= CONFIG.MIN_CLOSED_TRADES);
      if (!qual.length) qual = candidates.filter(c => c.totalClosed >= 3);
      if (!qual.length) qual = candidates;
      qual.sort((a, b) => Math.abs(b.winRate - a.winRate) > 0.05 ? b.winRate - a.winRate : b.netR - a.netR);
      const w = qual[0];
      opt = {
        zz: w.zz,
        err: w.err,
        winRate: Number(w.winRate.toFixed(1)),
        wins: w.countTp,
        losses: w.countSl,
        barsTested: candles.length,
        optimizedAt: Date.now()
      };
      cache.optParams[sym] = opt;
    }

    console.log(`✅ ${sym} (${candles.length} bars): Opt ZZ=${opt.zz}, Err=${opt.err} (${opt.winRate}% WR | ${opt.wins}W/${opt.losses}L)`);

    const winningPivots = extractPivotEventsForZZ(candles, opt.zz);
    const liveEval = evaluateCombo(candles, winningPivots, opt.err, atr14);

    if (liveEval.lastBarSignal) {
      const dedupeKey = `${tf}_${sym}_${liveEval.lastBarSignal.barTime}`;
      if (!executedSet.has(dedupeKey)) {
        executedSet.add(dedupeKey);
        const sig = { symbol: sym, ...liveEval.lastBarSignal, ...opt };
        const spec = specs[sym] || { tickSize: "0.01", dec: 2, qtyStep: "0.1", minQty: 0.1 };
        const orderRes = await placeBybitBracketOrderViaRelay(sig, spec, openPositionsSet);
        await sendTelegramAlert(sig, orderRes, tfLabel, spec.dec);
        console.log(`🚨 Signal Executed: ${sym} ${sig.direction}`, orderRes);
      }
    }
  }

  cache.executedSignalKeys = Array.from(executedSet);
  savePersistentCache(cache);
  console.log(`🎯 Completed 2,995-bar scan across ${scannedCount}/${ALL_24_PAIRS.length} pairs on ${tfLabel}`);
}

main().catch(err => {
  console.error("Scanner error:", err);
  process.exit(1);
});
