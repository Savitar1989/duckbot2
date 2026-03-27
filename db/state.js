const db = require("./database");

function setState(chatId, state, data = null) {
  db.prepare(`
    INSERT INTO bot_state (chatId, state, data)
    VALUES (?, ?, ?)
    ON CONFLICT(chatId) DO UPDATE SET state = excluded.state, data = excluded.data
  `).run(chatId, state, data ? JSON.stringify(data) : null);
}

function getState(chatId) {
  const row = db.prepare(`SELECT state, data FROM bot_state WHERE chatId = ?`).get(chatId);
  if (!row) return { state: null, data: null };
  return { state: row.state, data: row.data ? JSON.parse(row.data) : null };
}

function clearState(chatId) {
  db.prepare(`DELETE FROM bot_state WHERE chatId = ?`).run(chatId);
}

module.exports = { setState, getState, clearState };
