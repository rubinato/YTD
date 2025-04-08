import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ChannelOverview = () => {
  const [recentVideos, setRecentVideos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentVideos = async () => {
      try {
        const response = await axios.get('/api/recent-videos');
        console.log('Fetched recent videos:', response.data);
        setRecentVideos(response.data);
      } catch (err) {
        const errorMessage = err.response?.data?.error || err.message;
        setError(`Failed to load recent videos: ${errorMessage}`);
        console.error('Error fetching recent videos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecentVideos();
  }, []);

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="channel-overview">
      <h2>Recent Videos</h2>
      {loading && <p>Loading recent videos...</p>}
      {error && <p className="error">{error}</p>}
      {recentVideos.length > 0 ? (
        <div className="video-list">
          {recentVideos.map((video) => (
            <div key={video.video_id} className="video-card">
              <img src={video.thumbnail_url} alt={video.title} />
              <h4>{video.title}</h4>
              <p>Published: {formatDate(video.published_at)}</p>
              <p>Views: {video.view_count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      ) : (
        !loading && <p>No recent videos available.</p>
      )}
    </div>
  );
};

export default ChannelOverview;
