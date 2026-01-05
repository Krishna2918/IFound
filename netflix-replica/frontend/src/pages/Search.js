import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import VideoPlayer from '../components/VideoPlayer';
import { videosAPI } from '../services/api';

const Search = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    const value = e.target.value;
    setQuery(value);

    if (value.trim().length > 2) {
      setLoading(true);
      try {
        const response = await videosAPI.search(value);
        setResults(response.data.videos);
      } catch (error) {
        console.error('Search error:', error);
      }
      setLoading(false);
    } else {
      setResults([]);
    }
  };

  return (
    <div className="app">
      <Navbar />
      <div className="search-container">
        <input
          type="text"
          placeholder="Search for movies, TV shows..."
          className="search-input"
          value={query}
          onChange={handleSearch}
        />

        {loading && <div className="loading">Searching...</div>}

        <div className="search-results">
          {results.map((video) => (
            <img
              key={video._id}
              src={video.thumbnailUrl}
              alt={video.title}
              className="row-poster"
              onClick={() => setSelectedVideo(video)}
            />
          ))}
        </div>

        {selectedVideo && (
          <VideoPlayer
            video={selectedVideo}
            onClose={() => setSelectedVideo(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Search;
