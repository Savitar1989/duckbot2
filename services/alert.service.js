const { getAlertUsers } = require(”../db/alerts”);
const { formatETARange } = require(”../core/eta”);

let bot = null;

function registerBot(instance) {
bot = instance;
}

const sentCache = new Map();
const MIN_MOVE = 3;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour — evict old entries

// Periodic cleanup so sentCache never grows unbounded
setInterval(() => {
const now = Date.now();
for (const [key, ts] of sentCache.entries()) {
if (now - ts > CACHE_TTL_MS) sentCache.delete(key);
}
}, CACHE_TTL_MS);

async function handleEvent(event) {
if (!bot) return;

if (event.type === “POSITION_CHANGE”) {
const users = getAlertUsers(“POSITION”);

```
const promises = [];

for (const alertRow of users) {
  const chatId = alertRow.chatId;
  const playerId = alertRow.playerId;

  if (!playerId || event.ownerId !== playerId) continue;

  const threshold = alertRow.threshold;

  if (threshold) {
    const crossed = event.from > threshold && event.to <= threshold;
    if (!crossed) continue;
  } else {
    if (Math.abs(event.from - event.to) < MIN_MOVE) continue;
  }

  const key = `${chatId}_${event.duckId}_${event.to}`;
  if (sentCache.has(key)) continue;
  sentCache.set(key, Date.now());

  const eta = formatETARange(event.eta_low, event.eta_high, event.confidence);
  const arrow = event.to < event.from ? "⬆️" : "⬇️";

  promises.push(
    bot.telegram.sendMessage(
      chatId,
      `📍 *Pozíció változás!*\n\nDuck #${event.duckId}\n${arrow} ${event.from} → ${event.to}\n${eta}`,
      { parse_mode: "Markdown" }
    )
  );
}

await Promise.allSettled(promises);
```

}

if (event.type === “SNIPER_HIT”) {
const ducks = event.ducks || [];
let msg = `🎯 *Duck Sniper Alert!*\n\n`;

```
for (const d of ducks) {
  const qe = { COMMON:"⚪", UNCOMMON:"🟢", RARE:"🔵", EPIC:"🟣", LEGENDARY:"🟡" }[d.quality] || "⚪";
  const eta = formatETARange(d.eta_low, d.eta_high, d.confidence);
  msg += `${qe} ${d.quality} Lvl${d.level} — #${d.position}\n${eta}\n\n`;
}

await bot.telegram.sendMessage(event.chatId, msg, { parse_mode: "Markdown" }).catch(() => {});
```

}
}

module.exports = { registerBot, handleEvent };
