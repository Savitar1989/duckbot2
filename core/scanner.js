const { QUALITIES, POLL_INTERVAL } = require("../config");
const { fetchMarket, fetchRecentSales } = require("./api");
const { computeETA } = require("./eta");
const { saveDucksBulk } = require("../db/ducks");
const { saveSalesBulk } = require("../db/sales");
const { handleEvent } = require("../services/alert.service");

const state = new Map();
const lastAlert = new Map();

const MIN_MOVE = 3;
const ALERT_COOLDOWN = 15000;

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

    let eta = { eta_low: null, eta_high: null, confidence: 0, speed_avg: null };
    if (!prev || prev.position !== pos) {
      eta = computeETA(id, [{ position: pos, timestamp: now }], pos);
    }

    const current = {
      id,
      quality: d.quality || quality,
      level: d.level || 0,
      ownerId: d.playerId,
      position: pos,
      ...eta,
      timestamp: now
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

  saveDucksBulk(toSave);
}

async function scanSales() {
  const sales = await fetchRecentSales();
  if (!sales.length) return;

  const mapped = sales.map(s => ({
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

    await Promise.all(QUALITIES.map(scanQuality));

    await scanSales();

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

module.exports = { runScanner };