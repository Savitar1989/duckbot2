const db = require("./database");

function saveDucksBulk(ducks) {
  const upsert = db.prepare(`
    INSERT INTO ducks (id, quality, level, ownerId, position, eta_low, eta_high, confidence, speed_avg, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      quality = excluded.quality,
      level = excluded.level,
      ownerId = excluded.ownerId,
      position = excluded.position,
      eta_low = excluded.eta_low,
      eta_high = excluded.eta_high,
      confidence = excluded.confidence,
      speed_avg = excluded.speed_avg,
      timestamp = excluded.timestamp
  `);

  const insertHistory = db.prepare(`
    INSERT INTO duck_history (duck_id, position, timestamp) VALUES (?, ?, ?)
  `);

  const trx = db.transaction((rows) => {
    for (const d of rows) {
      upsert.run(d.id, d.quality, d.level, d.ownerId, d.position,
        d.eta_low ?? null, d.eta_high ?? null, d.confidence ?? 0, d.speed_avg ?? null, d.timestamp);
      insertHistory.run(d.id, d.position, d.timestamp);
    }
  });

  trx(ducks);
}

function getUserMarketDucks(playerId) {
  return db.prepare(`SELECT * FROM ducks WHERE ownerId = ?`).all(playerId);
}

function getDuckHistory(duckId, limit = 20) {
  return db.prepare(`
    SELECT * FROM duck_history WHERE duck_id = ?
    ORDER BY timestamp DESC LIMIT ?
  `).all(duckId, limit);
}

function getAllActiveDucks() {
  return db.prepare(`SELECT * FROM ducks ORDER BY position ASC`).all();
}

module.exports = { saveDucksBulk, getUserMarketDucks, getDuckHistory, getAllActiveDucks };
