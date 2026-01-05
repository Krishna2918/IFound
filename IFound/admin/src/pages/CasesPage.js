import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { getCases, suspendCase } from '../services/api';
import { format } from 'date-fns';

export default function CasesPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ status: '', case_type: '' });

  useEffect(() => {
    loadCases();
  }, [pagination.page, filters]);

  const loadCases = async () => {
    setLoading(true);
    try {
      const response = await getCases({
        page: pagination.page,
        limit: 20,
        ...filters,
      });
      setCases(response.data.data.cases);
      setPagination(response.data.data.pagination);
    } catch (err) {
      console.error('Failed to load cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (caseId, newStatus) => {
    const reason = newStatus === 'suspended' ? prompt('Enter suspension reason:') : '';
    if (newStatus === 'suspended' && !reason) return;

    try {
      await suspendCase(caseId, newStatus, reason);
      loadCases();
    } catch (err) {
      alert('Failed to update case status');
    }
  };

  const columns = [
    { key: 'id', label: 'ID', render: (val) => val?.substring(0, 8) + '...' },
    { key: 'title', label: 'Title' },
    {
      key: 'case_type',
      label: 'Type',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs capitalize ${
          val === 'criminal' ? 'bg-red-100 text-red-700' :
          val === 'missing_person' ? 'bg-blue-100 text-blue-700' :
          'bg-purple-100 text-purple-700'
        }`}>
          {val?.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'bounty_amount',
      label: 'Bounty',
      render: (val) => `$${parseFloat(val || 0).toLocaleString()}`,
    },
    {
      key: 'poster',
      label: 'Posted By',
      render: (val) => val ? `${val.first_name} ${val.last_name}` : 'N/A',
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          val === 'active' ? 'bg-green-100 text-green-700' :
          val === 'resolved' ? 'bg-blue-100 text-blue-700' :
          val === 'suspended' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {val}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (val) => val ? format(new Date(val), 'MMM d, yyyy') : 'N/A',
    },
  ];

  const actions = (row) => (
    <>
      {row.status === 'active' && (
        <button
          onClick={() => handleStatusChange(row.id, 'suspended')}
          className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium hover:bg-red-200"
        >
          Suspend
        </button>
      )}
      {row.status === 'suspended' && (
        <button
          onClick={() => handleStatusChange(row.id, 'active')}
          className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium hover:bg-green-200"
        >
          Activate
        </button>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cases</h1>
            <p className="text-gray-400 text-sm">Moderate and manage cases</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={filters.case_type}
            onChange={(e) => setFilters({ ...filters, case_type: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Types</option>
            <option value="criminal">Criminal</option>
            <option value="missing_person">Missing Person</option>
            <option value="lost_item">Lost Item</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired</option>
          </select>
          <button
            onClick={() => setFilters({ status: '', case_type: '' })}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-100"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Data Table */}
      <DataTable columns={columns} data={cases} actions={actions} loading={loading} emptyMessage="No cases found" />

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.pages}
        onPageChange={(page) => setPagination({ ...pagination, page })}
      />
    </div>
  );
}
