import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import HeroBanner from '../components/HeroBanner';
import Row from '../components/Row';
import VideoPlayer from '../components/VideoPlayer';
import { videosAPI } from '../services/api';

const Home = () => {
  const [featuredVideo, setFeaturedVideo] = useState(null);
  const [trendingVideos, setTrendingVideos] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [actionVideos, setActionVideos] = useState([]);
  const [comedyVideos, setComedyVideos] = useState([]);
  const [dramaVideos, setDramaVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [featured, trending, newRel, action, comedy, drama] = await Promise.all([
        videosAPI.getFeatured(),
        videosAPI.getTrending(),
        videosAPI.getNewReleases(),
        videosAPI.getByGenre('Action'),
        videosAPI.getByGenre('Comedy'),
        videosAPI.getByGenre('Drama')
      ]);

      setFeaturedVideo(featured.data.video);
      setTrendingVideos(trending.data.videos);
      setNewReleases(newRel.data.videos);
      setActionVideos(action.data.videos);
      setComedyVideos(comedy.data.videos);
      setDramaVideos(drama.data.videos);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const handlePlay = (video) => {
    setSelectedVideo(video);
  };

  const handleInfo = (video) => {
    alert(`Title: ${video.title}\n\nDescription: ${video.description}\n\nYear: ${video.year}\nRating: ${video.rating}`);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <Navbar />
      <HeroBanner
        video={featuredVideo}
        onPlay={handlePlay}
        onInfo={handleInfo}
      />
      <Row title="Trending Now" videos={trendingVideos} onVideoClick={handlePlay} />
      <Row title="New Releases" videos={newReleases} onVideoClick={handlePlay} />
      <Row title="Action" videos={actionVideos} onVideoClick={handlePlay} />
      <Row title="Comedy" videos={comedyVideos} onVideoClick={handlePlay} />
      <Row title="Drama" videos={dramaVideos} onVideoClick={handlePlay} />

      {selectedVideo && (
        <VideoPlayer
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
};

export default Home;
