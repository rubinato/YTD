require('dotenv').config();
const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');
const db = require('./db');
const {
  connectRedis,
  getCache,
  setCache,
  deleteCache,
  getKeys,
  quitRedis,
} = require('./redis');
const { fullRefresh, incrementalRefresh } = require('./youtube');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client/build')));

// Environment Variables
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
if (!process.env.YOUTUBE_API_KEY || !CHANNEL_ID) {
  console.error(
    'Missing required environment variables: YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID must be set in .env file.'
  );
  process.exit(1);
}

// Constants
const CACHE_TTL = 24 * 60 * 60; // 24 hours in seconds
const dbPath = path.join(__dirname, '../youtube_channeldata.db');

// Helper Functions for Database Queries
const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        console.error('Database run error:', err.message);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

const getQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        console.error('Database get error:', err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const allQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error('Database all error:', err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Caching Utility
const withCache = async (cacheKey, fetchFunction, ttl = CACHE_TTL) => {
  try {
    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for key: ${cacheKey}`);
      return cachedData;
    }
    console.log(`Cache miss for key: ${cacheKey}. Fetching data...`);
    const data = await fetchFunction();
    await setCache(cacheKey, data, ttl);
    return data;
  } catch (err) {
    console.error(`Error in caching utility for key ${cacheKey}:`, err.message);
    throw err;
  }
};

// Function to calculate engagement rate
const calculateEngagementRate = (like_count, comment_count, view_count) => {
  const totalInteractions = like_count + comment_count;
  return view_count > 0 ? (totalInteractions / view_count) * 100 : 0;
};

// Data Initialization
const initializeData = async () => {
  try {
    console.log('Initializing data...');
    const dbExists = fs.existsSync(dbPath);

    if (!dbExists) {
      console.log('Database file is missing, performing full refresh...');
      await fullRefresh(wss);
      console.log('Full refresh completed.');
    } else {
      console.log('Database file exists, performing incremental refresh...');
      await incrementalRefresh(wss);
      console.log('Incremental refresh completed.');
    }
  } catch (err) {
    console.error('Error during server startup refresh:', err.message);
    throw err;
  }
};

// API Endpoints
app.get('/api/years', async (req, res) => {
  try {
    const cacheKey = `years:${CHANNEL_ID}`;
    const fetchYears = async () => {
      const years = await allQuery(
        `SELECT DISTINCT strftime('%Y', published_at) AS year 
         FROM videos 
         WHERE channel_id = ? 
         ORDER BY year DESC`,
        [CHANNEL_ID]
      );
      return years.map((year) => year.year);
    };

    const yearsArray = await withCache(cacheKey, fetchYears);
    res.json(yearsArray);
  } catch (error) {
    console.error('Error fetching years:', error.message);
    res.status(500).json({ error: 'Failed to fetch years' });
  }
});

app.get('/api/monthly-channel-stats', async (req, res) => {
  try {
    const cacheKey = `monthly-channel-stats:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const query = `
      SELECT
        strftime('%Y-%m', published_at) AS month,
        SUM(view_count) AS total_views,
        SUM(like_count) AS total_likes,
        SUM(comment_count) AS total_comments,
        AVG((CAST(like_count AS REAL) + comment_count) / view_count * 100) AS avg_engagement_rate
      FROM videos
      WHERE channel_id = ?
      GROUP BY month
      ORDER BY month;
    `;
    const params = [CHANNEL_ID];

    const monthlyStats = await allQuery(query, params);
    const result = {};
    monthlyStats.forEach((stat) => {
      result[stat.month] = {
        view_count: stat.total_views,
        like_count: stat.total_likes,
        comment_count: stat.total_comments,
        engagement_rate: stat.avg_engagement_rate,
      };
    });

    await setCache(cacheKey, result, CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('Error fetching monthly channel stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch monthly channel stats' });
  }
});

app.get('/api/yearly-stats', async (req, res) => {
  try {
    const cacheKey = `yearly-stats:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const query = `
      SELECT
        strftime('%Y', published_at) AS year,
        SUM(view_count) AS total_views,
        SUM(like_count) AS total_likes,
        SUM(comment_count) AS total_comments,
        AVG((CAST(like_count AS REAL) + comment_count) / view_count * 100) AS avg_engagement_rate
      FROM videos
      WHERE channel_id = ?
      GROUP BY year
      ORDER BY year;
    `;
    const params = [CHANNEL_ID];

    const yearlyStats = await allQuery(query, params);
    const result = {
      All: { total_views: 0, like_count: 0, comment_count: 0, engagement_rate: 0 },
    };
    let totalEngagementRate = 0;
    let validYearsCount = 0;
    yearlyStats.forEach((stat) => {
      result[stat.year] = {
        total_views: stat.total_views,
        like_count: stat.total_likes,
        comment_count: stat.total_comments,
        engagement_rate: stat.avg_engagement_rate,
      };
      result.All.total_views += stat.total_views;
      result.All.like_count += stat.total_likes;
      result.All.comment_count += stat.total_comments;
      if (stat.avg_engagement_rate > 0) {
        totalEngagementRate += stat.avg_engagement_rate;
        validYearsCount++;
      }
    });
    result.All.engagement_rate =
      validYearsCount > 0 ? totalEngagementRate / validYearsCount : 0;

    await setCache(cacheKey, result, CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('Error fetching yearly stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch yearly stats' });
  }
});

app.get('/api/channel', async (req, res) => {
  try {
    const cacheKey = `channel:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const row = await getQuery('SELECT * FROM channel_info WHERE channel_id = ?', [
      CHANNEL_ID,
    ]);
    if (!row) return res.status(404).json({ error: 'No channel data found.' });

    await setCache(cacheKey, row, CACHE_TTL);
    res.json(row);
  } catch (err) {
    console.error('Error fetching channel:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const cacheKey = `stats:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const row = await getQuery('SELECT * FROM channel_info WHERE channel_id = ?', [
      CHANNEL_ID,
    ]);
    if (!row) return res.status(404).json({ error: 'No channel stats found.' });

    await setCache(cacheKey, row, CACHE_TTL);
    res.json(row);
  } catch (err) {
    console.error('Error fetching channel stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/channel-stats', async (req, res) => {
  try {
    const cacheKey = `channel-stats:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const stats = await allQuery('SELECT * FROM channel_stats WHERE channel_id = ?', [
      CHANNEL_ID,
    ]);
    if (!stats) return res.status(404).json({ error: 'No channel stats found.' });

    await setCache(cacheKey, stats, CACHE_TTL);
    res.json(stats);
  } catch (err) {
    console.error('Error fetching channel stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/videos', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const sort = req.query.sort || 'published_at';
  const sortDirection = req.query.sortDirection || 'DESC';
  const offset = (page - 1) * limit;
  const year = req.query.year;
  const month = req.query.month;

  const validSortColumns = ['published_at', 'last_updated', 'view_count', 'like_count', 'comment_count', 'engagement_rate'];
  const validSortDirections = ['ASC', 'DESC'];
  const sortColumn = validSortColumns.includes(sort) ? sort : 'published_at';
  const direction = validSortDirections.includes(sortDirection.toUpperCase())
    ? sortDirection.toUpperCase()
    : 'DESC';

  let cacheKey = `videos:${CHANNEL_ID}:page:${page}:limit:${limit}:sort:${sortColumn}:direction:${direction}`;
    if (year) cacheKey += `:year:${year}`;
    if (month) cacheKey += `:month:${month}`;

  try {
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    let query = `SELECT *, (CAST(like_count AS REAL) + comment_count) / view_count * 100 AS engagement_rate FROM videos WHERE channel_id = ?`;
    let params = [CHANNEL_ID];

    if (year) {
        query += ` AND strftime('%Y', published_at) = ?`;
        params.push(year);
    }
    if (month) {
        query += ` AND strftime('%Y-%m', published_at) = ?`;
        params.push(month);
    }

    query += ` ORDER BY ${sortColumn} ${direction} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const videos = await allQuery(query, params);
    const countRow = await getQuery('SELECT COUNT(*) as total FROM videos WHERE channel_id = ?', [
      CHANNEL_ID,
    ]);
    const responseData = { videos, total: countRow.total, page, limit };

    await setCache(cacheKey, responseData, CACHE_TTL);
    res.json(responseData);
  } catch (err) {
    console.error('Error fetching videos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/highlight-videos', async (req, res) => {
  try {
    const cacheKey = `highlight-videos:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const latestVideo = await getQuery(
      'SELECT *, (CAST(like_count AS REAL) + comment_count) / view_count * 100 AS engagement_rate FROM videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 1',
      [CHANNEL_ID]
    );
    const mostLikedVideo = await getQuery(
      'SELECT *, (CAST(like_count AS REAL) + comment_count) / view_count * 100 AS engagement_rate FROM videos WHERE channel_id = ? ORDER BY like_count DESC LIMIT 1',
      [CHANNEL_ID]
    );
    const mostCommentedVideo = await getQuery(
      'SELECT *, (CAST(like_count AS REAL) + comment_count) / view_count * 100 AS engagement_rate FROM videos WHERE channel_id = ? ORDER BY comment_count DESC LIMIT 1',
      [CHANNEL_ID]
    );

    const highlightVideos = {
      latest: latestVideo || null,
      mostLiked: mostLikedVideo || null,
      mostCommented: mostCommentedVideo || null,
    };

    if (!latestVideo && !mostLikedVideo && !mostCommentedVideo) {
      return res.status(404).json({ error: 'No highlight videos found.' });
    }

    await setCache(cacheKey, highlightVideos, CACHE_TTL);
    res.json(highlightVideos);
  } catch (err) {
    console.error('Error fetching highlight videos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/top-videos', async (req, res) => {
  try {
    const cacheKey = `top-videos:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const videos = await allQuery(
      'SELECT *, (CAST(like_count AS REAL) + comment_count) / view_count * 100 AS engagement_rate FROM videos WHERE channel_id = ? AND published_at >= ? ORDER BY view_count DESC LIMIT 10',
      [CHANNEL_ID, '2020-01-01T00:00:00Z']
    );
    if (!videos || videos.length === 0) {
      return res.status(404).json({ error: 'No top videos found.' });
    }

    const formattedVideos = videos.map((video) => ({
      video_id: video.video_id,
      title: video.title,
      published_at: video.published_at,
      views: video.view_count,
      likes: video.like_count,
      comments: video.comment_count,
      engagement_rate: video.engagement_rate,
    }));

    await setCache(cacheKey, formattedVideos, CACHE_TTL);
    res.json(formattedVideos);
  } catch (err) {
    console.error('Error fetching top videos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/top-videos-by-month', async (req, res) => {
  const month = req.query.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM.' });
  }

  try {
    const cacheKey = `top-videos-by-month:${CHANNEL_ID}:${month}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const startDate = `${month}-01T00:00:00Z`;
    const endDate = new Date(
      new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)
    )
      .toISOString()
      .split('T')[0] + 'T00:00:00Z';
    const videos = await allQuery(
      'SELECT *, (CAST(like_count AS REAL) + comment_count) / view_count * 100 AS engagement_rate FROM videos WHERE channel_id = ? AND published_at >= ? AND published_at < ? ORDER BY view_count DESC LIMIT 10',
      [CHANNEL_ID, startDate, endDate]
    );
    if (!videos || videos.length === 0) {
      return res
        .status(404)
        .json({ error: 'No top videos found for the specified month.' });
    }

    const formattedVideos = videos.map((video) => ({
      video_id: video.video_id,
      title: video.title,
      published_at: video.published_at,
      views: video.view_count,
      likes: video.like_count,
      comments: video.comment_count,
      engagement_rate: video.engagement_rate,
    }));

    await setCache(cacheKey, formattedVideos, CACHE_TTL);
    res.json(formattedVideos);
  } catch (err) {
    console.error('Error fetching top videos by month:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/most-viewed-videos', async (req, res) => {
  const year = req.query.year;
  const month = req.query.month;
  if (!year || !month || !/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
    return res
      .status(400)
      .json({ error: 'Invalid year or month format. Use year=YYYY and month=MM.' });
  }

  try {
    const cacheKey = `most-viewed-videos:${CHANNEL_ID}:${year}-${month}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const startDate = `${year}-${month}-01T00:00:00Z`;
    const endDate = new Date(
      new Date(startDate).setMonth(new Date(startDate).getMonth() + 1)
    )
      .toISOString()
      .split('T')[0] + 'T00:00:00Z';
    const videos = await allQuery(
      'SELECT * FROM videos WHERE channel_id = ? AND published_at >= ? AND published_at < ? ORDER BY view_count DESC LIMIT 5',
      [CHANNEL_ID, startDate, endDate]
    );
    if (!videos || videos.length === 0) {
      return res
        .status(404)
        .json({ error: 'No most viewed videos found for the specified month.' });
    }

    await setCache(cacheKey, videos, CACHE_TTL);
    res.json(videos);
  } catch (err) {
    console.error('Error fetching most viewed videos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/full-sync', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log(`Full sync started at: ${new Date(startTime).toISOString()}`);

    await fullRefresh(wss);

    const endTime = Date.now();
    console.log(`Full sync completed at: ${new Date(endTime).toISOString()}`);
    const refreshCompletion = ((endTime - startTime) / 1000).toFixed(2); // Duration in seconds
    console.log(`Full sync took ${refreshCompletion} seconds to complete.`);

    const keys = await getKeys(`*${CHANNEL_ID}*`);
    if (keys.length > 0) await Promise.all(keys.map((key) => deleteCache(key)));

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            message: 'Full sync completed successfully',
            type: 'success',
            id: Date.now(),
          })
        );
      }
    });

    res.json({
      message: 'Full sync completed successfully',
      startTime,
      endTime,
      refreshCompletion,
    });
  } catch (err) {
    console.error('Error during full sync:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/refresh', async (req, res) => {
  try {
    const startTime = Date.now();
    console.log(`Incremental refresh started at: ${new Date(startTime).toISOString()}`);

    const updateTimestamp = await incrementalRefresh(wss);

    const endTime = Date.now();
    console.log(`Incremental refresh completed at: ${new Date(endTime).toISOString()}`);
    const refreshCompletion = ((endTime - startTime) / 1000).toFixed(2); // Duration in seconds
    console.log(`Incremental refresh took ${refreshCompletion} seconds to complete.`);

    const keys = await getKeys(`*${CHANNEL_ID}*`);
    if (keys.length > 0) await Promise.all(keys.map((key) => deleteCache(key)));

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            message: 'Data refreshed successfully',
            type: 'success',
            id: Date.now(),
          })
        );
      }
    });

    res.json({
      message: 'Data refreshed successfully',
      startTime,
      endTime,
      refreshCompletion,
      timestamp: updateTimestamp,
    });
  } catch (err) {
    console.error('Error refreshing data:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/monthly-stats-all', async (req, res) => {
  try {
    const cacheKey = `monthly-stats-all:${CHANNEL_ID}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const query = `
      SELECT
        strftime('%Y', published_at) AS year,
        strftime('%m', published_at) AS month,
        SUM(view_count) AS total_views,
        SUM(like_count) AS like_count,
        SUM(comment_count) AS comment_count
      FROM videos
      WHERE channel_id = ?
      GROUP BY year, month
      ORDER BY year, month;
    `;
    const params = [CHANNEL_ID];

    const monthlyStats = await allQuery(query, params);
    const result = {};
    monthlyStats.forEach((stat) => {
      if (!result[stat.year]) {
        result[stat.year] = {};
      }
      result[stat.year][stat.month] = {
        total_views: stat.total_views,
        like_count: stat.like_count,
        comment_count: stat.comment_count,
      };
    });

    await setCache(cacheKey, result, CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('Error fetching monthly stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch monthly stats' });
  }
});

// WebSocket Server
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket connection established.');
});

// Serve React App
const buildPath = path.join(__dirname, '../client/build');

app.get('*', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  fs.access(indexPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(
        'Error: index.html not found in build directory. Check your build process.'
      );
      res.status(500).send('Internal Server Error');
    } else {
      res.sendFile(indexPath);
    }
  });
});

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('Closing database and Redis connections...');
  await Promise.all([
    new Promise((resolve, reject) =>
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      })
    ),
    quitRedis(),
  ])
    .then(() => {
      console.log('Database and Redis connections closed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Error closing database or Redis:', err.message);
      process.exit(1);
    });
});

// Start Server
server.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  try {
    await initializeData();
    console.log('Server initialization completed.');
  } catch (err) {
    console.error('Error during server initialization:', err.message);
    process.exit(1);
  }
});
