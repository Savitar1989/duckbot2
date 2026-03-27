const db = require("./database");

function addSniper(chatId, { quality, level, collection, position_threshold }) {
  return db.prepare(`
    INSERT INTO snipers (chatId, quality, level, collection, position_threshold, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(chatId, quality, level, collection ?? null, position_threshold ?? 100).lastInsertRowid;
}

function getUserSnipers(chatId) {
  return db.prepare(`SELECT * FROM snipers WHERE chatId = ? AND active = 1`).all(chatId);
}

function removeSniper(id) {
  db.prepare(`UPDATE snipers SET active = 0 WHERE id = ?`).run(id);
}

function getAllActiveSnipers() {
  return db.prepare(`SELECT * FROM snipers WHERE active = 1`).all();
}

function updateLastNotified(id) {
  db.prepare(`UPDATE snipers SET last_notified = ? WHERE id = ?`).run(Date.now(), id);
}

module.exports = { addSniper, getUserSnipers, removeSniper, getAllActiveSnipers, updateLastNotified };
