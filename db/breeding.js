const db = require("./database");

const QUALITY_RANK = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };

function addBreedingLink(chatId, duckId, quality, level, link, criteria = {}) {
  db.prepare(`
    INSERT INTO breeding (ownerChatId, duckId, quality, level, link, status,
      req_min_level, req_min_quality, req_fast_only, created_at)
    VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)
  `).run(chatId, duckId, quality.toUpperCase(), level, link,
    criteria.req_min_level ?? 0,
    criteria.req_min_quality ?? 'NONE',
    criteria.req_fast_only ? 1 : 0,
    Date.now());
}

function getUserLinks(chatId) {
  return db.prepare(`SELECT * FROM breeding WHERE ownerChatId = ? AND status = 'available'`).all(chatId);
}

function removeLink(linkId) {
  db.prepare(`UPDATE breeding SET status = 'taken' WHERE id = ?`).run(linkId);
}

function findMatches(quality, level) {
  const qualityRank = QUALITY_RANK[quality.toUpperCase()] ?? 0;
  return db.prepare(`
    SELECT * FROM breeding
    WHERE status = 'available'
      AND quality = ?
      AND level >= ?
    ORDER BY created_at ASC
  `).all(quality.toUpperCase(), level);
}

function getLinkById(id) {
  return db.prepare(`SELECT * FROM breeding WHERE id = ?`).get(id);
}

module.exports = { addBreedingLink, getUserLinks, removeLink, findMatches, getLinkById, QUALITY_RANK };
