import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { getUsers, updateUserVerification, suspendUser } from '../services/api';
import { format } from 'date-fns';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ user_type: '', verification_status: '', search: '' });

  useEffect(() => {
    loadUsers();
  }, [pagination.page, filters]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await getUsers({
        page: pagination.page,
        limit: 20,
        ...filters,
      });
      setUsers(response.data.data.users);
      setPagination(response.data.data.pagination);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationChange = async (userId, status) => {
    try {
      await updateUserVerification(userId, status);
      loadUsers();
    } catch (err) {
      alert('Failed to update verification status');
    }
  };

  const handleSuspend = async (userId, isSuspended) => {
    const reason = isSuspended ? prompt('Enter suspension reason:') : '';
    if (isSuspended && !reason) return;

    try {
      await suspendUser(userId, isSuspended, reason);
      loadUsers();
    } catch (err) {
      alert('Failed to update suspension status');
    }
  };

  const columns = [
    { key: 'id', label: 'ID', render: (val) => val?.substring(0, 8) + '...' },
    {
      key: 'name',
      label: 'Name',
      render: (_, row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'N/A',
    },
    { key: 'email', label: 'Email' },
    {
      key: 'user_type',
      label: 'Type',
      render: (val) => (
        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs capitalize">
          {val}
        </span>
      ),
    },
    {
      key: 'verification_status',
      label: 'Verification',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          val === 'verified' ? 'bg-green-100 text-green-700' :
          val === 'pending' ? 'bg-yellow-100 text-yellow-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {val}
        </span>
      ),
    },
    {
      key: 'is_suspended',
      label: 'Status',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs ${val ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {val ? 'Suspended' : 'Active'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      render: (val) => val ? format(new Date(val), 'MMM d, yyyy') : 'N/A',
    },
  ];

  const actions = (row) => (
    <>
      <select
        value={row.verification_status}
        onChange={(e) => handleVerificationChange(row.id, e.target.value)}
        className="px-2 py-1 border border-gray-300 rounded-full text-xs focus:ring-2 focus:ring-gray-800"
      >
        <option value="unverified">Unverified</option>
        <option value="pending">Pending</option>
        <option value="verified">Verified</option>
      </select>
      <button
        onClick={() => handleSuspend(row.id, !row.is_suspended)}
        className={`px-3 py-1 rounded-full text-xs font-medium ${
          row.is_suspended
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-red-100 text-red-700 hover:bg-red-200'
        }`}
      >
        {row.is_suspended ? 'Unsuspend' : 'Suspend'}
      </button>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Users</h1>
            <p className="text-gray-400 text-sm">Manage platform users</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search users..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          />
          <select
            value={filters.user_type}
            onChange={(e) => setFilters({ ...filters, user_type: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Types</option>
            <option value="finder">Finder</option>
            <option value="poster">Poster</option>
            <option value="law_enforcement">Law Enforcement</option>
            <option value="admin">Admin</option>
          </select>
          <select
            value={filters.verification_status}
            onChange={(e) => setFilters({ ...filters, verification_status: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Verification</option>
            <option value="unverified">Unverified</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
          </select>
          <button
            onClick={() => setFilters({ user_type: '', verification_status: '', search: '' })}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-100"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Data Table */}
      <DataTable columns={columns} data={users} actions={actions} loading={loading} emptyMessage="No users found" />

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.pages}
        onPageChange={(page) => setPagination({ ...pagination, page })}
      />
    </div>
  );
}
