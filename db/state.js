const db = require("./database");

const STATE_TTL_MS = 1000 * 60 * 10; // 10 minutes

function setState(chatId, state, data = null) {
  db.prepare(`
    INSERT INTO bot_state (chatId, state, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(chatId) DO UPDATE SET 
      state = excluded.state, 
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(
    chatId,
    state,
    data ? JSON.stringify(data) : null,
    Date.now()
  );
}

function getState(chatId) {
  const row = db
    .prepare(`SELECT state, data, updated_at FROM bot_state WHERE chatId = ?`)
    .get(chatId);

  if (!row) return { state: null, data: null };

  // TTL check
  if (row.updated_at && Date.now() - row.updated_at > STATE_TTL_MS) {
    clearState(chatId);
    return { state: null, data: null };
  }

  let parsed = null;

  if (row.data) {
    try {
      parsed = JSON.parse(row.data);
    } catch (e) {
      parsed = null; // prevent crash
    }
  }

  return {
    state: row.state || null,
    data: parsed
  };
}

function clearState(chatId) {
  db.prepare(`DELETE FROM bot_state WHERE chatId = ?`).run(chatId);
}

// optional helper for partial updates
function updateStateData(chatId, patch) {
  const { state, data } = getState(chatId);
  const newData = { ...(data || {}), ...patch };
  setState(chatId, state, newData);
}

module.exports = { setState, getState, clearState, updateStateData };