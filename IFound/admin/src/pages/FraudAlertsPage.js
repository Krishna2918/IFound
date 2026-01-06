import React, { useState, useEffect, useCallback } from 'react';
import {
  getFraudAlerts,
  reviewFraudAlert,
  bulkReviewAlerts,
  getFraudStats,
} from '../services/api';

const ALERT_TYPES = {
  multiple_claims_same_ip: 'Multiple Claims (Same IP)',
  rapid_fire_claims: 'Rapid Fire Claims',
  self_dealing: 'Self Dealing',
  suspicious_payout_pattern: 'Suspicious Payout',
  bounty_manipulation: 'Bounty Manipulation',
  location_spoofing: 'Location Spoofing',
  duplicate_photos: 'Duplicate Photos',
  velocity_abuse: 'Velocity Abuse',
};

const SEVERITY_COLORS = {
  low: 'bg-yellow-100 text-yellow-800',
  medium: 'bg-orange-100 text-orange-800',
  high: 'bg-red-100 text-red-800',
  critical: 'bg-red-200 text-red-900',
};

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-800',
  under_review: 'bg-purple-100 text-purple-800',
  confirmed: 'bg-red-100 text-red-800',
  false_positive: 'bg-green-100 text-green-800',
  resolved: 'bg-gray-100 text-gray-800',
};

function FraudAlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAlerts, setSelectedAlerts] = useState([]);
  const [filters, setFilters] = useState({
    status: 'new',
    severity: '',
    alertType: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [reviewModal, setReviewModal] = useState({
    open: false,
    alert: null,
    status: '',
    notes: '',
  });

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters,
      };
      const response = await getFraudAlerts(params);
      setAlerts(response.data.alerts || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (error) {
      console.error('Error fetching fraud alerts:', error);
    }
    setLoading(false);
  }, [filters, pagination.page, pagination.limit]);

  const fetchStats = async () => {
    try {
      const response = await getFraudStats();
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching fraud stats:', error);
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchStats();
  }, [fetchAlerts]);

  const handleReview = async () => {
    if (!reviewModal.alert || !reviewModal.status) return;

    try {
      await reviewFraudAlert(reviewModal.alert.id, {
        status: reviewModal.status,
        notes: reviewModal.notes,
      });
      setReviewModal({ open: false, alert: null, status: '', notes: '' });
      fetchAlerts();
      fetchStats();
    } catch (error) {
      console.error('Error reviewing alert:', error);
      alert('Failed to review alert');
    }
  };

  const handleBulkReview = async (status) => {
    if (selectedAlerts.length === 0) return;

    const notes = window.prompt(`Enter notes for bulk ${status} action:`);
    if (notes === null) return;

    try {
      await bulkReviewAlerts(selectedAlerts, status, notes);
      setSelectedAlerts([]);
      fetchAlerts();
      fetchStats();
    } catch (error) {
      console.error('Error bulk reviewing alerts:', error);
      alert('Failed to bulk review alerts');
    }
  };

  const toggleSelectAlert = (alertId) => {
    setSelectedAlerts((prev) =>
      prev.includes(alertId)
        ? prev.filter((id) => id !== alertId)
        : [...prev, alertId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedAlerts.length === alerts.length) {
      setSelectedAlerts([]);
    } else {
      setSelectedAlerts(alerts.map((a) => a.id));
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Fraud Alerts</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-500 text-sm">Total Alerts</p>
            <p className="text-2xl font-bold">{stats.stats?.total || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-500 text-sm">New</p>
            <p className="text-2xl font-bold text-blue-600">
              {stats.stats?.byStatus?.new || 0}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-500 text-sm">Under Review</p>
            <p className="text-2xl font-bold text-purple-600">
              {stats.stats?.byStatus?.under_review || 0}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-500 text-sm">Confirmed Fraud</p>
            <p className="text-2xl font-bold text-red-600">
              {stats.stats?.byStatus?.confirmed || 0}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <p className="text-gray-500 text-sm">Critical Severity</p>
            <p className="text-2xl font-bold text-red-600">
              {stats.stats?.bySeverity?.critical || 0}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="border rounded px-3 py-2"
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="under_review">Under Review</option>
              <option value="confirmed">Confirmed</option>
              <option value="false_positive">False Positive</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Severity
            </label>
            <select
              value={filters.severity}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, severity: e.target.value }))
              }
              className="border rounded px-3 py-2"
            >
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alert Type
            </label>
            <select
              value={filters.alertType}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, alertType: e.target.value }))
              }
              className="border rounded px-3 py-2"
            >
              <option value="">All</option>
              {Object.entries(ALERT_TYPES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedAlerts.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg mb-4 flex items-center justify-between">
          <span className="text-blue-700">
            {selectedAlerts.length} alert(s) selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkReview('confirmed')}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Mark Confirmed
            </button>
            <button
              onClick={() => handleBulkReview('false_positive')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Mark False Positive
            </button>
            <button
              onClick={() => handleBulkReview('resolved')}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Mark Resolved
            </button>
          </div>
        </div>
      )}

      {/* Alerts Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={
                    alerts.length > 0 && selectedAlerts.length === alerts.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Alert Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Severity
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Score Impact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                  No alerts found
                </td>
              </tr>
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedAlerts.includes(alert.id)}
                      onChange={() => toggleSelectAlert(alert.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">
                      {ALERT_TYPES[alert.alert_type] || alert.alert_type}
                    </span>
                    {alert.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">
                        {alert.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm">
                      {alert.user?.full_name || alert.user?.email || 'Unknown'}
                    </span>
                    <p className="text-xs text-gray-500">
                      Score: {alert.user?.fraud_score || 0}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        SEVERITY_COLORS[alert.severity] || 'bg-gray-100'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        STATUS_COLORS[alert.status] || 'bg-gray-100'
                      }`}
                    >
                      {alert.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {alert.score_impact > 0 ? '+' : ''}
                    {alert.score_impact}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(alert.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        setReviewModal({
                          open: true,
                          alert,
                          status: '',
                          notes: '',
                        })
                      }
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Showing {alerts.length} of {pagination.total} alerts
          </span>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
              }
              disabled={pagination.page === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
              }
              disabled={
                pagination.page * pagination.limit >= pagination.total
              }
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {reviewModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Review Fraud Alert</h2>

            <div className="mb-4">
              <p className="text-sm text-gray-500">Alert Type</p>
              <p className="font-medium">
                {ALERT_TYPES[reviewModal.alert?.alert_type] ||
                  reviewModal.alert?.alert_type}
              </p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-500">Description</p>
              <p>{reviewModal.alert?.description || 'No description'}</p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-500">Evidence</p>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(reviewModal.alert?.evidence, null, 2)}
              </pre>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={reviewModal.status}
                onChange={(e) =>
                  setReviewModal((prev) => ({
                    ...prev,
                    status: e.target.value,
                  }))
                }
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select status...</option>
                <option value="under_review">Under Review</option>
                <option value="confirmed">Confirmed Fraud</option>
                <option value="false_positive">False Positive</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={reviewModal.notes}
                onChange={(e) =>
                  setReviewModal((prev) => ({
                    ...prev,
                    notes: e.target.value,
                  }))
                }
                className="w-full border rounded px-3 py-2"
                rows="3"
                placeholder="Add notes about your review..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() =>
                  setReviewModal({
                    open: false,
                    alert: null,
                    status: '',
                    notes: '',
                  })
                }
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReview}
                disabled={!reviewModal.status}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Submit Review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FraudAlertsPage;
