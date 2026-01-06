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

// Fraud Alerts
export const getFraudAlerts = (params) => api.get('/admin/fraud/alerts', { params });
export const reviewFraudAlert = (alertId, data) => api.put(`/admin/fraud/alerts/${alertId}/review`, data);
export const bulkReviewAlerts = (alertIds, status, notes) => api.post('/admin/fraud/alerts/bulk-review', { alertIds, status, notes });
export const getFraudStats = () => api.get('/admin/fraud/stats');

// Audit Logs
export const getAuditLogs = (params) => api.get('/admin/audit/logs', { params });
export const getSecuritySummary = (days) => api.get(`/admin/audit/security-summary?days=${days || 7}`);

// Verification Management
export const getPendingLEVerifications = (params) => api.get('/verification/admin/pending-le', { params });
export const approveLEVerification = (userId, notes) => api.post(`/verification/admin/approve-le/${userId}`, { notes });
export const rejectLEVerification = (userId, reason) => api.post(`/verification/admin/reject-le/${userId}`, { reason });
export const adjustReputation = (userId, adjustment, reason) => api.post(`/verification/admin/adjust-reputation/${userId}`, { adjustment, reason });
export const recalculateAllReputations = () => api.post('/verification/admin/recalculate-all');
export const getLeaderboard = (params) => api.get('/verification/leaderboard', { params });

// System Health
export const getSystemHealth = () => api.get('/admin/health');

export default api;
