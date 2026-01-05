import React, { useState, useEffect } from 'react';
import { getMatches, getMatchStats } from '../services/api';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function StatsCard({ title, value, subtitle, icon, color = 'gray' }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-green-50 text-green-600 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <div className={`bg-white rounded-3xl p-4 border shadow-md ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-xl ${colorClasses[color]}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
          </svg>
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }) {
  const getColor = (score) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${getColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-sm font-medium w-12 text-right">{value}%</span>
    </div>
  );
}

export default function MatchesPage() {
  const [stats, setStats] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0,
    limit: 20,
  });
  const [filters, setFilters] = useState({
    status: '',
    min_score: '',
  });

  useEffect(() => {
    loadData();
  }, [filters, pagination.page]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsRes, matchesRes] = await Promise.all([
        getMatchStats(),
        getMatches({ ...filters, page: pagination.page, limit: pagination.limit }),
      ]);
      setStats(statsRes.data.data);
      setMatches(matchesRes.data.data.matches);
      setPagination(prev => ({
        ...prev,
        ...matchesRes.data.data.pagination,
      }));
    } catch (err) {
      setError('Failed to load matches data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return '/placeholder.png';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${API_URL}${imageUrl}`;
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      viewed: 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-gray-800 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Matches Dashboard</h1>
            <p className="text-purple-200 text-sm">Visual DNA matching analytics and results</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Matches"
          value={stats?.totals?.matches || 0}
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          color="purple"
        />
        <StatsCard
          title="Pending Review"
          value={stats?.totals?.pending || 0}
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          color="yellow"
        />
        <StatsCard
          title="Confirmed"
          value={stats?.totals?.confirmed || 0}
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          color="green"
        />
        <StatsCard
          title="Last 7 Days"
          value={stats?.recent?.last7Days || 0}
          icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          color="blue"
        />
      </div>

      {/* Visual DNA Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Visual DNA Processing</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Processed</span>
              <span className="text-xl font-bold">{stats?.visualDNA?.total || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Completed</span>
              <span className="text-xl font-bold text-green-600">{stats?.visualDNA?.completed || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Failed</span>
              <span className="text-xl font-bold text-red-600">{stats?.visualDNA?.failed || 0}</span>
            </div>
            <div className="pt-2 border-t">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Success Rate</span>
                <span className="font-bold">{stats?.visualDNA?.processingRate || 0}%</span>
              </div>
              <div className="bg-gray-200 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full"
                  style={{ width: `${stats?.visualDNA?.processingRate || 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Match Similarity</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-gray-600">High Similarity (80%+)</span>
              </div>
              <span className="text-xl font-bold text-green-600">{stats?.confidence?.high || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-gray-600">Medium (50-80%)</span>
              </div>
              <span className="text-xl font-bold text-yellow-600">{stats?.confidence?.medium || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-gray-600">Low (&lt;50%)</span>
              </div>
              <span className="text-xl font-bold text-red-600">{stats?.confidence?.low || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-3xl p-4 border border-gray-200 shadow-md">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="rejected">Rejected</option>
              <option value="viewed">Viewed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min Score</label>
            <select
              value={filters.min_score}
              onChange={(e) => setFilters({ ...filters, min_score: e.target.value })}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Any Score</option>
              <option value="80">80%+</option>
              <option value="50">50%+</option>
              <option value="25">25%+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Matches List */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-md overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">All Matches</h2>
          <span className="text-sm text-gray-500">{pagination.total} total</span>
        </div>

        {matches.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>No matches found</p>
            <p className="text-sm">Matches will appear here when the Visual DNA matching system finds potential connections.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {matches.map((match) => (
              <div key={match.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  {/* Photo Comparison */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <img
                        src={getImageUrl(match.sourcePhoto?.image_url)}
                        alt="Source"
                        className="w-16 h-16 object-cover rounded-xl border-2 border-gray-200"
                        onError={(e) => { e.target.src = '/placeholder.png'; }}
                      />
                      <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-xs px-1 rounded">L</span>
                    </div>
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <div className="relative">
                      <img
                        src={getImageUrl(match.targetPhoto?.image_url)}
                        alt="Target"
                        className="w-16 h-16 object-cover rounded-xl border-2 border-gray-200"
                        onError={(e) => { e.target.src = '/placeholder.png'; }}
                      />
                      <span className="absolute -bottom-1 -right-1 bg-green-500 text-white text-xs px-1 rounded">F</span>
                    </div>
                  </div>

                  {/* Match Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900 truncate">
                        {match.sourceCase?.title || 'Unknown Case'}
                      </span>
                      <span className="text-gray-400">vs</span>
                      <span className="font-medium text-gray-900 truncate">
                        {match.targetCase?.title || 'Unknown Case'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span>{match.sourceCase?.case_type?.replace('_', ' ')}</span>
                      <span>-</span>
                      <span>{match.targetCase?.case_type?.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      <span>{match.sourceCase?.poster?.first_name} {match.sourceCase?.poster?.last_name}</span>
                      <span>|</span>
                      <span>{match.targetCase?.poster?.first_name} {match.targetCase?.poster?.last_name}</span>
                    </div>
                  </div>

                  {/* Score & Status */}
                  <div className="text-right">
                    <div className="w-32 mb-2">
                      <ConfidenceBar value={match.overall_score || 0} />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      {getStatusBadge(match.status)}
                      <span className="text-xs text-gray-400">
                        {match.created_at ? format(new Date(match.created_at), 'MMM d, yyyy') : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="p-4 border-t border-gray-200 flex justify-between items-center">
            <button
              onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
              disabled={pagination.page === 1}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
              disabled={pagination.page === pagination.pages}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
