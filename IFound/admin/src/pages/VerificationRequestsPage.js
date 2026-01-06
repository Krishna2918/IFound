import React, { useState, useEffect, useCallback } from 'react';
import {
  getPendingLEVerifications,
  approveLEVerification,
  rejectLEVerification,
  adjustReputation,
  recalculateAllReputations,
  getLeaderboard,
} from '../services/api';

function VerificationRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [reviewModal, setReviewModal] = useState({
    open: false,
    request: null,
    action: '',
    notes: '',
    reason: '',
  });
  const [reputationModal, setReputationModal] = useState({
    open: false,
    userId: '',
    userName: '',
    adjustment: 0,
    reason: '',
  });

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getPendingLEVerifications({
        page: pagination.page,
        limit: pagination.limit,
      });
      setRequests(response.data.requests || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (error) {
      console.error('Error fetching verification requests:', error);
    }
    setLoading(false);
  }, [pagination.page, pagination.limit]);

  const fetchLeaderboard = async () => {
    try {
      const response = await getLeaderboard({ limit: 20 });
      setLeaderboard(response.data.leaderboard || []);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'pending') {
      fetchRequests();
    } else if (activeTab === 'leaderboard') {
      fetchLeaderboard();
    }
  }, [activeTab, fetchRequests]);

  const handleApprove = async () => {
    if (!reviewModal.request) return;

    try {
      await approveLEVerification(reviewModal.request.id, reviewModal.notes);
      setReviewModal({ open: false, request: null, action: '', notes: '', reason: '' });
      fetchRequests();
    } catch (error) {
      console.error('Error approving verification:', error);
      alert('Failed to approve verification');
    }
  };

  const handleReject = async () => {
    if (!reviewModal.request || !reviewModal.reason) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      await rejectLEVerification(reviewModal.request.id, reviewModal.reason);
      setReviewModal({ open: false, request: null, action: '', notes: '', reason: '' });
      fetchRequests();
    } catch (error) {
      console.error('Error rejecting verification:', error);
      alert('Failed to reject verification');
    }
  };

  const handleAdjustReputation = async () => {
    if (!reputationModal.userId || !reputationModal.adjustment || !reputationModal.reason) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await adjustReputation(
        reputationModal.userId,
        parseInt(reputationModal.adjustment),
        reputationModal.reason
      );
      setReputationModal({ open: false, userId: '', userName: '', adjustment: 0, reason: '' });
      if (activeTab === 'leaderboard') {
        fetchLeaderboard();
      }
      alert('Reputation adjusted successfully');
    } catch (error) {
      console.error('Error adjusting reputation:', error);
      alert('Failed to adjust reputation');
    }
  };

  const handleRecalculateAll = async () => {
    if (!window.confirm('This will recalculate all user reputations. This may take several minutes. Continue?')) {
      return;
    }

    try {
      await recalculateAllReputations();
      alert('Reputation recalculation started. This will run in the background.');
    } catch (error) {
      console.error('Error starting recalculation:', error);
      alert('Failed to start recalculation');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Verification & Reputation Management</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pending LE Verifications ({pagination.total})
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`px-4 py-2 border-b-2 font-medium text-sm ${
              activeTab === 'leaderboard'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Reputation Leaderboard
          </button>
        </nav>
      </div>

      {activeTab === 'pending' && (
        <>
          {/* Pending Requests Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Badge / Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Supervisor Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Submitted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                      No pending verification requests
                    </td>
                  </tr>
                ) : (
                  requests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{request.full_name}</p>
                          <p className="text-sm text-gray-500">{request.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {request.le_department || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <p>Badge: {request.le_badge_number || 'N/A'}</p>
                        <p className="text-gray-500">Rank: {request.le_rank || 'N/A'}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {request.le_supervisor_email || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setReviewModal({
                                open: true,
                                request,
                                action: 'approve',
                                notes: '',
                                reason: '',
                              })
                            }
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() =>
                              setReviewModal({
                                open: true,
                                request,
                                action: 'reject',
                                notes: '',
                                reason: '',
                              })
                            }
                            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {pagination.total > pagination.limit && (
              <div className="px-4 py-3 border-t flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  Showing {requests.length} of {pagination.total} requests
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
                    disabled={pagination.page * pagination.limit >= pagination.total}
                    className="px-3 py-1 border rounded disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'leaderboard' && (
        <>
          {/* Actions */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={handleRecalculateAll}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Recalculate All Reputations
            </button>
          </div>

          {/* Leaderboard Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Score
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tier
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Verified
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((user) => (
                  <tr key={user.userId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`font-bold ${
                        user.rank === 1 ? 'text-yellow-500' :
                        user.rank === 2 ? 'text-gray-400' :
                        user.rank === 3 ? 'text-amber-600' : ''
                      }`}>
                        #{user.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.displayName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-lg font-bold">{user.score}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          user.tier?.color === 'green' ? 'bg-green-100 text-green-800' :
                          user.tier?.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                          user.tier?.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {user.tier?.badge} {user.tier?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.verified ? (
                        <span className="text-green-600">✓ Verified</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setReputationModal({
                            open: true,
                            userId: user.userId,
                            userName: user.displayName,
                            adjustment: 0,
                            reason: '',
                          })
                        }
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Adjust Score
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Review Modal */}
      {reviewModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">
              {reviewModal.action === 'approve' ? 'Approve' : 'Reject'} Verification
            </h2>

            <div className="mb-4">
              <p className="text-sm text-gray-500">User</p>
              <p className="font-medium">{reviewModal.request?.full_name}</p>
              <p className="text-sm text-gray-500">{reviewModal.request?.email}</p>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-500">Department</p>
              <p>{reviewModal.request?.le_department || 'N/A'}</p>
            </div>

            {reviewModal.action === 'approve' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approval Notes (optional)
                </label>
                <textarea
                  value={reviewModal.notes}
                  onChange={(e) =>
                    setReviewModal((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full border rounded px-3 py-2"
                  rows="3"
                  placeholder="Add any notes..."
                />
              </div>
            )}

            {reviewModal.action === 'reject' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason (required)
                </label>
                <textarea
                  value={reviewModal.reason}
                  onChange={(e) =>
                    setReviewModal((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  className="w-full border rounded px-3 py-2"
                  rows="3"
                  placeholder="Explain why the verification is being rejected..."
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() =>
                  setReviewModal({ open: false, request: null, action: '', notes: '', reason: '' })
                }
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              {reviewModal.action === 'approve' ? (
                <button
                  onClick={handleApprove}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Approve
                </button>
              ) : (
                <button
                  onClick={handleReject}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reputation Adjustment Modal */}
      {reputationModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Adjust Reputation Score</h2>

            <div className="mb-4">
              <p className="text-sm text-gray-500">User</p>
              <p className="font-medium">{reputationModal.userName}</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adjustment (positive or negative)
              </label>
              <input
                type="number"
                value={reputationModal.adjustment}
                onChange={(e) =>
                  setReputationModal((prev) => ({
                    ...prev,
                    adjustment: e.target.value,
                  }))
                }
                className="w-full border rounded px-3 py-2"
                placeholder="e.g., 10 or -20"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason (required)
              </label>
              <textarea
                value={reputationModal.reason}
                onChange={(e) =>
                  setReputationModal((prev) => ({ ...prev, reason: e.target.value }))
                }
                className="w-full border rounded px-3 py-2"
                rows="3"
                placeholder="Explain reason for manual adjustment..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() =>
                  setReputationModal({
                    open: false,
                    userId: '',
                    userName: '',
                    adjustment: 0,
                    reason: '',
                  })
                }
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAdjustReputation}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default VerificationRequestsPage;
