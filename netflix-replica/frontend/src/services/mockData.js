// Mock video data
export const mockVideos = [
  {
    _id: '1',
    title: 'The Adventure Begins',
    description: 'An epic adventure story following a group of heroes on their quest to save the world. Join them as they face incredible challenges, discover ancient secrets, and forge unbreakable bonds.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video1/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner1/1920/1080',
    duration: 120,
    year: 2023,
    rating: 'PG-13',
    genres: ['Action', 'Adventure'],
    cast: ['John Doe', 'Jane Smith', 'Bob Johnson'],
    director: 'Steven Director',
    isTrending: true,
    isFeatured: true,
    isNewRelease: false,
    viewCount: 15420,
    likeCount: 2341,
    trailerUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
  },
  {
    _id: '2',
    title: 'Laugh Out Loud',
    description: 'A hilarious comedy that will keep you entertained from start to finish. Perfect for a fun movie night with friends and family.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video2/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner2/1920/1080',
    duration: 95,
    year: 2023,
    rating: 'PG',
    genres: ['Comedy'],
    cast: ['Funny Person', 'Comic Relief'],
    director: 'Comedy Director',
    isTrending: true,
    isFeatured: false,
    isNewRelease: true,
    viewCount: 8934,
    likeCount: 1567
  },
  {
    _id: '3',
    title: 'Dark Secrets',
    description: 'A psychological thriller that will keep you on the edge of your seat. Uncover the mystery behind the disappearance.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video3/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner3/1920/1080',
    duration: 110,
    year: 2024,
    rating: 'R',
    genres: ['Thriller', 'Drama'],
    cast: ['Serious Actor', 'Mystery Person'],
    director: 'Thriller Master',
    isTrending: false,
    isFeatured: false,
    isNewRelease: true,
    viewCount: 12043,
    likeCount: 2890
  },
  {
    _id: '4',
    title: 'Space Odyssey',
    description: 'Journey through the cosmos in this breathtaking sci-fi adventure. Experience the wonders of space exploration.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video4/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner4/1920/1080',
    duration: 135,
    year: 2023,
    rating: 'PG-13',
    genres: ['Sci-Fi', 'Adventure'],
    cast: ['Space Captain', 'Alien Friend'],
    director: 'Sci-Fi Genius',
    isTrending: true,
    isFeatured: false,
    isNewRelease: false,
    viewCount: 23456,
    likeCount: 4321
  },
  {
    _id: '5',
    title: 'Love Story',
    description: 'A beautiful romance that will touch your heart. Experience the power of true love.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video5/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner5/1920/1080',
    duration: 100,
    year: 2024,
    rating: 'PG',
    genres: ['Romance', 'Drama'],
    cast: ['Romantic Lead', 'Love Interest'],
    director: 'Romance Director',
    isTrending: false,
    isFeatured: false,
    isNewRelease: true,
    viewCount: 6789,
    likeCount: 1234
  },
  {
    _id: '6',
    title: 'Action Heroes',
    description: 'Non-stop action and incredible stunts. The ultimate action movie experience.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video6/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner6/1920/1080',
    duration: 118,
    year: 2023,
    rating: 'PG-13',
    genres: ['Action'],
    cast: ['Action Star', 'Sidekick'],
    director: 'Action Master',
    isTrending: true,
    isFeatured: false,
    isNewRelease: false,
    viewCount: 34567,
    likeCount: 6789
  },
  {
    _id: '7',
    title: 'Comedy Central',
    description: 'The funniest movie of the year. Guaranteed to make you laugh.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video7/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner7/1920/1080',
    duration: 92,
    year: 2024,
    rating: 'PG-13',
    genres: ['Comedy'],
    cast: ['Comedian One', 'Comedian Two'],
    director: 'Laugh Director',
    isTrending: false,
    isFeatured: false,
    isNewRelease: true,
    viewCount: 5432,
    likeCount: 987
  },
  {
    _id: '8',
    title: 'Drama Unleashed',
    description: 'An emotional journey that will move you to tears. A powerful story of redemption.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: 'https://picsum.photos/seed/video8/400/225',
    bannerUrl: 'https://picsum.photos/seed/banner8/1920/1080',
    duration: 125,
    year: 2023,
    rating: 'R',
    genres: ['Drama'],
    cast: ['Drama Actor', 'Supporting Role'],
    director: 'Drama Director',
    isTrending: false,
    isFeatured: false,
    isNewRelease: false,
    viewCount: 9876,
    likeCount: 2345
  }
];

// Mock user
export const mockUser = {
  id: 'demo-user',
  email: 'demo@netflix.com',
  name: 'Demo User',
  profiles: [
    {
      name: 'Demo User',
      avatar: 'https://i.imgur.com/6VBx3io.png',
      isKids: false
    }
  ],
  subscription: {
    plan: 'premium',
    status: 'active'
  }
};

// Mock categories
export const mockCategories = [
  { _id: '1', name: 'Action', slug: 'action' },
  { _id: '2', name: 'Comedy', slug: 'comedy' },
  { _id: '3', name: 'Drama', slug: 'drama' },
  { _id: '4', name: 'Thriller', slug: 'thriller' },
  { _id: '5', name: 'Sci-Fi', slug: 'sci-fi' },
  { _id: '6', name: 'Romance', slug: 'romance' }
];

// Helper functions
export const getTrendingVideos = () => mockVideos.filter(v => v.isTrending);
export const getNewReleases = () => mockVideos.filter(v => v.isNewRelease);
export const getFeaturedVideo = () => mockVideos.find(v => v.isFeatured) || mockVideos[0];
export const getVideosByGenre = (genre) => mockVideos.filter(v => v.genres.includes(genre));
export const searchVideos = (query) => mockVideos.filter(v =>
  v.title.toLowerCase().includes(query.toLowerCase()) ||
  v.description.toLowerCase().includes(query.toLowerCase())
);
export const getVideoById = (id) => mockVideos.find(v => v._id === id);
