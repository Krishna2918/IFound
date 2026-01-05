import {
  mockUser,
  mockVideos,
  mockCategories,
  getTrendingVideos,
  getNewReleases,
  getFeaturedVideo,
  getVideosByGenre,
  searchVideos,
  getVideoById
} from './mockData';

// Simulate API delay
const delay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

// Mock API responses
export const authAPI = {
  register: async (data) => {
    await delay();
    return {
      data: {
        success: true,
        token: 'mock-jwt-token',
        user: mockUser
      }
    };
  },

  login: async (data) => {
    await delay();
    return {
      data: {
        success: true,
        token: 'mock-jwt-token',
        user: mockUser
      }
    };
  },

  getMe: async () => {
    await delay();
    return {
      data: {
        success: true,
        user: mockUser
      }
    };
  },

  updateProfile: async (data) => {
    await delay();
    return {
      data: {
        success: true,
        user: { ...mockUser, ...data }
      }
    };
  }
};

// Videos API
export const videosAPI = {
  getAll: async (params) => {
    await delay();
    return {
      data: {
        success: true,
        count: mockVideos.length,
        videos: mockVideos
      }
    };
  },

  getFeatured: async () => {
    await delay();
    return {
      data: {
        success: true,
        video: getFeaturedVideo()
      }
    };
  },

  getTrending: async () => {
    await delay();
    return {
      data: {
        success: true,
        count: getTrendingVideos().length,
        videos: getTrendingVideos()
      }
    };
  },

  getNewReleases: async () => {
    await delay();
    return {
      data: {
        success: true,
        count: getNewReleases().length,
        videos: getNewReleases()
      }
    };
  },

  getById: async (id) => {
    await delay();
    const video = getVideoById(id);
    if (!video) {
      throw new Error('Video not found');
    }
    return {
      data: {
        success: true,
        video
      }
    };
  },

  getByGenre: async (genre) => {
    await delay();
    return {
      data: {
        success: true,
        count: getVideosByGenre(genre).length,
        videos: getVideosByGenre(genre)
      }
    };
  },

  search: async (query) => {
    await delay();
    return {
      data: {
        success: true,
        count: searchVideos(query).length,
        videos: searchVideos(query)
      }
    };
  }
};

// Watch History API
let mockMyList = [];
let mockWatchHistory = [];

export const watchAPI = {
  getHistory: async (profileIndex) => {
    await delay();
    return {
      data: {
        success: true,
        count: mockWatchHistory.length,
        history: mockWatchHistory.map(item => ({
          ...item,
          video: getVideoById(item.videoId)
        }))
      }
    };
  },

  updateProgress: async (data) => {
    await delay();
    const existingIndex = mockWatchHistory.findIndex(
      item => item.videoId === data.videoId
    );

    if (existingIndex >= 0) {
      mockWatchHistory[existingIndex].progress = data.progress;
    } else {
      mockWatchHistory.unshift({
        videoId: data.videoId,
        progress: data.progress,
        profileIndex: data.profileIndex || 0
      });
    }

    return {
      data: {
        success: true,
        watchHistory: mockWatchHistory[0]
      }
    };
  },

  getMyList: async (profileIndex) => {
    await delay();
    return {
      data: {
        success: true,
        count: mockMyList.length,
        myList: mockMyList.map(item => ({
          ...item,
          video: getVideoById(item.videoId)
        }))
      }
    };
  },

  addToMyList: async (data) => {
    await delay();
    const exists = mockMyList.find(item => item.videoId === data.videoId);

    if (exists) {
      throw new Error('Video already in your list');
    }

    const newItem = {
      videoId: data.videoId,
      profileIndex: data.profileIndex || 0,
      addedAt: new Date()
    };

    mockMyList.unshift(newItem);

    return {
      data: {
        success: true,
        myListItem: newItem
      }
    };
  },

  removeFromMyList: async (videoId, profileIndex) => {
    await delay();
    const index = mockMyList.findIndex(item => item.videoId === videoId);

    if (index < 0) {
      throw new Error('Video not found in your list');
    }

    mockMyList.splice(index, 1);

    return {
      data: {
        success: true,
        message: 'Video removed from your list'
      }
    };
  }
};

// Categories API
export const categoriesAPI = {
  getAll: async () => {
    await delay();
    return {
      data: {
        success: true,
        count: mockCategories.length,
        categories: mockCategories
      }
    };
  },

  getBySlug: async (slug) => {
    await delay();
    const category = mockCategories.find(c => c.slug === slug);
    if (!category) {
      throw new Error('Category not found');
    }

    return {
      data: {
        success: true,
        category,
        videos: getVideosByGenre(category.name)
      }
    };
  }
};

export default {
  authAPI,
  videosAPI,
  watchAPI,
  categoriesAPI
};
