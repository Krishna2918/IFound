import React, { useRef, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import { watchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const VideoPlayer = ({ video, onClose }) => {
  const videoRef = useRef(null);
  const { currentProfile } = useAuth();
  const progressIntervalRef = useRef(null);

  useEffect(() => {
    // Update watch progress every 5 seconds
    progressIntervalRef.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        updateProgress();
      }
    }, 5000);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      // Save progress on unmount
      updateProgress();
    };
  }, [video]);

  const updateProgress = async () => {
    if (videoRef.current && video) {
      try {
        await watchAPI.updateProgress({
          videoId: video._id,
          progress: Math.floor(videoRef.current.currentTime),
          profileIndex: currentProfile
        });
      } catch (error) {
        console.error('Error updating watch progress:', error);
      }
    }
  };

  if (!video) return null;

  return (
    <div className="video-player-container">
      <button className="video-player-close" onClick={onClose}>
        <FaTimes />
      </button>
      <video
        ref={videoRef}
        className="video-player"
        src={video.videoUrl}
        controls
        autoPlay
      />
    </div>
  );
};

export default VideoPlayer;
