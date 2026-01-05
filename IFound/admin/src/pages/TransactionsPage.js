import React, { useState, useEffect } from 'react';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import { getTransactions } from '../services/api';
import { format } from 'date-fns';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1 });
  const [filters, setFilters] = useState({ status: '', transaction_type: '' });

  useEffect(() => {
    loadTransactions();
  }, [pagination.page, filters]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const response = await getTransactions({
        page: pagination.page,
        limit: 20,
        ...filters,
      });
      setTransactions(response.data.data.transactions);
      setPagination(response.data.data.pagination);
    } catch (err) {
      console.error('Failed to load transactions:', err);
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
      key: 'amount',
      label: 'Amount',
      render: (val) => `$${parseFloat(val || 0).toLocaleString()}`,
    },
    {
      key: 'platform_commission',
      label: 'Commission',
      render: (val) => `$${parseFloat(val || 0).toLocaleString()}`,
    },
    {
      key: 'transaction_type',
      label: 'Type',
      render: (val) => (
        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs capitalize">
          {val}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <span className={`px-2 py-1 rounded-full text-xs ${
          val === 'completed' ? 'bg-green-100 text-green-700' :
          val === 'pending' ? 'bg-yellow-100 text-yellow-700' :
          val === 'escrow' ? 'bg-blue-100 text-blue-700' :
          val === 'refunded' ? 'bg-purple-100 text-purple-700' :
          'bg-red-100 text-red-700'
        }`}>
          {val}
        </span>
      ),
    },
    {
      key: 'poster',
      label: 'Poster',
      render: (val) => val ? `${val.first_name} ${val.last_name}` : 'N/A',
    },
    {
      key: 'finder',
      label: 'Finder',
      render: (val) => val ? `${val.first_name} ${val.last_name}` : 'N/A',
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (val) => val ? format(new Date(val), 'MMM d, yyyy') : 'N/A',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Transactions</h1>
            <p className="text-gray-400 text-sm">Monitor payments and bounties</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="escrow">Escrow</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <select
            value={filters.transaction_type}
            onChange={(e) => setFilters({ ...filters, transaction_type: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-gray-800"
          >
            <option value="">All Types</option>
            <option value="bounty">Bounty</option>
            <option value="refund">Refund</option>
            <option value="tip">Tip</option>
          </select>
          <button
            onClick={() => setFilters({ status: '', transaction_type: '' })}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-100"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Data Table */}
      <DataTable columns={columns} data={transactions} loading={loading} emptyMessage="No transactions found" />

      {/* Pagination */}
      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.pages}
        onPageChange={(page) => setPagination({ ...pagination, page })}
      />
    </div>
  );
}
