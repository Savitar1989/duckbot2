const Database = require("better-sqlite3");
const db = new Database("duck.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  chatId INTEGER PRIMARY KEY,
  playerId INTEGER,
  breeding_req_level INTEGER DEFAULT 0,
  breeding_req_quality TEXT DEFAULT 'NONE',
  breeding_req_fast INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ducks (
  id INTEGER PRIMARY KEY,
  quality TEXT,
  level INTEGER,
  ownerId INTEGER,
  position INTEGER,
  eta_low REAL,
  eta_high REAL,
  confidence INTEGER DEFAULT 0,
  speed_avg REAL,
  timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS duck_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  duck_id INTEGER,
  position INTEGER,
  timestamp INTEGER
);
CREATE INDEX IF NOT EXISTS idx_duck_history ON duck_history(duck_id, timestamp);

CREATE TABLE IF NOT EXISTS alerts (
  chatId INTEGER,
  type TEXT,
  enabled INTEGER DEFAULT 1,
  threshold INTEGER,
  PRIMARY KEY(chatId, type)
);

CREATE TABLE IF NOT EXISTS breeding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ownerChatId INTEGER,
  duckId INTEGER,
  quality TEXT,
  level INTEGER,
  link TEXT,
  status TEXT DEFAULT 'available',
  req_min_level INTEGER DEFAULT 0,
  req_min_quality TEXT DEFAULT 'NONE',
  req_fast_only INTEGER DEFAULT 0,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS snipers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chatId INTEGER,
  quality TEXT,
  level INTEGER,
  collection TEXT,
  position_threshold INTEGER DEFAULT 100,
  active INTEGER DEFAULT 1,
  last_notified INTEGER
);

CREATE TABLE IF NOT EXISTS bot_state (
  chatId INTEGER PRIMARY KEY,
  state TEXT,
  data TEXT
);
`);

module.exports = db;
