const { QUALITIES, POLL_INTERVAL } = require("../config");
const { fetchMarket } = require("./api");
const { computeETA, MAX_HISTORY } = require("./eta");
const { saveDucksBulk, getDuckHistory, getAllActiveDucks } = require("../db/ducks");
const { handleEvent } = require("../services/alert.service");

// Pozíció memória — csak runtime, restart esetén resetelődik (ez OK)
let lastPositions = {};
let firstScanDone = false;

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

  console.log(`📊 ${quality}: ${all.length} ducks`);

  const now = Date.now();
  const toSave = [];

  for (let i = 0; i < all.length; i++) {
    const d = all[i];
    const pos = i + 1;
    const id = d.id;

    const history = getDuckHistory(id, MAX_HISTORY);
    const historyWithCurrent = [...history, { position: pos, timestamp: now }];
    const etaResult = computeETA(id, historyWithCurrent, pos);

    toSave.push({
      id,
      quality: d.quality || quality,
      level: d.level || 0,
      ownerId: d.playerId,
      position: pos,
      eta_low: etaResult.eta_low,
      eta_high: etaResult.eta_high,
      confidence: etaResult.confidence,
      speed_avg: etaResult.speed_avg,
      timestamp: now
    });

    // Csak az első scan után küldünk alertet (különben spam az indulásnál)
    if (firstScanDone) {
      const prev = lastPositions[id];
      if (prev !== undefined && prev !== pos) {
        handleEvent({
          type: "POSITION_CHANGE",
          duckId: id,
          from: prev,
          to: pos,
          ownerId: d.playerId,
          eta_low: etaResult.eta_low,
          eta_high: etaResult.eta_high,
          confidence: etaResult.confidence
        });
      }
    }

    lastPositions[id] = pos;
  }

  saveDucksBulk(toSave);
}

async function checkSnipers() {
  const { getAllActiveSnipers, updateLastNotified } = require("../db/snipers");
  const snipers = getAllActiveSnipers();
  if (!snipers.length) return;

  const allDucks = getAllActiveDucks();
  // 30 perc cooldown hogy ne spamelje ugyanazt a találatot
  const COOLDOWN = 30 * 60 * 1000;

  for (const sniper of snipers) {
    const now = Date.now();
    if (sniper.last_notified && (now - sniper.last_notified) < COOLDOWN) continue;

    const matches = allDucks.filter(d => {
      if (sniper.quality && d.quality !== sniper.quality) return false;
      if (sniper.level && d.level < sniper.level) return false;
      if (sniper.collection && d.collection !== sniper.collection) return false;
      // Pozíció alapú: ha a kacsa elérte vagy átlépte a küszöböt
      return d.position <= sniper.position_threshold;
    });

    if (matches.length > 0) {
      handleEvent({
        type: "SNIPER_HIT",
        chatId: sniper.chatId,
        sniperId: sniper.id,
        ducks: matches.slice(0, 5)
      });
      updateLastNotified(sniper.id);
    }
  }
}

async function runScanner() {
  while (true) {
    console.log("\n🔁 NEW SCAN —", new Date().toLocaleTimeString());

    for (const q of QUALITIES) {
      await scanQuality(q);
    }

    // Első teljes scan után kapcsoljuk be az alerteket
    if (!firstScanDone) {
      firstScanDone = true;
      console.log("✅ First scan complete — alerts active");
    }

    await checkSnipers();
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

module.exports = { runScanner };
