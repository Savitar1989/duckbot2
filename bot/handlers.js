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

// ─── MENUS ────────────────────────────────────────────────────────────────────

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

// ─── MAIN HANDLERS ────────────────────────────────────────────────────────────

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

async function positionAlert(ctx) {
  const alert = getAlert(ctx.chat.id, "POSITION");
  const threshold = alert?.threshold ?? null;
  const enabled = alert?.enabled === 1;

  let msg = enabled
    ? `🔔 *Position Alert: BE*\nÉrtesítés ha pozíció ≤ ${threshold ?? "nincs beállítva"}`
    : `🔕 *Position Alert: KI*`;
  msg += "\n\nAdd meg a pozíció küszöbértéket (pl. *50* = értesítés ha 50. helyre ér):";

  await ctx.reply(msg, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: enabled ? "🔕 Kikapcsol" : "🔔 Bekapcsol", callback_data: "alert_toggle" }
      ]]
    }
  });
  setState(ctx.chat.id, "WAIT_ALERT_THRESHOLD");
}

async function duckSniper(ctx) {
  const snipers = getUserSnipers(ctx.chat.id);
  let msg = "🎯 *Duck Sniper*\n\nKapj értesítést ha egy kacsa eléri a megadott pozíciót!\n\n";

  if (snipers.length) {
    msg += "*Aktív sniperek:*\n";
    for (const s of snipers) {
      const qe = QUALITY_EMOJI[s.quality] || "⚪";
      msg += `• ${qe} ${s.quality} Lvl${s.level}`;
      if (s.collection) msg += ` | Kollekció: ${s.collection}`;
      msg += ` — értesítés ≤ #${s.position_threshold}. pozíciónál\n`;
    }
    msg += "\n";
  } else {
    msg += "Nincs aktív sniperd.\n\n";
  }

  msg += "Válassz minőséget az új sniper létrehozásához:";

  const qualityButtons = QUALITIES.filter(q => q !== "COMMON").map(q => ({
    text: `${QUALITY_EMOJI[q]} ${q}`,
    callback_data: `sniper_q_${q}`
  }));
  const rows = [];
  for (let i = 0; i < qualityButtons.length; i += 2) rows.push(qualityButtons.slice(i, i + 2));
  if (snipers.length) rows.push([{ text: "🗑 Sniper törlése", callback_data: "sniper_del_menu" }]);

  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: { inline_keyboard: rows } });
}

// ─── BREEDING ─────────────────────────────────────────────────────────────────

async function breeding(ctx) {
  clearState(ctx.chat.id);
  await ctx.reply("🐣 Breeding menü:", { reply_markup: breedingMenuKeyboard() });
}

async function addLink(ctx) {
  setState(ctx.chat.id, "ADD_LINK");
  await ctx.reply(
    "📎 Küldd el a breeding linket!\n\nFormátum: `https://t.me/duckmyduck_bot?start=bXXXX`",
    { parse_mode: "Markdown" }
  );
}

async function myLinks(ctx) {
  const links = getUserLinks(ctx.chat.id);
  if (!links.length) return ctx.reply("📭 Nincs aktív breeding linked.");

  let msg = "📎 *Aktív breeding linkjeid:*\n\n";
  for (const l of links) {
    const emoji = QUALITY_EMOJI[l.quality] || "⚪";
    msg += `${emoji} Duck #${l.duckId} | ${l.quality} Lvl${l.level}\n`;
    if (l.req_min_level || l.req_min_quality !== "NONE" || l.req_fast_only) {
      msg += `  ⚠️ Kritérium:`;
      if (l.req_min_quality !== "NONE") msg += ` min. ${l.req_min_quality}`;
      if (l.req_min_level) msg += ` Lvl${l.req_min_level}+`;
      if (l.req_fast_only) msg += ` Fast`;
      msg += "\n";
    }
    msg += `  \`${l.link}\`\n\n`;
  }
  await ctx.reply(msg, { parse_mode: "Markdown" });
}

async function findMatch(ctx) {
  const buttons = QUALITIES.map(q => [{
    text: `${QUALITY_EMOJI[q]} ${q}`,
    callback_data: `fq_${q}`
  }]);
  await ctx.reply("🔍 Milyen minőségű kacsát keresel?", {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function breedingSettings(ctx) {
  await sendBreedingSettingsMenu(ctx, false);
}

async function sendBreedingSettingsMenu(ctx, edit = false) {
  const user = getUser(ctx.chat.id);
  const rl = user?.breeding_req_level || 0;
  const rq = user?.breeding_req_quality || "NONE";
  const rf = user?.breeding_req_fast === 1;

  const msg =
    "⚙️ *Breeding beállítások*\n\n" +
    "Ha valaki a te linkeddel párzik, mit vársz el tőle?\n\n" +
    `Same or Higher Level: ${rl > 0 ? "✅ BE" : "❌ KI"}\n` +
    `Same or Higher Quality: ${rq !== "NONE" ? "✅ BE" : "❌ KI"}\n` +
    `Fast Breeding only: ${rf ? "✅ BE" : "❌ KI"}`;

  const keyboard = {
    inline_keyboard: [
      [rl > 0
        ? { text: "✅ Same/Higher Level — kikapcsol", callback_data: "bs_lv_off" }
        : { text: "❌ Same/Higher Level — bekapcsol", callback_data: "bs_lv_on" }],
      [rq !== "NONE"
        ? { text: "✅ Same/Higher Quality — kikapcsol", callback_data: "bs_q_off" }
        : { text: "❌ Same/Higher Quality — bekapcsol", callback_data: "bs_q_on" }],
      [rf
        ? { text: "✅ Fast Breeding — kikapcsol", callback_data: "bs_f_off" }
        : { text: "❌ Fast Breeding — bekapcsol", callback_data: "bs_f_on" }],
      [{ text: "💾 Mentés", callback_data: "bs_save" }]
    ]
  };

  if (edit) {
    await ctx.editMessageText(msg, { parse_mode: "Markdown", reply_markup: keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
  }
}

async function goBack(ctx) {
  clearState(ctx.chat.id);
  await ctx.reply("🏠 Főmenü:", { reply_markup: mainMenuKeyboard() });
}

// ─── TEXT HANDLER ─────────────────────────────────────────────────────────────

async function handleText(ctx) {
  const { state, data } = getState(ctx.chat.id);
  const text = ctx.message.text.trim();

  if (state === "WAIT_PLAYER_ID") {
    const id = Number(text);
    if (isNaN(id) || id <= 0) return ctx.reply("❌ Érvénytelen ID. Kérlek számot adj meg.");
    setPlayerId(ctx.chat.id, id);
    clearState(ctx.chat.id);
    return ctx.reply(`✅ Player ID mentve: ${id}`, { reply_markup: marketMenuKeyboard() });
  }

  if (state === "WAIT_ALERT_THRESHOLD") {
    const val = Number(text);
    if (isNaN(val) || val <= 0) return ctx.reply("❌ Érvénytelen szám. Adj meg egy pozitív számot.");
    const current = getAlert(ctx.chat.id, "POSITION");
    setAlert(ctx.chat.id, "POSITION", true, val);
    clearState(ctx.chat.id);
    return ctx.reply(`✅ Position Alert beállítva: értesítés ha pozíció ≤ ${val}`);
  }

  if (state === "ADD_LINK") {
    await handleAddLink(ctx, text);
    return;
  }

  if (state === "FIND_WAITING_MY_LINK") {
    await handleProvideMyLink(ctx, text, data);
    return;
  }

  if (state === "SNIPER_WAIT_POS") {
    const pos = Number(text);
    if (isNaN(pos) || pos <= 0) return ctx.reply("❌ Érvénytelen szám.");
    if (!data) { clearState(ctx.chat.id); return; }
    // Move to collection step
    setState(ctx.chat.id, "SNIPER_WAIT_COLLECTION", { ...data, position_threshold: pos });
    await ctx.reply(
      "📦 Szeretnél szűrni kollekció szerint?\n\nKüldd el a kollekció nevét, vagy nyomd meg a gombot:",
      {
        reply_markup: {
          inline_keyboard: [[{ text: "⏭ Kihagyom (bármely kollekció)", callback_data: "sniper_col_any" }]]
        }
      }
    );
    return;
  }

  if (state === "SNIPER_WAIT_COLLECTION") {
    if (!data) { clearState(ctx.chat.id); return; }
    const collection = text;
    await finalizeSniper(ctx, { ...data, collection });
    return;
  }
}

// ─── LINK ADD FLOW ────────────────────────────────────────────────────────────

async function handleAddLink(ctx, link) {
  // Basic format check first
  const match = link.match(/start=b([a-zA-Z0-9]+)/);
  if (!match) {
    return ctx.reply("❌ Érvénytelen link formátum.\n\nVárt formátum: `https://t.me/duckmyduck_bot?start=bXXXX`", { parse_mode: "Markdown" });
  }

  await ctx.reply("🔍 Linket ellenőrzöm...");

  const result = await validateBreedingLink(link);

  if (!result.valid) {
    const reasons = {
      invalid_format: "Érvénytelen link formátum.",
      not_found: "Ez a kacsa nem létezik.",
      already_breeding: "Ez a kacsa már párzik.",
      unavailable: "Ez a kacsa nem elérhető párzásra.",
      api_error: "API hiba, próbáld újra."
    };
    return ctx.reply(`❌ ${reasons[result.reason] || "Ismeretlen hiba."}`);
  }

  if (result.unverified) {
    await ctx.reply("⚠️ Státuszt nem tudtam ellenőrizni, de a link formátuma helyes.");
  }

  // Store link in state, NOT in callback_data (Telegram 64 byte limit)
  setState(ctx.chat.id, "LINK_PICK_QUALITY", { duckId: result.duckId, link });

  const buttons = QUALITIES.map(q => [{
    text: `${QUALITY_EMOJI[q]} ${q}`,
    callback_data: `lq_${q}`   // short prefix, quality max 9 chars → well under 64 bytes
  }]);

  await ctx.reply("Milyen minőségű ez a kacsa?", { reply_markup: { inline_keyboard: buttons } });
}

async function handleProvideMyLink(ctx, myLink, data) {
  if (!data?.matchId) {
    clearState(ctx.chat.id);
    return ctx.reply("❌ Érvénytelen állapot. Kezdd újra a Find Match-t.");
  }

  await ctx.reply("🔍 A te linkedet ellenőrzöm...");
  const result = await validateBreedingLink(myLink);

  if (!result.valid) {
    return ctx.reply("❌ A te linked érvénytelen. Küldj érvényes breeding linket.");
  }

  const match = getLinkById(data.matchId);
  if (!match || match.status !== "available") {
    clearState(ctx.chat.id);
    return ctx.reply("❌ Ez a link már nem elérhető. Keresd meg újra.");
  }

  clearState(ctx.chat.id);
  await sendMatchFound(ctx, match);
}

async function sendMatchFound(ctx, match) {
  const emoji = QUALITY_EMOJI[match.quality] || "⚪";
  await ctx.reply(
    `✅ *Match találva!*\n\n` +
    `${emoji} ${match.quality} Lvl${match.level}\n` +
    `🔗 \`${match.link}\`\n\n` +
    `Ha elkezded a párzást, nyomd meg az alábbi gombot!`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🦆 I bred the duck!", callback_data: `bred_${match.id}` }]]
      }
    }
  );
}

async function finalizeSniper(ctx, data) {
  addSniper(ctx.chat.id, {
    quality: data.quality,
    level: data.level,
    collection: data.collection || null,
    position_threshold: data.position_threshold
  });
  clearState(ctx.chat.id);

  const qe = QUALITY_EMOJI[data.quality] || "⚪";
  await ctx.reply(
    `✅ *Sniper beállítva!*\n\n` +
    `${qe} ${data.quality} Lvl${data.level}\n` +
    (data.collection ? `Kollekció: ${data.collection}\n` : "") +
    `Értesítés ha pozíció ≤ #${data.position_threshold}`,
    { parse_mode: "Markdown" }
  );
}

// ─── CALLBACK QUERY HANDLER ───────────────────────────────────────────────────

async function handleCallback(ctx) {
  const cbData = ctx.callbackQuery.data;
  const chatId = ctx.chat.id;

  await ctx.answerCbQuery().catch(() => {});

  // ── Alert toggle
  if (cbData === "alert_toggle") {
    const alert = getAlert(chatId, "POSITION");
    const newEnabled = !(alert?.enabled === 1);
    setAlert(chatId, "POSITION", newEnabled, alert?.threshold);
    await ctx.editMessageText(newEnabled
      ? `🔔 Position Alert bekapcsolva. (küszöb: ${alert?.threshold ?? "nincs"})\n\nKüldj egy számot a küszöb frissítéséhez.`
      : "🔕 Position Alert kikapcsolva."
    ).catch(() => {});
    return;
  }

  // ── Breeding settings
  if (cbData.startsWith("bs_")) {
    const user = getUser(chatId);
    let rl = user?.breeding_req_level || 0;
    let rq = user?.breeding_req_quality || "NONE";
    let rf = user?.breeding_req_fast ? 1 : 0;

    if (cbData === "bs_lv_on")  rl = 1;
    if (cbData === "bs_lv_off") rl = 0;
    if (cbData === "bs_q_on")   rq = "SAME";
    if (cbData === "bs_q_off")  rq = "NONE";
    if (cbData === "bs_f_on")   rf = 1;
    if (cbData === "bs_f_off")  rf = 0;

    if (cbData === "bs_save") {
      setBreedingSettings(chatId, { req_level: rl, req_quality: rq, req_fast: rf });
      await ctx.editMessageText("✅ Breeding beállítások elmentve!").catch(() => {});
      return;
    }

    setBreedingSettings(chatId, { req_level: rl, req_quality: rq, req_fast: rf });
    await sendBreedingSettingsMenu(ctx, true);
    return;
  }

  // ── Add link: quality selection (link is in state, NOT in callback)
  if (cbData.startsWith("lq_")) {
    const quality = cbData.slice(3);
    const { data: stateData } = getState(chatId);
    if (!stateData?.link) return ctx.reply("❌ Hibás állapot, küldj új linket.");

    setState(chatId, "LINK_PICK_LEVEL", { ...stateData, quality });

    const buttons = [[1, 2, 3, 4, 5].map(n => ({ text: `Lvl ${n}`, callback_data: `ll_${n}` }))];
    await ctx.editMessageText("Milyen szintű ez a kacsa?", { reply_markup: { inline_keyboard: buttons } });
    return;
  }

  // ── Add link: level selection → save
  if (cbData.startsWith("ll_")) {
    const level = Number(cbData.slice(3));
    const { data: stateData } = getState(chatId);
    if (!stateData?.link) return ctx.reply("❌ Hibás állapot, küldj új linket.");

    const user = getUser(chatId);
    const criteria = {
      req_min_level: user?.breeding_req_level || 0,
      req_min_quality: user?.breeding_req_quality || "NONE",
      req_fast_only: user?.breeding_req_fast || 0
    };

    addBreedingLink(chatId, stateData.duckId, stateData.quality, level, stateData.link, criteria);
    clearState(chatId);

    const hasCriteria = criteria.req_min_level > 0 || criteria.req_min_quality !== "NONE" || criteria.req_fast_only;
    let msg = `✅ Breeding link elmentve!\n\n${QUALITY_EMOJI[stateData.quality] || "⚪"} ${stateData.quality} Lvl${level}`;
    if (hasCriteria) msg += "\n⚠️ Aktív kritériumaid vannak — csak megfelelő kacsával párosítják.";
    await ctx.editMessageText(msg).catch(() => {});
    return;
  }

  // ── Find match: quality
  if (cbData.startsWith("fq_")) {
    const quality = cbData.slice(3);
    setState(chatId, "FIND_LEVEL", { quality });

    const buttons = [[1, 2, 3, 4, 5].map(n => ({ text: `Lvl ${n}`, callback_data: `fl_${n}` }))];
    await ctx.editMessageText(`${QUALITY_EMOJI[quality]} ${quality} — Melyik szintet keresed?`, {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  // ── Find match: level → search
  if (cbData.startsWith("fl_")) {
    const level = Number(cbData.slice(3));
    const { data: stateData } = getState(chatId);
    if (!stateData?.quality) { clearState(chatId); return ctx.reply("❌ Hibás állapot."); }

    const matches = findMatches(stateData.quality, level);
    if (!matches.length) {
      clearState(chatId);
      return ctx.editMessageText("😔 Nincs elérhető link ezzel a kritériummal. Próbáld később!");
    }

    const match = matches[0];
    const hasCriteria = match.req_min_level > 0 || match.req_min_quality !== "NONE" || match.req_fast_only;

    if (!hasCriteria) {
      clearState(chatId);
      await ctx.editMessageText("✅ Match megvan!").catch(() => {});
      await sendMatchFound(ctx, match);
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

  // ── Bred the duck
  if (cbData.startsWith("bred_")) {
    const linkId = Number(cbData.slice(5));
    removeLink(linkId);
    await ctx.editMessageText("✅ Link eltávolítva. Boldog párzást! 🦆").catch(() => {});
    return;
  }

  // ── Sniper: quality
  if (cbData.startsWith("sniper_q_")) {
    const quality = cbData.slice(9);
    setState(chatId, "SNIPER_LEVEL", { quality });

    const buttons = [[1, 2, 3, 4, 5].map(n => ({ text: `Lvl ${n}`, callback_data: `sniper_l_${n}` }))];
    await ctx.editMessageText(`${QUALITY_EMOJI[quality]} ${quality} — Melyik szint?`, {
      reply_markup: { inline_keyboard: buttons }
    });
    return;
  }

  // ── Sniper: level
  if (cbData.startsWith("sniper_l_")) {
    const level = Number(cbData.slice(9));
    const { data: stateData } = getState(chatId);
    if (!stateData?.quality) return ctx.reply("❌ Hibás állapot.");

    setState(chatId, "SNIPER_WAIT_POS", { ...stateData, level });
    await ctx.editMessageText(
      `${QUALITY_EMOJI[stateData.quality]} ${stateData.quality} Lvl${level}\n\n` +
      `📍 Melyik pozíciónál értesítselek?\n\nKüldd el a számot (pl. *50* = ha a kacsa 50. helyre ér)`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ── Sniper: skip collection
  if (cbData === "sniper_col_any") {
    const { data: stateData } = getState(chatId);
    if (!stateData) return;
    await finalizeSniper(ctx, { ...stateData, collection: null });
    return;
  }

  // ── Sniper: delete menu
  if (cbData === "sniper_del_menu") {
    const snipers = getUserSnipers(chatId);
    if (!snipers.length) { await ctx.editMessageText("Nincs törölhető sniperd."); return; }

    const buttons = snipers.map(s => [{
      text: `🗑 ${QUALITY_EMOJI[s.quality] || "⚪"} ${s.quality} Lvl${s.level} ≤#${s.position_threshold}`,
      callback_data: `sniper_d_${s.id}`
    }]);
    await ctx.editMessageReplyMarkup({ inline_keyboard: buttons });
    return;
  }

  // ── Sniper: delete
  if (cbData.startsWith("sniper_d_")) {
    const id = Number(cbData.slice(9));
    removeSniper(id);
    await ctx.editMessageText("✅ Sniper törölve.").catch(() => {});
    return;
  }
}

module.exports = {
  start, market, myDucks, positionAlert, duckSniper,
  breeding, addLink, myLinks, findMatch, breedingSettings,
  goBack, handleText, handleCallback
};
