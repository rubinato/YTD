import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
} from 'chart.js';
import PropTypes from 'prop-types';
import '../App.css';
import { formatVideoStats, formatEngagementRate, formatDate } from '../App';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

// Custom Hook for Data Fetching
const useEngagementData = () => {
  const [monthlyStats, setMonthlyStats] = useState({});
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [monthlyResponse, yearsResponse] = await Promise.all([
        axios.get('/api/monthly-stats-all'),
        axios.get('/api/years'),
      ]);
      setMonthlyStats(monthlyResponse.data);
      setYears(yearsResponse.data.sort((a, b) => b - a));
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message;
      setError(`Failed to load data: ${errorMessage}`);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { monthlyStats, years, loading, error, setError };
};

// Reusable Metric Tile Component
const MetricTile = ({ iconClass, title, value, className }) => (
  <div className={`metric-tile ${title.toLowerCase()}-tile ${className}`}>
    <i className={iconClass}></i>
    <div className="metric-text">
      <h4>{title}</h4>
      <p>{value}</p>
    </div>
  </div>
);

MetricTile.propTypes = {
  iconClass: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  className: PropTypes.string.isRequired,
};

const generateMonthLabels = (year) => {
  return Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0');
    return `${month}-${year}`;
  });
};

const generateMonthData = (year, stats, metric) => {
  const yearStats = stats[year] || {};
  return generateMonthLabels(year).map((label) => {
    const month = label.split('-')[0];
    const monthData = yearStats[month];
    return monthData ? monthData[metric] || 0 : 0;
  });
};

const EngagementSection = () => {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const { monthlyStats, years, loading, error, setError } = useEngagementData();
  const [highlightedBar, setHighlightedBar] = useState(null);
  const [engagementSortMode, setEngagementSortMode] = useState('mostViewed');
  const [engagementVideos, setEngagementVideos] = useState([]);
  const [playingTile, setPlayingTile] = useState(null);
  const [flippedTiles, setFlippedTiles] = useState({});
  const [filteredVideos, setFilteredVideos] = useState([]);

  useEffect(() => {
    if (years.length > 0) {
      setSelectedYear(years[0]);
      setSelectedMonth('');
    }
  }, [years]);

  const chartData = useMemo(() => ({
    labels: generateMonthLabels(selectedYear),
    datasets: [
      {
        label: 'Views',
        data: generateMonthData(selectedYear, monthlyStats, 'total_views'),
        backgroundColor: (context) => {
          const index = context.dataIndex;
          return highlightedBar === index ? 'rgba(0, 95, 17, 0.66)' : 'rgba(38, 247, 76, 0.7)';
        },
        borderColor: (context) => {
          const index = context.dataIndex;
          return highlightedBar === index ? 'rgba(0, 95, 17, 0.66)' : 'rgba(38, 247, 76, 0.7)';
        },
        borderWidth: 1,
      },
    ],
  }), [selectedYear, monthlyStats, highlightedBar]);

 const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { // Add this animation block
      duration: 250, // Default is 1000 (1 second).  Lower values make it faster.
      easing: 'easeOutQuad', // Easing function for the animation
    },
    plugins: {
      title: {
        display: true,
        text: `Monthly Engagement Metrics (${selectedYear})`,
        font: {
          size: 18,
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += new Intl.NumberFormat().format(context.parsed.y);
            }
            return label;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Month',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Count',
        },
        beginAtZero: true,
        ticks: {
          callback: function (value) {
            return new Intl.NumberFormat().format(value);
          },
        },
      },
    },
    onClick: (event, elements) => {
      if (elements.length > 0 && selectedYear) {
        const index = elements[0].index;
        const label = chartData.labels[index];
        const month = label.split('-')[0];
        setSelectedMonth(month);
        setHighlightedBar(index);
      } else {
        setHighlightedBar(null);
      }
    },
  }), [selectedYear, chartData]);


  const getYearlyMetric = useCallback(
    (metric) => {
      const yearStats = monthlyStats[selectedYear] || {};
      let total = 0;
      if (metric === 'engagement_rate') {
        let totalInteractions = 0;
        let totalViews = 0;
        for (const month in yearStats) {
          totalInteractions += yearStats[month].like_count || 0;
          totalInteractions += yearStats[month].comment_count || 0;
          totalViews += yearStats[month].total_views || 0;
        }
        return totalViews > 0 ? (totalInteractions / totalViews) * 100 : 0;
      }
      for (const month in yearStats) {
        total += yearStats[month][metric] || 0;
      }
      return total;
    },
    [monthlyStats, selectedYear]
  );

  const getMonthlyMetric = useCallback(
    (metric) => {
      const yearStats = monthlyStats[selectedYear] || {};
      const monthStats = yearStats[selectedMonth] || {};

      if (metric === 'engagement_rate') {
        const totalInteractions = (monthStats.like_count || 0) + (monthStats.comment_count || 0);
        const totalViews = monthStats.total_views || 0;
        return totalViews > 0 ? (totalInteractions / totalViews) * 100 : 0;
      }

      return monthStats[metric] || 0;
    },
    [monthlyStats, selectedYear, selectedMonth]
  );

  const currentMetric = selectedMonth ? getMonthlyMetric : getYearlyMetric;

  const handleYearChange = useCallback((year) => {
    setSelectedYear(year);
    setSelectedMonth('');
    setHighlightedBar(null);
  }, []);

  const fetchEngagementVideos = useCallback(async (mode, year, month, setError) => {
    let sortParam = 'view_count';
    if (mode === 'mostLiked') {
      sortParam = 'like_count';
    } else if (mode === 'mostCommented') {
      sortParam = 'comment_count';
    } else if (mode === 'mostEngaged') {
      sortParam = 'engagement_rate';
    }
    try {
      let url = `/api/videos?page=1&limit=9&sort=${sortParam}&sortDirection=DESC`;
      if (year) {
        url += `&year=${year}`;
      }
      if (month) {
        url += `&month=${year}-${month}`;
      }
      const response = await axios.get(url);
      setEngagementVideos(response.data.videos);
      setFilteredVideos(response.data.videos);
    } catch (err) {
      setError('Failed to load engagement videos: ' + (err.response?.data?.error || err.message));
    }
  }, []);

  const handleEngagementSortMode = useCallback((mode) => {
    let sortParam = 'view_count';
    if (mode === 'mostLiked') {
      sortParam = 'like_count';
    } else if (mode === 'mostCommented') {
      sortParam = 'comment_count';
    } else if (mode === 'mostEngaged') {
      sortParam = 'engagement_rate';
    }

    const sortedVideos = [...filteredVideos].sort((a, b) => {
      if (mode === 'mostEngaged') {
        // Handle potential undefined engagement_rate
        const engagementA = a.engagement_rate !== undefined ? a.engagement_rate : -1;
        const engagementB = b.engagement_rate !== undefined ? b.engagement_rate : -1;
        return engagementB - engagementA;
      }
      return b[sortParam] - a[sortParam];
    });
    setEngagementSortMode(mode);
    setEngagementVideos(sortedVideos);
  }, [filteredVideos]);

  useEffect(() => {
    fetchEngagementVideos(engagementSortMode, selectedYear, selectedMonth, setError);
  }, [engagementSortMode, selectedYear, selectedMonth, fetchEngagementVideos, setError]);

  const engagementVideoGrid = useMemo(() => {
    const grid = [];
    for (let i = 0; i < 3; i++) {
      const row = engagementVideos.slice(i * 3, (i + 1) * 3);
      grid.push(row);
    }
    return grid;
  }, [engagementVideos]);

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
    <div className="engagement-section">
      <h2>Engagement Metrics</h2>
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && (
        <>
          <div className="year-filter">
            <label htmlFor="year-select">Year:</label>
            <select
              id="year-select"
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="engagement-table">
            <div className="chart-column">
              <div className="chart-container">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
            <div className="metrics-column">
              <div className="metrics-tiles">
                <MetricTile
                  iconClass="fas fa-eye"
                  title="Views"
                  value={new Intl.NumberFormat().format(currentMetric('total_views'))}
                  className="views-tile"
                />
                <MetricTile
                  iconClass="fas fa-thumbs-up"
                  title="Likes"
                  value={new Intl.NumberFormat().format(currentMetric('like_count'))}
                  className="likes-tile"
                />
                <MetricTile
                  iconClass="fas fa-comment"
                  title="Comments"
                  value={new Intl.NumberFormat().format(currentMetric('comment_count'))}
                  className="comments-tile"
                />
                <MetricTile
                  iconClass="fas fa-percentage"
                  title="Engagement Rate"
                  value={`${currentMetric('engagement_rate').toFixed(2)}%`}
                  className="engagement-rate-tile"
                />
              </div>
            </div>
          </div>
          <div className="engagement-video-section">
            <div className="engagement-video-sort-buttons" style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button
                className={`sort-button ${engagementSortMode === 'mostViewed' ? 'active' : ''}`}
                onClick={() => handleEngagementSortMode('mostViewed')}
              >
                Most Viewed
              </button>
              <button
                className={`sort-button ${engagementSortMode === 'mostLiked' ? 'active' : ''}`}
                onClick={() => handleEngagementSortMode('mostLiked')}
              >
                Most Liked
              </button>
              <button
                className={`sort-button ${engagementSortMode === 'mostCommented' ? 'active' : ''}`}
                onClick={() => handleEngagementSortMode('mostCommented')}
              >
                Most Commented
              </button>
              <button
                className={`sort-button ${engagementSortMode === 'mostEngaged' ? 'active' : ''}`}
                onClick={() => handleEngagementSortMode('mostEngaged')}
              >
                Most Engaged
              </button>
            </div>
            <table className="engagement-video-grid" style={{ borderSpacing: '5px' }}>
              <tbody>
                {engagementVideoGrid.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((video, colIndex) => {
                      const tileId = `engagement-grid-${rowIndex}-${colIndex}`;
                      return (
                        <td key={tileId} style={{ padding: '20px' }}>
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
                        <td key={`empty-engagement-${rowIndex}-${i}`}></td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default EngagementSection;
