import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import '../App.css';

const VideoTable = () => {
  const [videos, setVideos] = useState([]);
  const [sortColumn, setSortColumn] = useState('view_count');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = selectedMonth || String(now.getMonth() + 1).padStart(2, '0');
      const response = await axios.get(`/api/most-viewed-videos?year=${year}&month=${month}`);
      setVideos(response.data);
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`Failed to load videos: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedVideos = [...videos].sort((a, b) => {
    const aValue = a[sortColumn];
    const bValue = b[sortColumn];
    if (sortColumn === 'title') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  });

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const formatEngagementRate = (rate) => {
    if (rate === null || rate === undefined) return '0%';
    return `${rate.toFixed(2)}%`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleMonthChange = (e) => {
    setSelectedMonth(e.target.value);
  };

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const value = `${month}`;
      const label = `${year}-${month}`;
      options.push(
        <option key={value} value={value}>
          {label}
        </option>
      );
    }
    return options;
  };

  return (
    <div className="video-table-section">
      <h2>Most Viewed Videos</h2>
      <div>
        <label htmlFor="month-select">Select Month: </label>
        <select id="month-select" value={selectedMonth} onChange={handleMonthChange}>
          <option value="">Current Month</option>
          {generateMonthOptions()}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="video-table">
          <thead>
            <tr>
              <th>Thumbnail</th>
              <th onClick={() => handleSort('title')}>
                Title {sortColumn === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('published_at')}>
                Published {sortColumn === 'published_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('view_count')}>
                Views {sortColumn === 'view_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('like_count')}>
                Likes {sortColumn === 'like_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('comment_count')}>
                Comments {sortColumn === 'comment_count' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('engagement_rate')}>
                Engagement Rate {sortColumn === 'engagement_rate' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedVideos.map((video) => (
              <tr key={video.video_id}>
                <td>
                  <img src={video.thumbnail_url} alt={video.title} />
                </td>
                <td>
                  <a
                    href={`https://www.youtube.com/watch?v=${video.video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {video.title}
                  </a>
                </td>
                <td>{formatDate(video.published_at)}</td>
                <td>{formatNumber(video.view_count)}</td>
                <td>{formatNumber(video.like_count)}</td>
                <td>{formatNumber(video.comment_count)}</td>
                <td>{formatEngagementRate(video.engagement_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default VideoTable;
