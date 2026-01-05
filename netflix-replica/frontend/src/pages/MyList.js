import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Row from '../components/Row';
import VideoPlayer from '../components/VideoPlayer';
import { watchAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const MyList = () => {
  const [myList, setMyList] = useState([]);
  const [watchHistory, setWatchHistory] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const { currentProfile } = useAuth();

  useEffect(() => {
    fetchData();
  }, [currentProfile]);

  const fetchData = async () => {
    try {
      const [listRes, historyRes] = await Promise.all([
        watchAPI.getMyList(currentProfile),
        watchAPI.getHistory(currentProfile)
      ]);

      setMyList(listRes.data.myList.map(item => item.video));
      setWatchHistory(historyRes.data.history.map(item => item.video));
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <Navbar />
      <div style={{ paddingTop: '100px' }}>
        <Row title="My List" videos={myList} onVideoClick={setSelectedVideo} />
        <Row title="Continue Watching" videos={watchHistory} onVideoClick={setSelectedVideo} />
      </div>

      {selectedVideo && (
        <VideoPlayer
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
};

export default MyList;
