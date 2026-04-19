const db = require("./database");

function setAlert(chatId, type, enabled, threshold = null) {
  db.prepare(`
    INSERT INTO alerts (chatId, type, enabled, threshold)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chatId, type) DO UPDATE SET
      enabled = excluded.enabled,
      threshold = excluded.threshold
  `).run(chatId, type, enabled ? 1 : 0, threshold);
}

function getAlert(chatId, type) {
  return db.prepare(`SELECT * FROM alerts WHERE chatId = ? AND type = ?`).get(chatId, type);
}

// JOIN users to avoid N+1
function getAlertUsers(type) {
  return db.prepare(`
    SELECT a.chatId, a.threshold, u.playerId
    FROM alerts a
    JOIN users u ON a.chatId = u.chatId
    WHERE a.type = ? AND a.enabled = 1
  `).all(type);
}

module.exports = { setAlert, getAlert, getAlertUsers };