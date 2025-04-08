const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../youtube_channeldata.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('SQLite Error:', err.message);
  else console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS channel_info (
      channel_id TEXT PRIMARY KEY,
      title TEXT,
      logo_url TEXT,
      description TEXT,
      view_count INTEGER,
      subscriber_count INTEGER,
      video_count INTEGER,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS videos (
      video_id TEXT PRIMARY KEY,
      channel_id TEXT,
      title TEXT,
      description TEXT,
      published_at TEXT,
      thumbnail_url TEXT,
      view_count INTEGER,
      like_count INTEGER,
      comment_count INTEGER,
      duration TEXT,
      engagement_rate REAL,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channel_info(channel_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS channel_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT,
      date TEXT,
      views INTEGER,
      subscribers INTEGER,
      videos INTEGER,
      last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(channel_id, date),
      FOREIGN KEY (channel_id) REFERENCES channel_info(channel_id)
    )
  `);

  db.run('CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at)');
  db.run('CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_channel_stats_date ON channel_stats(date)');
});

module.exports = db;
