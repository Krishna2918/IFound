import React from 'react';

const Row = ({ title, videos, onVideoClick }) => {
  if (!videos || videos.length === 0) return null;

  return (
    <div className="row">
      <h2 className="row-title">{title}</h2>
      <div className="row-posters">
        {videos.map((video) => (
          <img
            key={video._id}
            src={video.thumbnailUrl}
            alt={video.title}
            className="row-poster"
            onClick={() => onVideoClick(video)}
          />
        ))}
      </div>
    </div>
  );
};

export default Row;
