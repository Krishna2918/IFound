import React from 'react';
import { FaPlay, FaInfoCircle } from 'react-icons/fa';

const HeroBanner = ({ video, onPlay, onInfo }) => {
  if (!video) return null;

  return (
    <div
      className="hero-banner"
      style={{
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.8), transparent), url(${video.bannerUrl || video.thumbnailUrl})`
      }}
    >
      <div className="hero-content">
        <h1 className="hero-title">{video.title}</h1>
        <p className="hero-description">
          {video.description?.length > 200
            ? video.description.substring(0, 200) + '...'
            : video.description}
        </p>
        <div className="hero-buttons">
          <button
            className="hero-button hero-button-play"
            onClick={() => onPlay(video)}
          >
            <FaPlay /> Play
          </button>
          <button
            className="hero-button hero-button-info"
            onClick={() => onInfo(video)}
          >
            <FaInfoCircle /> More Info
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
