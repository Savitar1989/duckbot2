const db = require("./database");

const QUALITY_RANK = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
const MAX_AGE_MS = 1000 * 60 * 60; // 1 hour

function addBreedingLink(chatId, duckId, quality, level, link, criteria = {}) {
  db.prepare(`
    INSERT INTO breeding (ownerChatId, duckId, quality, level, link, status,
      req_min_level, req_min_quality, req_fast_only, created_at)
    VALUES (?, ?, ?, ?, ?, 'available', ?, ?, ?, ?)
  `).run(
    chatId,
    duckId,
    quality.toUpperCase(),
    level,
    link,
    criteria.req_min_level ?? 0,
    (criteria.req_min_quality ?? 'NONE').toUpperCase(),
    criteria.req_fast_only ? 1 : 0,
    Date.now()
  );
}

function getUserLinks(chatId) {
  return db
    .prepare(`SELECT * FROM breeding WHERE ownerChatId = ? AND status = 'available'`)
    .all(chatId);
}

// atomic claim
function removeLink(linkId) {
  const res = db
    .prepare(`UPDATE breeding SET status = 'taken' WHERE id = ? AND status = 'available'`)
    .run(linkId);

  return res.changes === 1;
}

function findMatches(quality, level, requesterChatId = null, userDuck = null) {
  const now = Date.now();

  const rows = db
    .prepare(`
      SELECT * FROM breeding
      WHERE status = 'available'
        AND quality = ?
        AND level >= ?
        AND created_at > ?
    `)
    .all(quality.toUpperCase(), level, now - MAX_AGE_MS);

  const filtered = rows.filter(r => {
    if (requesterChatId && r.ownerChatId === requesterChatId) return false;

    if (userDuck) {
      if (r.req_min_level && userDuck.level < r.req_min_level) return false;

      if (r.req_min_quality && r.req_min_quality !== 'NONE') {
        const reqRank = QUALITY_RANK[r.req_min_quality] ?? 0;
        const userRank = QUALITY_RANK[userDuck.quality] ?? 0;
        if (userRank < reqRank) return false;
      }

      if (r.req_fast_only) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    if (userDuck) {
      const diffA = Math.abs(a.level - userDuck.level);
      const diffB = Math.abs(b.level - userDuck.level);
      if (diffA !== diffB) return diffA - diffB;
    }
    return b.created_at - a.created_at;
  });

  return filtered;
}

function getLinkById(id) {
  return db.prepare(`SELECT * FROM breeding WHERE id = ?`).get(id);
}

module.exports = {
  addBreedingLink,
  getUserLinks,
  removeLink,
  findMatches,
  getLinkById,
  QUALITY_RANK
};