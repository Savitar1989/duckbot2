const { getAlertUsers } = require("../db/alerts");
const { getPlayerId } = require("../db/users");
const { formatETARange } = require("../core/eta");

let bot = null;

function registerBot(instance) {
  bot = instance;
}

async function handleEvent(event) {
  if (!bot) return;

  // ── Position change alert
  if (event.type === "POSITION_CHANGE") {
    const users = getAlertUsers("POSITION");

    for (const alertRow of users) {
      const chatId = alertRow.chatId;
      const playerId = getPlayerId(chatId);

      // Csak a kacsa tulajdonosának küldünk
      if (!playerId || event.ownerId !== playerId) continue;

      const threshold = alertRow.threshold;

      // Ha van threshold: értesítés csak akkor ha a kacsa ELÉRTE vagy ÁTLÉPTE
      // (pozíció csökken ahogy a kacsa előre jön → from > threshold && to <= threshold)
      if (threshold) {
        const crossed = event.from > threshold && event.to <= threshold;
        if (!crossed) continue;
      }
      // Ha nincs threshold: minden változásnál értesítés

      const eta = formatETARange(event.eta_low, event.eta_high, event.confidence);
      const arrow = event.to < event.from ? "⬆️" : "⬇️";

      await bot.telegram.sendMessage(
        chatId,
        `📍 *Pozíció változás!*\n\n` +
        `Duck #${event.duckId}\n` +
        `${arrow} ${event.from} → ${event.to}\n` +
        `${eta}`,
        { parse_mode: "Markdown" }
      ).catch(e => console.error("Alert send error:", e.message));
    }
  }

  // ── Sniper hit
  if (event.type === "SNIPER_HIT") {
    const ducks = event.ducks || [];
    let msg = `🎯 *Duck Sniper Alert!*\n\nA keresett kacsák elérték a pozíció küszöböt:\n\n`;

    for (const d of ducks) {
      const qe = { COMMON:"⚪", UNCOMMON:"🟢", RARE:"🔵", EPIC:"🟣", LEGENDARY:"🟡" }[d.quality] || "⚪";
      const eta = formatETARange(d.eta_low, d.eta_high, d.confidence);
      msg += `${qe} ${d.quality} Lvl${d.level} — #${d.position}. pozíció\n`;
      msg += `  ${eta}\n\n`;
    }

    await bot.telegram.sendMessage(event.chatId, msg, { parse_mode: "Markdown" })
      .catch(e => console.error("Sniper send error:", e.message));
  }
}

module.exports = { registerBot, handleEvent };
