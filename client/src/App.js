import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import EngagementSection from './components/EngagementSection';

// Exporting the formatting functions
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export const formatVideoStats = (num) => {
  if (num === null || num === undefined) return '0';
  if (num < 1000) return num.toString();
  const rounded = Math.round(num / 1000) * 1000;
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formatted}K`;
};

export const formatEngagementRate = (rate) => {
  if (rate === null || rate === undefined) return '0%';
  return `${rate.toFixed(2)}%`;
};

export const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatLastUpdated = (timestamp, duration) => {
  if (!timestamp) return 'Not available';
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const durationText = duration !== null ? ` (${duration} secs)` : '';
  return `${day}/${month}/${year} - ${hours}:${minutes}:${seconds}${durationText}`;
};

function App() {
  const [channel, setChannel] = useState(null);
  const [topVideos, setTopVideos] = useState([]);
  const [highlightVideos, setHighlightVideos] = useState({ latest: null, mostLiked: null, mostCommented: null });
  const [sortMode, setSortMode] = useState('latest');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playingTile, setPlayingTile] = useState(null);
  const [flippedTiles, setFlippedTiles] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshCompletion, setRefreshCompletion] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000');
    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setNotifications((prev) => [...prev, { id: Date.now(), message: data.message, type: data.type }]);
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== data.id));
      }, 5000);
    };
    ws.onerror = (err) => console.error('WebSocket error:', err);
    ws.onclose = () => console.log('WebSocket disconnected');

    return () => ws.close();
  }, []);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const response = await axios.post('/api/refresh');
      const { endTime, refreshCompletion } = response.data;
      setLastUpdated(endTime || new Date().toISOString());
      setRefreshCompletion(refreshCompletion || null);
      localStorage.setItem('lastUpdated', endTime || new Date().toISOString());
      localStorage.setItem('refreshCompletion', refreshCompletion || null); // Corrected key
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.reload();
    } catch (err) {
      setError('Failed to refresh data: ' + (err.response?.data?.error || err.message));
    } finally {
      setRefreshing(false);
    }
  };

  const fetchTopVideos = async (mode) => {
    let sortParam = 'published_at';
    let sortDirection = 'DESC';
    if (mode === 'popular') {
      sortParam = 'view_count';
      sortDirection = 'DESC';
    } else if (mode === 'oldest') {
      sortParam = 'published_at';
      sortDirection = 'ASC';
    }
    try {
      const response = await axios.get(
        `/api/videos?page=1&limit=9&sort=${sortParam}&sortDirection=${sortDirection}`
      );
      setTopVideos(response.data.videos);
    } catch (err) {
      setError('Failed to load top videos: ' + (err.response?.data?.error || err.message));
    }
  };

  const fetchHighlightVideos = async () => {
    try {
      const response = await axios.get('/api/highlight-videos');
      setHighlightVideos(response.data);
    } catch (err) {
      setError('Failed to load highlight videos: ' + (err.response?.data?.error || err.message));
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetchData = async () => {
      try {
        const channelResponse = await axios.get('/api/channel');
        setChannel(channelResponse.data);

        const storedLastUpdated = localStorage.getItem('lastUpdated');
        const storedRefreshCompletion = localStorage.getItem('refreshCompletion');
        if (storedLastUpdated && storedRefreshCompletion) {
          setLastUpdated(parseInt(storedLastUpdated));
          setRefreshCompletion(parseFloat(storedRefreshCompletion));
          localStorage.removeItem('lastUpdated');
          localStorage.removeItem('refreshCompletion');
        } else {
          setLastUpdated(channelResponse.data.last_updated);
          setRefreshCompletion(null);
        }

        await fetchTopVideos(sortMode);
        await fetchHighlightVideos();
      } catch (err) {
        setError('Failed to load data: ' + (err.response?.data?.error || err.message));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sortMode]);

  const videoGrid = [];
  for (let i = 0; i < 3; i++) {
    const row = topVideos.slice(i * 3, (i + 1) * 3);
    videoGrid.push(row);
  }

  const highlightVideoGrid = [
    [highlightVideos.latest, highlightVideos.mostLiked, highlightVideos.mostCommented],
  ];

  const toggleVideo = (tileId) => {
    setPlayingTile(playingTile === tileId ? null : tileId);
  };

  const handleFlip = (tileId) => {
    setFlippedTiles((prev) => ({
      ...prev,
      [tileId]: !prev[tileId],
    }));
  };

  return (
    <div className="App">
      <h1>YouTube SEO Dashboard</h1>

      {notifications.map((notification) => (
        <div key={notification.id} className={`notification ${notification.type === 'error' ? 'error' : ''}`}>
          {notification.message}
        </div>
      ))}

      {error && (
        <p className="error">
          {error.includes('No channel data found')
            ? 'No channel data available. Please try refreshing the data.'
            : error}
        </p>
      )}
      {loading && <p>Loading...</p>}

      <div className="channel-overview">
        <div className="header-section">
          <h2>Channel Overview</h2>
          <button className="refresh-button" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <>
                Refreshing data <span className="spinner"></span>
              </>
            ) : (
              <>
                Last update: {formatLastUpdated(lastUpdated, refreshCompletion)}
              </>
            )}
          </button>
        </div>

        {channel ? (
          <div className="channel-info">
            <div className="channel-logo">
              {channel.logo_url ? (
                <img
                  src={channel.logo_url}
                  alt="Channel Thumbnail"
                  className="channel-thumbnail"
                  onError={(e) => (e.target.src = 'https://via.placeholder.com/200?text=Fallback+Logo')}
                />
              ) : (
                <p>No logo available</p>
              )}
            </div>
            <div className="channel-details">
              <h3>{channel.title || 'No title available'}</h3>
              <p>{channel.description || 'No description available'}</p>
            </div>
          </div>
        ) : (
          <p>No channel information available. Please try refreshing the data.</p>
        )}

        {channel ? (
          <div className="stats-header-tiles">
            <div className="stats-tiles">
              <div className="stats-tile subscribers">
                <i className="fas fa-users"></i>
                <div className="stats-text">
                  <h4>Subscribers</h4>
                  <p>{formatNumber(channel.subscriber_count)}</p>
                </div>
              </div>
              <div className="stats-tile views">
                <i className="fas fa-eye"></i>
                <div className="stats-text">
                  <h4>Views</h4>
                  <p>{formatNumber(channel.view_count)}</p>
                </div>
              </div>
              <div className="stats-tile videos">
                <i className="fas fa-video"></i>
                <div className="stats-text">
                  <h4>Videos</h4>
                  <p>{formatNumber(channel.video_count)}</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p>No channel statistics available. Please try refreshing the data.</p>
        )}

        <div className="highlight-video-section">
          <h2>Highlight Videos</h2>
          {highlightVideos.latest || highlightVideos.mostLiked || highlightVideos.mostCommented ? (
            <table className="highlight-video-grid">
              <thead>
                <tr>
                  <th className="highlight-title">Latest Video</th>
                  <th className="highlight-title">Most Liked</th>
                  <th className="highlight-title">Most Commented</th>
                </tr>
              </thead>
              <tbody>
                {highlightVideoGrid.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((video, colIndex) => {
                      const tileId = `highlight-${rowIndex}-${colIndex}`;
                      return (
                        <td key={colIndex}>
                          {video ? (
                            <div className="video-tile-container">
                              <div
                                className={`video-tile-flipper ${flippedTiles[tileId] ? 'flipped' : ''}`}
                              >
                                <div className="video-tile-front">
                                  <div
                                    className="video-tile-content"
                                    onClick={() => toggleVideo(tileId)}
                                  >
                                    {playingTile === tileId ? (
                                      <iframe
                                        width="426"
                                        height="320"
                                        src={`https://www.youtube.com/embed/${video.video_id}?autoplay=1`}
                                        title={video.title}
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      ></iframe>
                                    ) : (
                                      <img
                                        src={video.thumbnail_url}
                                        alt={video.title}
                                        width="426"
                                        height="320"
                                      />
                                    )}
                                    <div className="video-text">
                                      <p className="video-title">{video.title}</p>
                                      <div className="video-stats">
                                        <div className="stats-left">
                                          <div className="stats-row">
                                            <span>
                                              <i className="fas fa-calendar-alt"></i>{' '}
                                              {formatDate(video.published_at)}
                                            </span>
                                          </div>
                                          <div className="stats-row metrics-row">
                                            <span>
                                              <i className="fas fa-eye"></i> {formatVideoStats(video.view_count)}
                                            </span>
                                            <span>
                                              <i className="fas fa-thumbs-up"></i>{' '}
                                              {formatVideoStats(video.like_count)}
                                            </span>
                                            <span>
                                              <i className="fas fa-comment"></i>{' '}
                                              {formatVideoStats(video.comment_count)}
                                            </span>
                                            <span>
                                              <i className="fas fa-percentage"></i>{' '}
                                              {formatEngagementRate(video.engagement_rate)}
                                            </span>
                                          </div>
                                        </div>
                                        <button
                                          className="arrow-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleFlip(tileId);
                                          }}
                                        >
                                          <i className="fas fa-info-circle"></i>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <div className="video-tile-back">
                                  <div className="video-description">
                                    <h4>Description</h4>
                                    <p>{video.description || 'No description available.'}</p>
                                  </div>
                                  <button
                                    className="arrow-button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleFlip(tileId);
                                    }}
                                  >
                                    <i className="fas fa-times-circle"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="video-tile-container">
                              <div className="video-tile-front">
                                <div className="video-tile-content">
                                  <p>No video available</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No highlight videos available. Please try refreshing the data.</p>
          )}
        </div>

        {topVideos.length > 0 ? (
          <>
            <div className="video-sort-buttons">
              <button
                className={`sort-button ${sortMode === 'latest' ? 'active' : ''}`}
                onClick={() => setSortMode('latest')}
              >
                Latest
              </button>
              <button
                className={`sort-button ${sortMode === 'popular' ? 'active' : ''}`}
                onClick={() => setSortMode('popular')}
              >
                Popular
              </button>
              <button
                className={`sort-button ${sortMode === 'oldest' ? 'active' : ''}`}
                onClick={() => setSortMode('oldest')}
              >
                Oldest
              </button>
            </div>
            <table className="video-grid">
              <tbody>
                {videoGrid.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((video, colIndex) => {
                      const tileId = `grid-${rowIndex}-${colIndex}`;
                      return (
                        <td key={tileId}>
                          <div className="video-tile-container">
                            <div
                              className={`video-tile-flipper ${flippedTiles[tileId] ? 'flipped' : ''}`}
                            >
                              <div className="video-tile-front">
                                <div
                                  className="video-tile-content"
                                  onClick={() => toggleVideo(tileId)}
                                >
                                  {playingTile === tileId ? (
                                    <iframe
                                      width="426"
                                      height="320"
                                      src={`https://www.youtube.com/embed/${video.video_id}?autoplay=1`}
                                      title={video.title}
                                      frameBorder="0"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    ></iframe>
                                  ) : (
                                    <img
                                      src={video.thumbnail_url}
                                      alt={video.title}
                                      width="426"
                                      height="320"
                                    />
                                  )}
                                  <div className="video-text">
                                    <p className="video-title">{video.title}</p>
                                    <div className="video-stats">
                                      <div className="stats-left">
                                        <div className="stats-row">
                                          <span>
                                            <i className="fas fa-calendar-alt"></i>{' '}
                                            {formatDate(video.published_at)}
                                          </span>
                                        </div>
                                        <div className="stats-row metrics-row">
                                          <span>
                                            <i className="fas fa-eye"></i> {formatVideoStats(video.view_count)}
                                          </span>
                                          <span>
                                            <i className="fas fa-thumbs-up"></i>{' '}
                                            {formatVideoStats(video.like_count)}
                                          </span>
                                          <span>
                                            <i className="fas fa-comment"></i>{' '}
                                            {formatVideoStats(video.comment_count)}
                                          </span>
                                          <span>
                                            <i className="fas fa-percentage"></i>{' '}
                                            {formatEngagementRate(video.engagement_rate)}
                                          </span>
                                        </div>
                                      </div>
                                      <button
                                        className="arrow-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleFlip(tileId);
                                        }}
                                      >
                                        <i className="fas fa-info-circle"></i>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="video-tile-back">
                                <div className="video-description">
                                  <h4>Description</h4>
                                  <p>{video.description || 'No description available.'}</p>
                                </div>
                                <button
                                  className="arrow-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFlip(tileId);
                                  }}
                                >
                                  <i className="fas fa-times-circle"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                    {Array(3 - row.length)
                      .fill()
                      .map((_, i) => (
                        <td key={`empty-${rowIndex}-${i}`}></td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p>No top videos available. Please try refreshing the data.</p>
        )}
      </div>

      <EngagementSection />
    </div>
  );
}

export default App;
