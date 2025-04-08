const axios = require('axios');
const db = require('./db');

// Environment variables for YouTube API
const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Validate environment variables at startup
if (!API_KEY || API_KEY === 'your_new_api_key_here') {
  console.error('Invalid YOUTUBE_API_KEY: Please provide a valid API key in the .env file.');
  process.exit(1);
}

if (!CHANNEL_ID) {
  console.error('Missing YOUTUBE_CHANNEL_ID: Please provide a valid channel ID in the .env file.');
  process.exit(1);
}

// Threshold for incremental refresh (24 hours in milliseconds)
const REFRESH_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

// Helper function to run SQL queries with Promise
const runQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

// Helper function to get SQL query results with Promise
const getQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

// Helper function to get all SQL query results with Promise
const allQuery = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Reusable function for making YouTube API requests
const fetchYouTubeData = async (endpoint, params = {}, retries = 3) => {
  try {
    const response = await axios.get(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
      params: {
        key: API_KEY,
        ...params,
      },
    });
    return response.data;
  } catch (apiErr) {
    if (retries > 0) {
      console.warn(`Retrying YouTube API call (${endpoint})... Attempts left: ${retries}`);
      return fetchYouTubeData(endpoint, params, retries - 1);
    }
    if (apiErr.response) {
      console.error(`YouTube API Error Response (${endpoint}):`, JSON.stringify(apiErr.response.data, null, 2));
      if (apiErr.response.status === 400) {
        throw new Error('Bad Request: Check if the API key or parameters are valid.');
      } else if (apiErr.response.status === 403) {
        throw new Error('YouTube API quota exceeded or access forbidden. Check your API key restrictions or quota limits.');
      } else if (apiErr.response.status === 404) {
        throw new Error('Resource not found. Verify the channel ID or other parameters.');
      }
    }
    throw apiErr;
  }
};

// Function to calculate engagement rate
const calculateEngagementRate = (like_count, comment_count, view_count) => {
  const totalInteractions = like_count + comment_count;
  return view_count > 0 ? (totalInteractions / view_count) * 100 : 0;
};

// Use transactions for bulk inserts
const insertVideosInTransaction = async (videos) => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const videoStmt = db.prepare(`
        INSERT OR REPLACE INTO videos (video_id, channel_id, title, description, thumbnail_url, published_at, view_count, like_count, comment_count, duration, engagement_rate, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      videos.forEach((video) => {
        const engagement_rate = calculateEngagementRate(video.like_count, video.comment_count, video.view_count);
        videoStmt.run([
          video.video_id,
          video.channel_id,
          video.title,
          video.description,
          video.thumbnail_url,
          video.published_at,
          video.view_count,
          video.like_count,
          video.comment_count,
          video.duration,
          engagement_rate,
          video.last_updated,
        ]);
      });
      videoStmt.finalize((err) => {
        if (err) {
          db.run('ROLLBACK');
          reject(err);
        } else {
          db.run('COMMIT');
          resolve();
        }
      });
    });
  });
};

// Function to perform a full refresh from YouTube API
const fullRefresh = async (wss) => {
  try {
    console.log('Starting full refresh from YouTube API...');

    // Fetch channel info, stats, and uploads playlist ID
    console.log('Fetching channel info, statistics, and uploads playlist...');
    const channelResponse = await fetchYouTubeData('channels', {
      part: 'snippet,statistics,contentDetails',
      id: CHANNEL_ID,
    });

    if (!channelResponse.items || channelResponse.items.length === 0) {
      throw new Error('No channel data returned from YouTube API. Verify the CHANNEL_ID.');
    }

    const channelData = channelResponse.items[0];
    const channelInfo = {
      channel_id: CHANNEL_ID,
      title: channelData.snippet.title,
      description: channelData.snippet.description,
      logo_url: channelData.snippet.thumbnails.high.url,
      view_count: parseInt(channelData.statistics.viewCount, 10),
      subscriber_count: parseInt(channelData.statistics.subscriberCount, 10),
      video_count: parseInt(channelData.statistics.videoCount, 10),
      last_updated: new Date().toISOString(),
    };

    const uploadsPlaylistId = channelData.contentDetails.relatedPlaylists.uploads;
    if (!uploadsPlaylistId) {
      throw new Error('Uploads playlist ID not found for the channel');
    }

    console.log(`Fetched channel info: ${channelInfo.title}, Stats - Subscribers: ${channelInfo.subscriber_count}, Views: ${channelInfo.view_count}, Videos: ${channelInfo.video_count}`);
    console.log(`Uploads playlist ID: ${uploadsPlaylistId}`);

    // Fetch all video IDs from the uploads playlist
    const allVideoIds = new Set();
    let nextPageToken = null;
    let totalVideosFetched = 0;
    let apiCalls = 0;

    do {
      console.log(`Fetching batch of video IDs from playlist (pageToken: ${nextPageToken || 'none'})...`);
      const playlistResponse = await fetchYouTubeData('playlistItems', {
        part: 'contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      apiCalls++;
      const videos = playlistResponse.items;
      const newVideoIds = videos.map((item) => item.contentDetails.videoId);
      newVideoIds.forEach((videoId) => allVideoIds.add(videoId));
      totalVideosFetched = allVideoIds.size;
      console.log(`Fetched ${newVideoIds.length} video IDs in this batch. Total unique video IDs: ${totalVideosFetched}`);

      nextPageToken = playlistResponse.nextPageToken;
    } while (nextPageToken);

    const videoIdsArray = Array.from(allVideoIds);
    console.log(`Completed fetching video IDs. Total unique videos: ${videoIdsArray.length}, Total API calls for playlist: ${apiCalls}`);

    // Fetch video details in batches of 50
    const allVideos = [];
    for (let i = 0; i < videoIdsArray.length; i += 50) {
      const batchIds = videoIdsArray.slice(i, i + 50).join(',');
      console.log(`Fetching details for video batch ${i / 50 + 1} (${batchIds.split(',').length} videos)...`);
      const videoDetailsResponse = await fetchYouTubeData('videos', {
        part: 'snippet,statistics,contentDetails',
        id: batchIds,
      });

      apiCalls++;
      const videoDetails = videoDetailsResponse.items;
      console.log(`Fetched details for ${videoDetails.length} videos in this batch.`);

      const formattedVideos = videoDetails.map((item) => ({
        video_id: item.id,
        channel_id: CHANNEL_ID,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
        published_at: item.snippet.publishedAt,
        view_count: parseInt(item.statistics.viewCount || 0, 10),
        like_count: parseInt(item.statistics.likeCount || 0, 10),
        comment_count: parseInt(item.statistics.commentCount || 0, 10),
        duration: item.contentDetails?.duration || '',
        last_updated: new Date().toISOString(),
      }));

      allVideos.push(...formattedVideos);
    }

    console.log(`Completed fetching video details. Total videos: ${allVideos.length}, Total API calls: ${apiCalls}`);

    if (allVideos.length > 0) {
      console.log('Inserting videos into database using transactions...');
      await insertVideosInTransaction(allVideos);
      console.log(`Inserted ${allVideos.length} videos into the database.`);
    } else {
      console.log('No videos to insert into database.');
    }

    console.log('Full refresh completed successfully.');
  } catch (err) {
    console.error('Error during full refresh:', err.message);
    throw err;
  }
};

// Function to perform an incremental refresh
const incrementalRefresh = async (wss) => {
  try {
    console.log('Starting incremental refresh from YouTube API...');

    // Check last_updated for channel_info
    const channelInfoRow = await getQuery('SELECT last_updated FROM channel_info WHERE channel_id = ?', [CHANNEL_ID]);
    const channelInfoNeedsUpdate = !channelInfoRow || (new Date() - new Date(channelInfoRow.last_updated)) > REFRESH_THRESHOLD;

    // Check for new videos
    const latestVideo = await getQuery('SELECT MAX(published_at) as latest_published FROM videos WHERE channel_id = ?', [CHANNEL_ID]);
    const latestPublishedAt = latestVideo?.latest_published || '1970-01-01T00:00:00Z';

    console.log('Latest published_at in database:', latestPublishedAt);
    console.log('Fetching videos published after:', latestPublishedAt);

    if (channelInfoNeedsUpdate) {
      console.log('Updating channel info and stats...');
      const channelResponse = await fetchYouTubeData('channels', {
        part: 'snippet,statistics,contentDetails',
        id: CHANNEL_ID,
      });

      if (!channelResponse.items || channelResponse.items.length === 0) {
        throw new Error('No channel data returned from YouTube API');
      }

      const channelData = channelResponse.items[0];
      const channelInfo = {
        channel_id: CHANNEL_ID,
        title: channelData.snippet.title,
        description: channelData.snippet.description,
        logo_url: channelData.snippet.thumbnails.high.url,
        view_count: parseInt(channelData.statistics.viewCount, 10),
        subscriber_count: parseInt(channelData.statistics.subscriberCount, 10),
        video_count: parseInt(channelData.statistics.videoCount, 10),
        last_updated: new Date().toISOString(),
      };

      console.log(`Fetched channel info: ${channelInfo.title}, Stats - Subscribers: ${channelInfo.subscriber_count}, Views: ${channelInfo.view_count}, Videos: ${channelInfo.video_count}`);

      await runQuery(
        'INSERT OR REPLACE INTO channel_info (channel_id, title, logo_url, description, view_count, subscriber_count, video_count, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          channelInfo.channel_id,
          channelInfo.title,
          channelInfo.logo_url,
          channelInfo.description,
          channelInfo.view_count,
          channelInfo.subscriber_count,
          channelInfo.video_count,
          channelInfo.last_updated,
        ]
      );
      console.log('Updated channel_info in database.');

      const today = new Date().toISOString().split('T')[0];
      await runQuery(
        'INSERT OR IGNORE INTO channel_stats (channel_id, date, views, subscribers, videos, last_updated) VALUES (?, ?, ?, ?, ?, ?)',
        [
          channelInfo.channel_id,
          today,
          channelInfo.view_count,
          channelInfo.subscriber_count,
          channelInfo.video_count,
          channelInfo.last_updated,
        ]
      );
      console.log('Inserted channel stats for today into database.');
    } else {
      console.log('Channel info and stats are up to date, skipping update.');
    }

    // Fetch the uploads playlist ID
    const channelResponse = await fetchYouTubeData('channels', {
      part: 'contentDetails',
      id: CHANNEL_ID,
    });

    const uploadsPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;

    // Fetch new videos published after the latest video in the database
    console.log(`Fetching videos published after ${latestPublishedAt}...`);
    const newVideoIds = new Set();
    let nextPageToken = null;
    let totalVideosFetched = 0;
    let apiCalls = 0;
    let shouldContinue = true;

    do {
      console.log(`Fetching batch of new video IDs from playlist (pageToken: ${nextPageToken || 'none'})...`);
      const playlistResponse = await fetchYouTubeData('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken: nextPageToken,
      });

      apiCalls++;
      const videos = playlistResponse.items;
      // Filter videos that are newer than the latest published date
      const newVideosInBatch = videos.filter((item) => new Date(item.snippet.publishedAt) > new Date(latestPublishedAt));

      // If the batch has videos, check the earliest video's published date
      if (videos.length > 0) {
        const earliestVideoInBatch = videos[videos.length - 1]; // Last video in the batch (oldest in this page)
        if (new Date(earliestVideoInBatch.snippet.publishedAt) <= new Date(latestPublishedAt)) {
          // If the earliest video in this batch is older than or equal to the latest in the database, stop fetching
          shouldContinue = false;
        }
      }

      // Add new video IDs to the set
      newVideosInBatch.forEach((item) => newVideoIds.add(item.contentDetails.videoId));
      totalVideosFetched = newVideoIds.size;
      console.log(`Found ${newVideosInBatch.length} new video IDs in this batch. Total unique new video IDs: ${totalVideosFetched}`);

      nextPageToken = playlistResponse.nextPageToken;
    } while (nextPageToken && shouldContinue);

    const newVideoIdsArray = Array.from(newVideoIds);
    console.log(`Completed fetching new video IDs. Total unique new videos: ${newVideoIdsArray.length}, Total API calls for playlist: ${apiCalls}`);

    // Fetch details for new videos
    const newVideos = [];
    for (let i = 0; i < newVideoIdsArray.length; i += 50) {
      const batchIds = newVideoIdsArray.slice(i, i + 50).join(',');
      console.log(`Fetching details for new video batch ${i / 50 + 1} (${batchIds.split(',').length} videos)...`);
      const videoDetailsResponse = await fetchYouTubeData('videos', {
        part: 'snippet,statistics,contentDetails',
        id: batchIds,
      });

      apiCalls++;
      const videoDetails = videoDetailsResponse.items;
      console.log(`Fetched details for ${videoDetails.length} new videos in this batch.`);

      const formattedVideos = videoDetails.map((item) => ({
        video_id: item.id,
        channel_id: CHANNEL_ID,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '',
        published_at: item.snippet.publishedAt,
        view_count: parseInt(item.statistics.viewCount || 0, 10),
        like_count: parseInt(item.statistics.likeCount || 0, 10),
        comment_count: parseInt(item.statistics.commentCount || 0, 10),
        duration: item.contentDetails?.duration || '',
        last_updated: new Date().toISOString(),
      }));

      newVideos.push(...formattedVideos);
    }

    console.log(`Completed fetching new video details. Total new videos: ${newVideos.length}, Total API calls: ${apiCalls}`);

    // Insert new videos into the database
    if (newVideos.length > 0) {
      const videoStmt = db.prepare(`
        INSERT OR IGNORE INTO videos (video_id, channel_id, title, description, thumbnail_url, published_at, view_count, like_count, comment_count, duration, engagement_rate, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      newVideos.forEach((video, index) => {
        const engagement_rate = calculateEngagementRate(video.like_count, video.comment_count, video.view_count);
        videoStmt.run([
          video.video_id,
          video.channel_id,
          video.title,
          video.description,
          video.thumbnail_url,
          video.published_at,
          video.view_count,
          video.like_count,
          video.comment_count,
          video.duration,
          engagement_rate,
          video.last_updated,
        ]);
        if ((index + 1) % 50 === 0 || index === newVideos.length - 1) {
          console.log(`Inserted ${index + 1} new videos into database.`);
        }
      });
      videoStmt.finalize();
    } else {
      console.log('No new videos to insert into database.');
    }

    console.log('Incremental refresh completed successfully.');
  } catch (err) {
    console.error('Error during incremental refresh:', err.message);
    throw err;
  }
};

module.exports = { fullRefresh, incrementalRefresh };
