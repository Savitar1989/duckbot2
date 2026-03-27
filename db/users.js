const db = require("./database");

function saveUser(chatId) {
  db.prepare(`INSERT OR IGNORE INTO users (chatId) VALUES (?)`).run(chatId);
}

function setPlayerId(chatId, playerId) {
  db.prepare(`UPDATE users SET playerId = ? WHERE chatId = ?`).run(playerId, chatId);
}

function getPlayerId(chatId) {
  return db.prepare(`SELECT playerId FROM users WHERE chatId = ?`).get(chatId)?.playerId;
}

function getUser(chatId) {
  return db.prepare(`SELECT * FROM users WHERE chatId = ?`).get(chatId);
}

function setBreedingSettings(chatId, { req_level, req_quality, req_fast }) {
  db.prepare(`
    UPDATE users SET
      breeding_req_level = ?,
      breeding_req_quality = ?,
      breeding_req_fast = ?
    WHERE chatId = ?
  `).run(req_level, req_quality, req_fast ? 1 : 0, chatId);
}

module.exports = { saveUser, setPlayerId, getPlayerId, getUser, setBreedingSettings };
