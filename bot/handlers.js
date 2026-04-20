const { saveUser, setPlayerId, getPlayerId, getUser, setBreedingSettings } = require(”../db/users”);
const { getUserMarketDucks } = require(”../db/ducks”);
const { setAlert, getAlert } = require(”../db/alerts”);
const { addBreedingLink, getUserLinks, removeLink, findMatches, getLinkById, QUALITY_RANK } = require(”../db/breeding”);
const { addSniper, getUserSnipers, removeSniper } = require(”../db/snipers”);
const { setState, getState, clearState, updateStateData } = require(”../db/state”);
const { validateBreedingLink } = require(”../core/api”);
const { formatETARange } = require(”../core/eta”);

const QUALITIES = [“COMMON”, “UNCOMMON”, “RARE”, “EPIC”, “LEGENDARY”];
const QUALITY_EMOJI = {
COMMON: “⚪”, UNCOMMON: “🟢”, RARE: “🔵”, EPIC: “🟣”, LEGENDARY: “🟡”
};

// ─── Keyboards ────────────────────────────────────────────────────────────────

function mainMenuKeyboard() {
return { keyboard: [[“🐣 Breeding”, “📈 Market”]], resize_keyboard: true };
}
function marketMenuKeyboard() {
return {
keyboard: [[“🦆 My Ducks”, “🔔 Position Alert”], [“🎯 Duck Sniper”], [“🔙 Back”]],
resize_keyboard: true
};
}
function breedingMenuKeyboard() {
return {
keyboard: [[“➕ Add Link”, “📜 My Links”], [“🔍 Find Match”, “⚙️ Breeding Settings”], [“🔙 Back”]],
resize_keyboard: true
};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qualityKeyboard(prefix = “q_”) {
return {
inline_keyboard: QUALITIES.map(q => ([{
text: `${QUALITY_EMOJI[q]} ${q}`,
callback_data: `${prefix}${q}`
}]))
};
}

function levelKeyboard(prefix = “lv_”) {
const levels = [1, 5, 10, 15, 20, 25, 30];
const rows = [];
for (let i = 0; i < levels.length; i += 3) {
rows.push(levels.slice(i, i + 3).map(l => ({ text: `Lv ${l}+`, callback_data: `${prefix}${l}` })));
}
return { inline_keyboard: rows };
}

function yesNoKeyboard(yesData, noData) {
return { inline_keyboard: [[{ text: “✅ Igen”, callback_data: yesData }, { text: “❌ Nem”, callback_data: noData }]] };
}

// ─── Main handlers ────────────────────────────────────────────────────────────

async function start(ctx) {
saveUser(ctx.chat.id);
clearState(ctx.chat.id);
await ctx.reply(“🦆 Üdvözöl a DuckMyDuck Bot!\n\nKövesd a piacot, kezeld a tenyésztési linkjeidet, és kap értesítéseket.”, {
reply_markup: mainMenuKeyboard()
});
}

async function market(ctx) {
const chatId = ctx.chat?.id;
if (!chatId) return;
const playerId = getPlayerId(chatId);
if (!playerId) {
setState(chatId, “WAIT_PLAYER_ID”);
return ctx.reply(
“📋 Add meg a Player ID-det!\n\nMegtalálod a játékban: Beállítások → Player ID\n\nCsak a számot küldd el!”
);
}
clearState(chatId);
return ctx.reply(“📈 Market menü:”, { reply_markup: marketMenuKeyboard() });
}

async function myDucks(ctx) {
const playerId = getPlayerId(ctx.chat.id);
if (!playerId) return ctx.reply(“❌ Először add meg a Player ID-det a Market menüben.”);

const ducks = getUserMarketDucks(playerId);
if (!ducks.length) return ctx.reply(“🦆 Nincs kacsád a marketen.”);

let msg = “🦆 *A te kacsáid a marketen:*\n\n”;
for (const d of ducks) {
const emoji = QUALITY_EMOJI[d.quality] || “⚪”;
msg += `${emoji} Duck #${d.id}\n`;
msg += `  Minőség: ${d.quality} | Szint: ${d.level}\n`;
msg += `  Pozíció: #${d.position}\n`;
msg += `  ${formatETARange(d.eta_low, d.eta_high, d.confidence)}\n\n`;
}
await ctx.reply(msg, { parse_mode: “Markdown” });
}

// ─── Position Alert ───────────────────────────────────────────────────────────

async function positionAlert(ctx) {
const chatId = ctx.chat.id;
const existing = getAlert(chatId, “POSITION”);
const status = existing?.enabled ? “✅ Bekapcsolva” : “❌ Kikapcsolva”;
const threshold = existing?.threshold ? `\nKüszöbérték: #${existing.threshold}` : “”;

clearState(chatId);
await ctx.reply(
`🔔 *Pozíció Alert*\n\nJelenlegi állapot: ${status}${threshold}\n\nMit szeretnél?`,
{
parse_mode: “Markdown”,
reply_markup: {
inline_keyboard: [
[{ text: “✅ Bekapcsol”, callback_data: “alert_on” }, { text: “❌ Kikapcsol”, callback_data: “alert_off” }],
[{ text: “🎯 Küszöbérték beállítása”, callback_data: “alert_threshold” }]
]
}
}
);
}

// ─── Duck Sniper ──────────────────────────────────────────────────────────────

async function duckSniper(ctx) {
const chatId = ctx.chat.id;
const snipers = getUserSnipers(chatId);

let msg = “🎯 *Duck Sniper*\n\nAktív snipers:\n\n”;
if (!snipers.length) {
msg += “Nincs aktív sniper.\n”;
} else {
for (const s of snipers) {
const qe = QUALITY_EMOJI[s.quality] || “⚪”;
msg += `${qe} ${s.quality} Lv${s.level}+ — Top #${s.position_threshold}\n`;
msg += `  ID: ${s.id}\n\n`;
}
}

clearState(chatId);
await ctx.reply(msg, {
parse_mode: “Markdown”,
reply_markup: {
inline_keyboard: [
[{ text: “➕ Új Sniper”, callback_data: “sniper_add” }],
snipers.length ? [{ text: “🗑 Sniper törlése”, callback_data: “sniper_remove” }] : []
].filter(r => r.length)
}
});
}

// ─── Breeding ─────────────────────────────────────────────────────────────────

async function breeding(ctx) {
clearState(ctx.chat.id);
await ctx.reply(“🐣 Breeding menü:”, { reply_markup: breedingMenuKeyboard() });
}

async function addLink(ctx) {
const chatId = ctx.chat.id;
setState(chatId, “WAIT_BREEDING_LINK”);
await ctx.reply(
“➕ *Link hozzáadása*\n\nKüldd el a breeding linkedet!\n\nFormátum: `https://t.me/duckmyduck_bot?start=b...`”,
{ parse_mode: “Markdown” }
);
}

async function myLinks(ctx) {
const chatId = ctx.chat.id;
const links = getUserLinks(chatId);

if (!links.length) return ctx.reply(“📜 Nincs aktív linkjed.”);

let msg = “📜 *Aktív linkjeid:*\n\n”;
for (const l of links) {
const qe = QUALITY_EMOJI[l.quality] || “⚪”;
msg += `${qe} Duck #${l.duckId} — ${l.quality} Lv${l.level}\n`;
if (l.req_min_level > 0) msg += `  ⚙️ Min szint: ${l.req_min_level}\n`;
if (l.req_min_quality !== “NONE”) msg += `  ⚙️ Min minőség: ${l.req_min_quality}\n`;
if (l.req_fast_only) msg += `  ⚡ Csak Fast\n`;
msg += `  ID: ${l.id}\n\n`;
}

clearState(chatId);
await ctx.reply(msg, {
parse_mode: “Markdown”,
reply_markup: {
inline_keyboard: [[{ text: “🗑 Link törlése”, callback_data: “link_remove” }]]
}
});
}

async function findMatch(ctx) {
const chatId = ctx.chat.id;
setState(chatId, “FIND_WAITING_QUALITY”);
await ctx.reply(“🔍 *Match keresés*\n\nMilyen minőségű kacsát keresel?”, {
parse_mode: “Markdown”,
reply_markup: qualityKeyboard(“fq_”)
});
}

async function breedingSettings(ctx) {
const chatId = ctx.chat.id;
const user = getUser(chatId);
clearState(chatId);

const reqLevel = user?.breeding_req_level || 0;
const reqQuality = user?.breeding_req_quality || “NONE”;
const reqFast = user?.breeding_req_fast || 0;

const msg =
`⚙️ *Breeding beállítások*\n\n` +
`Min. szint: ${reqLevel > 0 ? reqLevel : "Nincs"}\n` +
`Min. minőség: ${reqQuality !== "NONE" ? reqQuality : "Nincs"}\n` +
`Csak Fast: ${reqFast ? "✅" : "❌"}\n\n` +
`Mit szeretnél módosítani?`;

await ctx.reply(msg, {
parse_mode: “Markdown”,
reply_markup: {
inline_keyboard: [
[{ text: “🔢 Min. szint”, callback_data: “bs_level” }, { text: “⭐ Min. minőség”, callback_data: “bs_quality” }],
[{ text: reqFast ? “⚡ Fast: BE” : “⚡ Fast: KI”, callback_data: “bs_fast_toggle” }],
[{ text: “🔄 Reset”, callback_data: “bs_reset” }]
]
}
});
}

// ─── Navigation ───────────────────────────────────────────────────────────────

async function goBack(ctx) {
clearState(ctx.chat.id);
await ctx.reply(“🏠 Főmenü:”, { reply_markup: mainMenuKeyboard() });
}

// ─── sendMatchFound ───────────────────────────────────────────────────────────

async function sendMatchFound(ctx, match) {
const qe = QUALITY_EMOJI[match.quality] || “⚪”;
let msg = `✅ *Match találva!*\n\n`;
msg += `${qe} ${match.quality} Lv${match.level}\n`;
msg += `🔗 [Breeding link](${match.link})\n\n`;

let criteria = “”;
if (match.req_min_quality !== “NONE”) criteria += `• Min. minőség: ${match.req_min_quality}\n`;
if (match.req_min_level > 0) criteria += `• Min. szint: ${match.req_min_level}\n`;
if (match.req_fast_only) criteria += `• Csak Fast Breeding\n`;
if (criteria) msg += `⚙️ Kritériumok:\n${criteria}`;

await ctx.reply(msg, {
parse_mode: “Markdown”,
reply_markup: {
inline_keyboard: [[{ text: “🔍 Következő match”, callback_data: “find_next” }]]
}
});
}

// ─── Callback handler ─────────────────────────────────────────────────────────

async function handleCallback(ctx) {
const cbData = ctx.callbackQuery?.data;
const chatId = ctx.chat?.id;

if (!cbData || !chatId) return;

// NOTE: answerCbQuery is called by handleCallbackExtended before this runs.
// Do NOT call it again here — Telegraf throws on duplicate answers.

// ── Position Alert callbacks ──────────────────────────────────────────────

if (cbData === “alert_on”) {
setAlert(chatId, “POSITION”, true);
return ctx.editMessageText(“✅ Pozíció alert bekapcsolva!”);
}

if (cbData === “alert_off”) {
setAlert(chatId, “POSITION”, false);
return ctx.editMessageText(“❌ Pozíció alert kikapcsolva!”);
}

if (cbData === “alert_threshold”) {
setState(chatId, “WAIT_ALERT_THRESHOLD”);
return ctx.editMessageText(“🎯 Add meg a küszöbértéket (pl. 10 = értesítés ha a kacsa top 10-be kerül):”);
}

// ── Sniper callbacks ──────────────────────────────────────────────────────

if (cbData === “sniper_add”) {
setState(chatId, “SNIPER_WAIT_QUALITY”);
return ctx.editMessageText(“🎯 Milyen minőségű kacsát figyelj?”, {
reply_markup: qualityKeyboard(“sq_”)
});
}

if (cbData === “sniper_remove”) {
const snipers = getUserSnipers(chatId);
if (!snipers.length) return ctx.editMessageText(“Nincs törölhető sniper.”);
const rows = snipers.map(s => [{
text: `${QUALITY_EMOJI[s.quality] || "⚪"} ${s.quality} Lv${s.level}+ #${s.id}`,
callback_data: `sdel_${s.id}`
}]);
return ctx.editMessageText(“🗑 Melyik snippert töröljük?”, { reply_markup: { inline_keyboard: rows } });
}

if (cbData.startsWith(“sdel_”)) {
const id = Number(cbData.slice(5));
removeSniper(id);
return ctx.editMessageText(“✅ Sniper törölve.”);
}

if (cbData.startsWith(“sq_”)) {
const quality = cbData.slice(3);
setState(chatId, “SNIPER_WAIT_LEVEL”, { quality });
return ctx.editMessageText(`🔢 Min. szint ${quality}-hoz?`, { reply_markup: levelKeyboard(“slv_”) });
}

if (cbData.startsWith(“slv_”)) {
const level = Number(cbData.slice(4));
const { data: sd } = getState(chatId);
if (!sd?.quality) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }
setState(chatId, “SNIPER_WAIT_THRESHOLD”, { quality: sd.quality, level });
return ctx.editMessageText(“📍 Mi legyen a pozíció küszöb? (pl. 50 = top 50)\n\nÍrd be a számot:”);
}

// ── Link remove callback ──────────────────────────────────────────────────

if (cbData === “link_remove”) {
const links = getUserLinks(chatId);
if (!links.length) return ctx.editMessageText(“Nincs törölhető link.”);
const rows = links.map(l => [{
text: `${QUALITY_EMOJI[l.quality] || "⚪"} Duck #${l.duckId} Lv${l.level} — #${l.id}`,
callback_data: `ldel_${l.id}`
}]);
return ctx.editMessageText(“🗑 Melyik linket töröljük?”, { reply_markup: { inline_keyboard: rows } });
}

if (cbData.startsWith(“ldel_”)) {
const id = Number(cbData.slice(5));
removeLink(id);
return ctx.editMessageText(“✅ Link törölve.”);
}

// ── Breeding Settings callbacks ───────────────────────────────────────────

if (cbData === “bs_level”) {
setState(chatId, “BS_WAIT_LEVEL”);
return ctx.editMessageText(“🔢 Add meg a min. szintet (0 = nincs):”);
}

if (cbData === “bs_quality”) {
setState(chatId, “BS_WAIT_QUALITY”);
return ctx.editMessageText(“⭐ Min. minőség:”, { reply_markup: qualityKeyboard(“bsq_”) });
}

if (cbData.startsWith(“bsq_”)) {
const quality = cbData.slice(4);
const user = getUser(chatId);
setBreedingSettings(chatId, {
req_level: user?.breeding_req_level || 0,
req_quality: quality,
req_fast: user?.breeding_req_fast || 0
});
clearState(chatId);
return ctx.editMessageText(`✅ Min. minőség beállítva: ${quality}`);
}

if (cbData === “bs_fast_toggle”) {
const user = getUser(chatId);
const newFast = user?.breeding_req_fast ? 0 : 1;
setBreedingSettings(chatId, {
req_level: user?.breeding_req_level || 0,
req_quality: user?.breeding_req_quality || “NONE”,
req_fast: newFast
});
return ctx.editMessageText(`⚡ Fast only: ${newFast ? "✅ BE" : "❌ KI"}`);
}

if (cbData === “bs_reset”) {
setBreedingSettings(chatId, { req_level: 0, req_quality: “NONE”, req_fast: 0 });
clearState(chatId);
return ctx.editMessageText(“🔄 Beállítások visszaállítva.”);
}

// ── Find Match — quality selection ─────────────────────────────────────────

if (cbData.startsWith(“fq_”)) {
const quality = cbData.slice(3);
setState(chatId, “FIND_WAITING_LEVEL”, { quality });
return ctx.editMessageText(`🔢 Min. szint ${quality}-hoz?`, { reply_markup: levelKeyboard(“fl_”) });
}

// ── Find Match — level selection → show result ─────────────────────────────

if (cbData.startsWith(“fl_”)) {
const level = Number(cbData.slice(3));
const { data: stateData } = getState(chatId);
if (!stateData?.quality) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }

```
const playerId = getPlayerId(chatId);
const userDucks = playerId ? getUserMarketDucks(playerId) : [];
const userDuck = userDucks.find(d => d.quality === stateData.quality && d.level >= level) || userDucks[0] || null;

const matches = findMatches(stateData.quality, level, chatId, userDuck);

if (!matches.length) {
  clearState(chatId);
  return ctx.editMessageText("😔 Nincs elérhető link ezzel a kritériummal. Próbáld később!");
}

const match = matches[0];
const hasCriteria = match.req_min_level > 0 || match.req_min_quality !== "NONE" || match.req_fast_only;

if (!hasCriteria) {
  setState(chatId, "FIND_DONE", { matchId: match.id, quality: stateData.quality, level });
  await ctx.editMessageText("✅ Match megvan!").catch(() => {});
  return sendMatchFound(ctx, match);
} else {
  setState(chatId, "FIND_WAITING_MY_LINK", { matchId: match.id, quality: stateData.quality, level });
  let criteria = "Ez a kacsa kritériumokhoz kötött:\n";
  if (match.req_min_quality !== "NONE") criteria += `• Min. minőség: ${match.req_min_quality}\n`;
  if (match.req_min_level > 0) criteria += `• Min. szint: ${match.req_min_level}\n`;
  if (match.req_fast_only) criteria += `• Csak Fast Breeding\n`;
  return ctx.editMessageText(
    `⚠️ *Kritériumos link*\n\n${criteria}\nElőbb küldd el a te breeding linkedet!`,
    { parse_mode: "Markdown" }
  );
}
```

}

// ── Find next match ────────────────────────────────────────────────────────

if (cbData === “find_next”) {
const { data: sd } = getState(chatId);
if (!sd?.quality) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }
const playerId = getPlayerId(chatId);
const userDucks = playerId ? getUserMarketDucks(playerId) : [];
const userDuck = userDucks[0] || null;
const matches = findMatches(sd.quality, sd.level, chatId, userDuck);
const next = matches.find(m => m.id !== sd.matchId);
if (!next) return ctx.editMessageText(“😔 Nincs több elérhető match.”);
updateStateData(chatId, { matchId: next.id });
await ctx.editMessageText(“✅ Következő match:”).catch(() => {});
return sendMatchFound(ctx, next);
}
}

// ─── Free text / state machine ────────────────────────────────────────────────

async function handleText(ctx) {
const text = ctx.message?.text;
const chatId = ctx.chat?.id;

if (!text || !chatId) return;

// Ignore Telegram commands — let bot.command() or bot.start() handle them
if (text.startsWith(”/”)) return;

// Keyboard button presses are handled by bot.hears() — only handle free text here
const keyboardButtons = [
“📈 Market”, “🦆 My Ducks”, “🔔 Position Alert”, “🎯 Duck Sniper”,
“🐣 Breeding”, “➕ Add Link”, “📜 My Links”, “🔍 Find Match”,
“⚙️ Breeding Settings”, “🔙 Back”
];
if (keyboardButtons.includes(text)) return;

const { state: currentState, data: stateData } = getState(chatId);

// ── Player ID entry ────────────────────────────────────────────────────────
if (currentState === “WAIT_PLAYER_ID”) {
const trimmed = text.trim();
const id = parseInt(trimmed, 10);
// Must be a pure number string — reject anything with letters
if (!/^\d+$/.test(trimmed) || isNaN(id) || id <= 0) {
return ctx.reply(“❌ Érvénytelen Player ID.\n\nCsak a számot küldd el, pl: `123456`”, {
parse_mode: “Markdown”
});
}
setPlayerId(chatId, id);
clearState(chatId);
return ctx.reply(`✅ Player ID mentve: *${id}*\n\nMost már eléred a Market funkciókat!`, {
parse_mode: “Markdown”,
reply_markup: marketMenuKeyboard()
});
}

// ── Alert threshold entry ──────────────────────────────────────────────────
if (currentState === “WAIT_ALERT_THRESHOLD”) {
const threshold = parseInt(text.trim(), 10);
if (isNaN(threshold) || threshold <= 0) {
return ctx.reply(“❌ Érvénytelen szám. Adj meg egy pozitív egészt (pl. 10):”);
}
setAlert(chatId, “POSITION”, true, threshold);
clearState(chatId);
return ctx.reply(`✅ Alert beállítva: top #${threshold}`);
}

// ── Breeding link entry ────────────────────────────────────────────────────
if (currentState === “WAIT_BREEDING_LINK”) {
if (!text.includes(“start=b”)) {
return ctx.reply(
“❌ Érvénytelen link formátum.\n\nA linknek így kell kinéznie:\n`https://t.me/duckmyduck_bot?start=b...`”,
{ parse_mode: “Markdown” }
);
}
await ctx.reply(“⏳ Link ellenőrzése…”);
const result = await validateBreedingLink(text.trim());

```
if (!result.valid) {
  const reasons = {
    invalid_format: "❌ Érvénytelen link formátum.",
    not_found: "❌ A link nem található.",
    already_breeding: "❌ Ez a kacsa már tenyészik."
  };
  return ctx.reply(reasons[result.reason] || "❌ Érvénytelen link.");
}

const duck = result.duck;
const quality = (duck?.quality || "COMMON").toUpperCase();
const level = duck?.level || 0;
const duckId = duck?.id || 0;

setState(chatId, "WAIT_BREEDING_CRITERIA", {
  link: text.trim(),
  breedingSecret: result.breedingSecret,
  quality, level, duckId
});

const qe = QUALITY_EMOJI[quality] || "⚪";
return ctx.reply(
  `✅ Link érvényes!\n\n${qe} Duck #${duckId} — ${quality} Lv${level}\n\nKritériumokat szeretnél beállítani?`,
  { reply_markup: yesNoKeyboard("bc_yes", "bc_no") }
);
```

}

// ── Breeding criteria inline — handled via buttons, ignore free text ─────
if (currentState === “WAIT_BREEDING_CRITERIA”) {
return ctx.reply(“👆 Kérlek használd a gombokat a választáshoz!”);
}

// ── Breeding criteria: min level ───────────────────────────────────────────
if (currentState === “BC_WAIT_LEVEL”) {
const level = parseInt(text.trim(), 10);
if (isNaN(level) || level < 0) return ctx.reply(“❌ Érvénytelen szint.”);
updateStateData(chatId, { req_min_level: level });
setState(chatId, “BC_WAIT_QUALITY”, { …stateData, req_min_level: level });
return ctx.reply(“⭐ Min. minőség?”, { reply_markup: qualityKeyboard(“bcq_”) });
}

// ── Sniper: position threshold ─────────────────────────────────────────────
if (currentState === “SNIPER_WAIT_THRESHOLD”) {
const threshold = parseInt(text.trim(), 10);
if (isNaN(threshold) || threshold <= 0) return ctx.reply(“❌ Érvénytelen szám.”);
const { quality, level } = stateData || {};
if (!quality || !level) { clearState(chatId); return ctx.reply(“❌ Hibás állapot.”); }
addSniper(chatId, { quality, level, position_threshold: threshold });
clearState(chatId);
return ctx.reply(`✅ Sniper aktív!\n\n${QUALITY_EMOJI[quality] || "⚪"} ${quality} Lv${level}+ — Top #${threshold}`);
}

// ── Breeding settings: min level ───────────────────────────────────────────
if (currentState === “BS_WAIT_LEVEL”) {
const level = parseInt(text.trim(), 10);
if (isNaN(level) || level < 0) return ctx.reply(“❌ Érvénytelen szint.”);
const user = getUser(chatId);
setBreedingSettings(chatId, {
req_level: level,
req_quality: user?.breeding_req_quality || “NONE”,
req_fast: user?.breeding_req_fast || 0
});
clearState(chatId);
return ctx.reply(`✅ Min. szint beállítva: ${level}`);
}

// ── Find match: my link (for criteria-gated matches) ──────────────────────
if (currentState === “FIND_WAITING_MY_LINK”) {
await ctx.reply(“⏳ Link ellenőrzése…”);
const result = await validateBreedingLink(text.trim());

```
if (!result.valid) {
  return ctx.reply("❌ Érvénytelen link. Küldj egy érvényes breeding linket!");
}

const { matchId } = stateData || {};
if (!matchId) { clearState(chatId); return ctx.reply("❌ Hibás állapot."); }

const match = getLinkById(matchId);
if (!match || match.status !== "available") {
  clearState(chatId);
  return ctx.reply("😔 Ez a link már nem elérhető. Keress új matchet!");
}

const claimed = removeLink(matchId);
if (!claimed) {
  clearState(chatId);
  return ctx.reply("😔 A link közben elfoglalt lett. Keress új matchet!");
}

clearState(chatId);
await sendMatchFound(ctx, match);

// Also send them our link as a reply to the match owner (best-effort)
return ctx.reply(`✅ A te linked elküldve a partnernek:\n${text.trim()}`);
```

}

// Unrecognized input
await ctx.reply(“❓ Nem értem. Használd a menü gombjait!”, { reply_markup: mainMenuKeyboard() });
}

// ─── Inline callback: breeding criteria (bc_yes / bc_no / bcq_) ───────────────
// These arrive via handleCallback but need stateData — handled here as extension

async function handleCallbackExtended(ctx) {
const cbData = ctx.callbackQuery?.data;
const chatId = ctx.chat?.id;

if (!cbData || !chatId) {
await ctx.answerCbQuery().catch(() => {});
return;
}

// Answer ONCE here — _origHandleCallback must NOT call it again
await ctx.answerCbQuery().catch(() => {});

const { state: currentState, data: stateData } = getState(chatId);

// ── Breeding criteria: yes/no ──────────────────────────────────────────────
if (cbData === “bc_no”) {
if (!stateData?.link) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }
addBreedingLink(chatId, stateData.duckId, stateData.quality, stateData.level, stateData.link, {
req_min_level: 0, req_min_quality: “NONE”, req_fast_only: false
});
clearState(chatId);
return ctx.editMessageText(“✅ Link hozzáadva kritériumok nélkül!”);
}

if (cbData === “bc_yes”) {
if (!stateData?.link) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }
setState(chatId, “BC_WAIT_LEVEL”, stateData);
return ctx.editMessageText(“🔢 Min. szint? (0 = nincs)”);
}

// ── Breeding criteria: quality selection ───────────────────────────────────
if (cbData.startsWith(“bcq_”)) {
const quality = cbData.slice(4);
if (!stateData?.link) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }
const fastState = { …stateData, req_min_quality: quality };
setState(chatId, “BC_WAIT_FAST”, fastState);
return ctx.editMessageText(“⚡ Csak Fast Breeding?”, { reply_markup: yesNoKeyboard(“bcf_yes”, “bcf_no”) });
}

if (cbData === “bcf_yes” || cbData === “bcf_no”) {
const fast = cbData === “bcf_yes”;
if (!stateData?.link) { clearState(chatId); return ctx.editMessageText(“❌ Hibás állapot.”); }
addBreedingLink(chatId, stateData.duckId, stateData.quality, stateData.level, stateData.link, {
req_min_level: stateData.req_min_level || 0,
req_min_quality: stateData.req_min_quality || “NONE”,
req_fast_only: fast
});
clearState(chatId);
return ctx.editMessageText(“✅ Link hozzáadva kritériumokkal!”);
}

// Fall through to original callback handler (answerCbQuery already called above)
return handleCallback(ctx);
}

module.exports = {
start, market, myDucks, positionAlert, duckSniper,
breeding, addLink, myLinks, findMatch, breedingSettings,
goBack, handleText,
handleCallback: handleCallbackExtended
};
