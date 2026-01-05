import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) => api.post('/auth/login', { email, password });

// Analytics
export const getAnalytics = (params) => api.get('/admin/analytics', { params });

// Users
export const getUsers = (params) => api.get('/admin/users', { params });
export const updateUserVerification = (id, status) => api.put(`/admin/users/${id}/verify`, { verification_status: status });
export const suspendUser = (id, isSuspended, reason) => api.put(`/admin/users/${id}/suspend`, { is_suspended: isSuspended, reason });

// Cases
export const getCases = (params) => api.get('/admin/cases', { params });
export const suspendCase = (id, status, reason) => api.put(`/admin/cases/${id}/suspend`, { status, reason });

// Submissions
export const getSubmissions = (params) => api.get('/admin/submissions', { params });

// Transactions
export const getTransactions = (params) => api.get('/admin/transactions', { params });

// Matches
export const getMatches = (params) => api.get('/admin/matches', { params });
export const getMatchStats = () => api.get('/admin/matches/stats');
export const getUserMatches = (userId, params) => api.get(`/admin/users/${userId}/matches`, { params });

export default api;
