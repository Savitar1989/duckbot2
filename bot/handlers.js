const { saveUser, setPlayerId, getPlayerId, getUser, setBreedingSettings } = require("../db/users");
const { getUserMarketDucks } = require("../db/ducks");
const { setAlert, getAlert, getAlertUsers } = require("../db/alerts");
const { addBreedingLink, getUserLinks, removeLink, findMatches, getLinkById, QUALITY_RANK } = require("../db/breeding");
const { addSniper, getUserSnipers, removeSniper } = require("../db/snipers");
const { setState, getState, clearState } = require("../db/state");
const { validateBreedingLink } = require("../core/api");
const { formatETARange } = require("../core/eta");

const QUALITIES = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY"];
const QUALITY_EMOJI = {
  COMMON: "⚪", UNCOMMON: "🟢", RARE: "🔵", EPIC: "🟣", LEGENDARY: "🟡"
};

function mainMenuKeyboard() {
  return { keyboard: [["🐣 Breeding", "📈 Market"]], resize_keyboard: true };
}
function marketMenuKeyboard() {
  return {
    keyboard: [["🦆 My Ducks", "🔔 Position Alert"], ["🎯 Duck Sniper"], ["🔙 Back"]],
    resize_keyboard: true
  };
}
function breedingMenuKeyboard() {
  return {
    keyboard: [["➕ Add Link", "📜 My Links"], ["🔍 Find Match", "⚙️ Breeding Settings"], ["🔙 Back"]],
    resize_keyboard: true
  };
}

async function start(ctx) {
  saveUser(ctx.chat.id);
  clearState(ctx.chat.id);
  await ctx.reply("🦆 Üdvözöl a DuckMyDuck Bot!", { reply_markup: mainMenuKeyboard() });
}

async function market(ctx) {
  const playerId = getPlayerId(ctx.chat.id);
  if (!playerId) {
    setState(ctx.chat.id, "WAIT_PLAYER_ID");
    return ctx.reply("📋 Add meg a Player ID-det!\n\nMegtalálod a játékban: Beállítások → Player ID");
  }
  await ctx.reply("📈 Market menü:", { reply_markup: marketMenuKeyboard() });
}

async function myDucks(ctx) {
  const playerId = getPlayerId(ctx.chat.id);
  if (!playerId) return ctx.reply("❌ Először add meg a Player ID-det a Market menüben.");

  const ducks = getUserMarketDucks(playerId);
  if (!ducks.length) return ctx.reply("🦆 Nincs kacsád a marketen.");

  let msg = "🦆 *A te kacsáid a marketen:*\n\n";
  for (const d of ducks) {
    const emoji = QUALITY_EMOJI[d.quality] || "⚪";
    msg += `${emoji} Duck #${d.id}\n`;
    msg += `  Minőség: ${d.quality} | Szint: ${d.level}\n`;
    msg += `  Pozíció: #${d.position}\n`;
    msg += `  ${formatETARange(d.eta_low, d.eta_high, d.confidence)}\n\n`;
  }
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

// ensure callback handler is async
async function handleCallback(ctx) {
  const cbData = ctx.callbackQuery?.data;
  const chatId = ctx.chat.id;

  // existing logic continues below...

  if (cbData && cbData.startsWith("fl_")) {
    const level = Number(cbData.slice(3));
    const { data: stateData } = getState(chatId);
    if (!stateData?.quality) { clearState(chatId); return ctx.reply("❌ Hibás állapot."); }

    const playerId = getPlayerId(chatId);
    const userDucks = playerId ? getUserMarketDucks(playerId) : [];

    const userDuck = userDucks.find(d =>
      d.quality === stateData.quality && d.level >= level
    ) || userDucks[0] || null;

    const matches = findMatches(stateData.quality, level, chatId, userDuck);

    if (!matches.length) {
      clearState(chatId);
      return ctx.editMessageText("😔 Nincs elérhető link ezzel a kritériummal. Próbáld később!");
    }

    const match = matches[0];
    const hasCriteria = match.req_min_level > 0 || match.req_min_quality !== "NONE" || match.req_fast_only;

    if (!hasCriteria) {
      clearState(chatId);
      await ctx.editMessageText("✅ Match megvan!").catch(() => {});
      if (typeof sendMatchFound === 'function') {
        await sendMatchFound(ctx, match);
      }
    } else {
      setState(chatId, "FIND_WAITING_MY_LINK", { matchId: match.id, quality: stateData.quality, level });
      let criteria = "Ez a kacsa kritériumokhoz kötött:\n";
      if (match.req_min_quality !== "NONE") criteria += `• Min. minőség: ${match.req_min_quality}\n`;
      if (match.req_min_level > 0) criteria += `• Min. szint: ${match.req_min_level}\n`;
      if (match.req_fast_only) criteria += `• Csak Fast Breeding\n`;
      await ctx.editMessageText(`⚠️ *Kritériumos link*\n\n${criteria}\nElőbb küldd el a te breeding linkedet!`, { parse_mode: "Markdown" });
    }
    return;
  }
}

module.exports = {
  start, market, myDucks, positionAlert, duckSniper,
  breeding, addLink, myLinks, findMatch, breedingSettings,
  goBack, handleText, handleCallback
};