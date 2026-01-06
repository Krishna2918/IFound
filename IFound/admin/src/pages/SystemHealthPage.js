import React, { useState, useEffect, useCallback } from 'react';
import { getSystemHealth } from '../services/api';

export default function SystemHealthPage() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const loadHealth = useCallback(async () => {
    try {
      setError('');
      const response = await getSystemHealth();
      setHealth(response.data.data);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to load system health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadHealth, 30000); // 30 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, loadHealth]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'ok':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'error':
      case 'unhealthy':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    if (status === 'healthy' || status === 'connected' || status === 'ok') {
      return (
        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    }
    if (status === 'degraded') {
      return (
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-gray-800 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-full p-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold">System Health</h1>
              <p className="text-gray-400 text-sm">Monitor system status and performance</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm">Auto-refresh</span>
            </label>
            <button
              onClick={loadHealth}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600">
          {error}
        </div>
      )}

      {health && (
        <>
          {/* Overall Status */}
          <div className={`p-6 rounded-3xl border-2 ${getStatusColor(health.status)}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(health.status)}
                <div>
                  <h2 className="text-lg font-semibold capitalize">System {health.status}</h2>
                  <p className="text-sm opacity-75">
                    Last checked: {lastRefresh?.toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm opacity-75">Version {health.version}</p>
                <p className="text-sm opacity-75">Uptime: {health.system?.uptime?.process}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Database Status */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-full">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Database</h2>
                <span className={`ml-auto px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(health.database?.status)}`}>
                  {health.database?.status}
                </span>
              </div>
              {health.database?.status === 'connected' ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Version</span>
                    <span className="text-gray-800 font-medium">{health.database?.version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Server Time</span>
                    <span className="text-gray-800 font-medium">
                      {health.database?.serverTime ? new Date(health.database.serverTime).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-red-600 text-sm">{health.database?.error}</p>
              )}
            </div>

            {/* Environment */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-100 rounded-full">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Environment</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Mode</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    health.environment?.nodeEnv === 'production'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {health.environment?.nodeEnv}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Port</span>
                  <span className="text-gray-800 font-medium">{health.environment?.port}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Stripe</span>
                    {health.environment?.hasStripe ? (
                      <span className="text-green-600">Configured</span>
                    ) : (
                      <span className="text-gray-400">Not configured</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Twilio</span>
                    {health.environment?.hasTwilio ? (
                      <span className="text-green-600">Configured</span>
                    ) : (
                      <span className="text-gray-400">Not configured</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Firebase</span>
                    {health.environment?.hasFirebase ? (
                      <span className="text-green-600">Configured</span>
                    ) : (
                      <span className="text-gray-400">Not configured</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Redis</span>
                    {health.environment?.hasRedis ? (
                      <span className="text-green-600">Configured</span>
                    ) : (
                      <span className="text-gray-400">Not configured</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Model Counts */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-100 rounded-full">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Data Counts</h2>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase">Users</p>
                  <p className="text-2xl font-bold text-gray-800">{health.models?.users?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase">Cases</p>
                  <p className="text-2xl font-bold text-gray-800">{health.models?.cases?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase">Submissions</p>
                  <p className="text-2xl font-bold text-gray-800">{health.models?.submissions?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase">Matches</p>
                  <p className="text-2xl font-bold text-gray-800">{health.models?.matches?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase">Transactions</p>
                  <p className="text-2xl font-bold text-gray-800">{health.models?.transactions?.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase">Fraud Alerts</p>
                  <p className="text-2xl font-bold text-gray-800">{health.models?.fraudAlerts?.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Pending Items */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-yellow-100 rounded-full">
                  <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Pending Items</h2>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-600">Active Cases</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    health.pending?.activeCases > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {health.pending?.activeCases || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-600">Pending Submissions</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    health.pending?.pendingSubmissions > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {health.pending?.pendingSubmissions || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-600">Pending Transactions</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    health.pending?.pendingTransactions > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {health.pending?.pendingTransactions || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                  <span className="text-gray-600">Unreviewed Fraud Alerts</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    health.pending?.unreviewedAlerts > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {health.pending?.unreviewedAlerts || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* System Resources */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md lg:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">System Resources</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase mb-1">Platform</p>
                  <p className="text-lg font-semibold text-gray-800">{health.system?.platform}</p>
                  <p className="text-sm text-gray-500">{health.system?.arch}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase mb-1">Node.js</p>
                  <p className="text-lg font-semibold text-gray-800">{health.system?.nodeVersion}</p>
                  <p className="text-sm text-gray-500">{health.system?.cpus} CPUs</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase mb-1">Memory Used</p>
                  <p className="text-lg font-semibold text-gray-800">{health.system?.memory?.usagePercent}%</p>
                  <p className="text-sm text-gray-500">{health.system?.memory?.used} / {health.system?.memory?.total}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase mb-1">Process Memory</p>
                  <p className="text-lg font-semibold text-gray-800">{health.system?.process?.heapUsed}</p>
                  <p className="text-sm text-gray-500">Heap: {health.system?.process?.heapTotal}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase mb-1">System Uptime</p>
                  <p className="text-lg font-semibold text-gray-800">{health.system?.uptime?.system}</p>
                </div>
                <div className="p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl">
                  <p className="text-gray-500 text-xs uppercase mb-1">Process Uptime</p>
                  <p className="text-lg font-semibold text-gray-800">{health.system?.uptime?.process}</p>
                </div>
              </div>
            </div>

            {/* Last 24 Hours Activity */}
            <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md lg:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-100 rounded-full">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Last 24 Hours</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">{health.last24Hours?.newUsers || 0}</p>
                  <p className="text-sm text-gray-600 mt-1">New Users</p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
                  <p className="text-3xl font-bold text-green-600">{health.last24Hours?.newCases || 0}</p>
                  <p className="text-sm text-gray-600 mt-1">New Cases</p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
                  <p className="text-3xl font-bold text-purple-600">{health.last24Hours?.newSubmissions || 0}</p>
                  <p className="text-sm text-gray-600 mt-1">Submissions</p>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl">
                  <p className="text-3xl font-bold text-yellow-600">{health.last24Hours?.completedTransactions || 0}</p>
                  <p className="text-sm text-gray-600 mt-1">Transactions</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
