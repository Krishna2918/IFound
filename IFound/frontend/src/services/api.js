import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/constants';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');
      // Navigate to login (handled by AuthContext)
    }
    return Promise.reject(error.response?.data || error.message);
  }
);

// Auth endpoints
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
};

// Case endpoints
export const caseAPI = {
  getCases: (params) => api.get('/cases', { params }),
  getCaseById: (id) => api.get(`/cases/${id}`),
  createCase: (data) => api.post('/cases', data),
  updateCase: (id, data) => api.put(`/cases/${id}`, data),
  deleteCase: (id) => api.delete(`/cases/${id}`),
  getMyCases: (params) => api.get('/cases/my/cases', { params }),
};

// Submission endpoints
export const submissionAPI = {
  createSubmission: (data) => api.post('/submissions', data),
  getSubmissionsByCase: (caseId, params) => api.get(`/submissions/case/${caseId}`, { params }),
  getMySubmissions: (params) => api.get('/submissions/my-submissions', { params }),
  getSubmissionById: (id) => api.get(`/submissions/${id}`),
  verifySubmission: (id, data) => api.put(`/submissions/${id}/verify`, data),
  deleteSubmission: (id) => api.delete(`/submissions/${id}`),
};

// Photo endpoints
export const photoAPI = {
  uploadPhotos: (caseId, formData) => {
    return api.post(`/photos/${caseId}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getPhotosByCase: (caseId) => api.get(`/photos/${caseId}/photos`),
  setPrimaryPhoto: (id) => api.put(`/photos/${id}/set-primary`),
  deletePhoto: (id) => api.delete(`/photos/${id}`),
};

// Visual DNA endpoints
export const visualDnaAPI = {
  getCaseVisualDNA: (caseId) => api.get(`/cases/${caseId}/visual-dna`),
  smartSearch: (formData) => api.post('/search/smart', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  comparePhotos: (data) => api.post('/visual-dna/compare', data),
};

// Payment endpoints
export const paymentAPI = {
  createBountyPayment: (data) => api.post('/payments/bounty', data),
  releaseBounty: (transactionId) => api.post(`/payments/release/${transactionId}`),
  refundPayment: (transactionId, data) => api.post(`/payments/refund/${transactionId}`, data),
  getTransactionHistory: (params) => api.get('/payments/history', { params }),
  getUserBalance: () => api.get('/payments/balance'),
  getEarningsSummary: () => api.get('/payments/earnings'),
  requestWithdrawal: (data) => api.post('/payments/withdraw', data),
};

// Admin endpoints
export const adminAPI = {
  getAnalytics: () => api.get('/admin/analytics'),
  getAllUsers: (params) => api.get('/admin/users', { params }),
  updateUserVerification: (id, data) => api.put(`/admin/users/${id}/verify`, data),
  suspendUser: (id, data) => api.put(`/admin/users/${id}/suspend`, data),
  getAllCases: (params) => api.get('/admin/cases', { params }),
  suspendCase: (id, data) => api.put(`/admin/cases/${id}/suspend`, data),
  getAllSubmissions: (params) => api.get('/admin/submissions', { params }),
  getAllTransactions: (params) => api.get('/admin/transactions', { params }),
};

export default api;
