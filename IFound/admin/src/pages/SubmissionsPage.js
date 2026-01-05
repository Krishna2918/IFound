import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { getSubmissions } from '../services/api';
import { format } from 'date-fns';

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ verification_status: '' });

  useEffect(() => {
    loadSubmissions();
  }, [pagination.page, filters]);

  const loadSubmissions = async () => {
    setLoading(true);
    try {
      const response = await getSubmissions({
        page: pagination.page,
        limit: 20,
        ...filters,
      });
      setSubmissions(response.data.data.submissions);
      setPagination(response.data.data.pagination);
    } catch (err) {
      console.error('Failed to load submissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'id', label: 'ID', render: (val) => val?.substring(0, 8) + '...' },
    {
      key: 'case',
      label: 'Case',
      render: (val) => val?.title || 'N/A',
    },
    {
      key: 'finder',
      label: 'Submitted By',
      render: (val) => val ? `${val.first_name} ${val.last_name}` : 'Anonymous',
    },
    {
      key: 'submission_type',
      label: 'Type',
      render: (val) => (
        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs capitalize">
          {val}
        </span>
      ),
    },
    {
      key: 'verification_status',
      label: 'Status',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          val === 'verified' ? 'bg-green-100 text-green-700' :
          val === 'pending' ? 'bg-yellow-100 text-yellow-700' :
          val === 'reviewing' ? 'bg-blue-100 text-blue-700' :
          'bg-red-100 text-red-700'
        }`}>
          {val}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Submitted',
      render: (val) => val ? format(new Date(val), 'MMM d, yyyy HH:mm') : 'N/A',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Submissions</h1>
            <p className="text-gray-400 text-sm">Review tips and sightings</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            value={filters.verification_status}
            onChange={(e) => setFilters({ verification_status: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="reviewing">Reviewing</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => setFilters({ verification_status: '' })}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-100"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Data Table */}
      <DataTable columns={columns} data={submissions} loading={loading} emptyMessage="No submissions found" />

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.pages}
        onPageChange={(page) => setPagination({ ...pagination, page })}
      />
    </div>
  );
}
