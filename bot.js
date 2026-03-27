const { Telegraf } = require("telegraf");
const { BOT_TOKEN } = require("./config");
const { registerBot } = require("./services/alert.service");
const h = require("./bot/handlers");

const bot = new Telegraf(BOT_TOKEN);

registerBot(bot);

// Main menu
bot.start(h.start);

// Market
bot.hears("📈 Market", h.market);
bot.hears("🦆 My Ducks", h.myDucks);
bot.hears("🔔 Position Alert", h.positionAlert);
bot.hears("🎯 Duck Sniper", h.duckSniper);

// Breeding
bot.hears("🐣 Breeding", h.breeding);
bot.hears("➕ Add Link", h.addLink);
bot.hears("📜 My Links", h.myLinks);
bot.hears("🔍 Find Match", h.findMatch);
bot.hears("⚙️ Breeding Settings", h.breedingSettings);

// Navigation
bot.hears("🔙 Back", h.goBack);

// Inline keyboard callbacks
bot.on("callback_query", h.handleCallback);

// Free text input
bot.on("text", h.handleText);

bot.launch();
console.log("🤖 BOT READY");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
