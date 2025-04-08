import React, { useState, useEffect } from 'react';

const ChannelStatistics = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchChannelStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch channel statistics');
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchChannelStats();
  }, []);

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  if (loading) return <div>Loading statistics...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <section>
      <h2>Channel Statistics</h2>
      {stats ? (
        <div className="stats-tiles">
          <div className="stats-tile subscribers">
            <i className="fas fa-users"></i>
            <div className="stats-text">
              <h4>Subscribers</h4>
              <p>{formatNumber(stats.subscriber_count)}</p>
            </div>
          </div>
          <div className="stats-tile views">
            <i className="fas fa-eye"></i>
            <div className="stats-text">
              <h4>Views</h4>
              <p>{formatNumber(stats.view_count)}</p>
            </div>
          </div>
          <div className="stats-tile videos">
            <i className="fas fa-video"></i>
            <div className="stats-text">
              <h4>Videos</h4>
              <p>{formatNumber(stats.video_count)}</p>
            </div>
          </div>
        </div>
      ) : (
        <p>No statistics available.</p>
      )}
    </section>
  );
};

export default ChannelStatistics;
