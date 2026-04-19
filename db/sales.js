const db = require("./database");

function saveSalesBulk(sales) {
  const stmt = db.prepare(`
    INSERT INTO sales (duck_id, quality, level, size, price, currency, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const trx = db.transaction((rows) => {
    for (const s of rows) {
      stmt.run(s.duckId, s.quality, s.level, s.size, s.price, s.currency, s.timestamp);
    }
  });

  trx(sales);
}

function getLastSales(limit = 50) {
  return db.prepare(`SELECT * FROM sales ORDER BY timestamp DESC LIMIT ?`).all(limit);
}

function getAvgPrices() {
  return db.prepare(`
    SELECT quality, level, size, currency, AVG(price) as avg_price, COUNT(*) as count
    FROM sales
    GROUP BY quality, level, size, currency
  `).all();
}

module.exports = { saveSalesBulk, getLastSales, getAvgPrices };