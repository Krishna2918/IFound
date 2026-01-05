import React, { useState, useEffect } from 'react';
import StatsCard from '../components/StatsCard';
import { getAnalytics } from '../services/api';
import { format } from 'date-fns';

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const response = await getAnalytics();
      setAnalytics(response.data.data);
    } catch (err) {
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-gray-800 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-gray-400 text-sm">Overview of platform activity</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Users"
          value={analytics?.totals?.users || 0}
          icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
          color="blue"
        />
        <StatsCard
          title="Total Cases"
          value={analytics?.totals?.cases || 0}
          icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          color="gray"
        />
        <StatsCard
          title="Active Cases"
          value={analytics?.totals?.activeCases || 0}
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          color="green"
        />
        <StatsCard
          title="Resolved Cases"
          value={analytics?.totals?.resolvedCases || 0}
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          color="purple"
        />
      </div>

      {/* Financial Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Financial Overview</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Bounties</span>
              <span className="text-xl font-bold text-green-600">
                ${parseFloat(analytics?.financial?.totalBounties || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Platform Commission</span>
              <span className="text-xl font-bold text-gray-800">
                ${parseFloat(analytics?.financial?.totalCommission || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Cases by Type</h2>
          <div className="space-y-3">
            {analytics?.casesByType?.map((item) => (
              <div key={item.case_type} className="flex justify-between items-center">
                <span className="text-gray-600 capitalize">{item.case_type.replace('_', ' ')}</span>
                <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cases */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Cases</h2>
          <div className="space-y-3">
            {analytics?.recentActivity?.cases?.map((caseItem) => (
              <div key={caseItem.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
                <div>
                  <p className="font-medium text-gray-800">{caseItem.title}</p>
                  <p className="text-sm text-gray-500">
                    {caseItem.created_at ? format(new Date(caseItem.created_at), 'MMM d, yyyy') : 'N/A'} - ${caseItem.bounty_amount}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  caseItem.status === 'active' ? 'bg-green-100 text-green-700' :
                  caseItem.status === 'resolved' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {caseItem.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Submissions */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Submissions</h2>
          <div className="space-y-3">
            {analytics?.recentActivity?.submissions?.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
                <div>
                  <p className="font-medium text-gray-800">{sub.case?.title || 'Unknown Case'}</p>
                  <p className="text-sm text-gray-500 capitalize">
                    {sub.submission_type} - {sub.created_at ? format(new Date(sub.created_at), 'MMM d, yyyy') : 'N/A'}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  sub.verification_status === 'verified' ? 'bg-green-100 text-green-700' :
                  sub.verification_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {sub.verification_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
