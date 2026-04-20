const { QUALITIES, POLL_INTERVAL } = require("../config");
const { fetchMarket, fetchRecentSales } = require("./api");
const { computeETA, MAX_HISTORY } = require("./eta");
const { saveDucksBulk, getDuckHistory } = require("../db/ducks");
const { saveSalesBulk } = require("../db/sales");
const { handleEvent } = require("../services/alert.service");

const state = new Map();
const lastAlert = new Map();

const MIN_MOVE = 3;
const ALERT_COOLDOWN = 15000;
const SALES_POLL_INTERVAL = 60000;

let lastSalesScanAt = 0;

async function scanQuality(quality) {
  let offset = 0;
  let all = [];

  while (true) {
    const data = await fetchMarket(quality, offset);
    if (!data || !data.length) break;
    all = all.concat(data);
    offset += 20;
    if (data.length < 20) break;
  }

  const now = Date.now();
  const toSave = [];
  const currentIds = new Set();

  for (let i = 0; i < all.length; i++) {
    const d = all[i];
    const pos = i + 1;
    const id = d.id;
    currentIds.add(id);

    const prev = state.get(id);

    let historyRows;
    if (!prev) {
      historyRows = getDuckHistory(id, MAX_HISTORY);
    } else {
      historyRows = prev.historyRows || [];
    }

    const currentSnapshot = { position: pos, timestamp: now };
    historyRows = [...historyRows, currentSnapshot].slice(-MAX_HISTORY);

    const eta = computeETA(id, historyRows, pos);

    const current = {
      id,
      quality: d.quality || quality,
      level: d.level || 0,
      ownerId: d.playerId,
      position: pos,
      ...eta,
      timestamp: now,
      historyRows
    };

    toSave.push(current);

    if (prev) {
      const moved = Math.abs(prev.position - pos);
      if (moved >= MIN_MOVE) {
        const last = lastAlert.get(id) || 0;
        if (Date.now() - last > ALERT_COOLDOWN) {
          handleEvent({
            type: "POSITION_CHANGE",
            duckId: id,
            from: prev.position,
            to: pos,
            ownerId: current.ownerId,
            ...eta
          });
          lastAlert.set(id, Date.now());
        }
      }
    }

    state.set(id, current);
  }

  for (const id of state.keys()) {
    if (!currentIds.has(id)) {
      handleEvent({ type: "DUCK_REMOVED", duckId: id });
      state.delete(id);
    }
  }

  saveDucksBulk(toSave.map(({ historyRows: _historyRows, ...rest }) => rest));
}

async function scanSales() {
  const sales = await fetchRecentSales();
  if (!sales.length) return;

  const mapped = sales.map((s) => ({
    duckId: s.id,
    quality: s.quality,
    level: s.level,
    size: s.size,
    price: s.price,
    currency: s.currency,
    timestamp: Date.now()
  }));

  saveSalesBulk(mapped);
}

async function runScanner() {
  while (true) {
    console.log("\n🔁 NEW SCAN —", new Date().toLocaleTimeString());

    for (const quality of QUALITIES) {
      await scanQuality(quality);
    }

    const now = Date.now();
    if (now - lastSalesScanAt >= SALES_POLL_INTERVAL) {
      await scanSales();
      lastSalesScanAt = now;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

module.exports = { runScanner };