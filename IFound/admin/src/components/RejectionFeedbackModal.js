import React, { useState } from 'react';

const REJECTION_REASONS = [
  { code: 'wrong_color', label: 'Wrong color', icon: '🎨' },
  { code: 'wrong_size', label: 'Wrong size', icon: '📏' },
  { code: 'wrong_location', label: 'Wrong location', icon: '📍' },
  { code: 'wrong_brand', label: 'Wrong brand', icon: '🏷️' },
  { code: 'different_item_type', label: 'Different item type', icon: '📦' },
  { code: 'wrong_pattern', label: 'Wrong pattern', icon: '🔲' },
  { code: 'wrong_shape', label: 'Wrong shape', icon: '⬡' },
  { code: 'other', label: 'Other', icon: '❓' },
];

const RejectionFeedbackModal = ({
  isOpen,
  onClose,
  onSubmit,
  matchScore,
  isSubmitting = false,
  darkMode = false
}) => {
  const [selectedReasons, setSelectedReasons] = useState([]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const handleToggleReason = (code) => {
    setError('');
    setSelectedReasons(prev =>
      prev.includes(code)
        ? prev.filter(r => r !== code)
        : [...prev, code]
    );
  };

  const handleSubmit = () => {
    if (selectedReasons.length === 0) {
      setError('Please select at least one reason');
      return;
    }
    onSubmit({
      rejection_reasons: selectedReasons,
      rejection_details: details.trim() || null
    });
  };

  const handleClose = () => {
    setSelectedReasons([]);
    setDetails('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={handleClose}
    >
      <div
        className={`rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto ${
          darkMode ? 'bg-gray-800' : 'bg-white'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 text-white px-6 py-4 rounded-t-3xl flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold">Not a Match?</h3>
            <p className="text-red-100 text-sm">Help us improve by telling us why</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            disabled={isSubmitting}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Match Score Reference */}
          <div className={`rounded-2xl p-4 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Match similarity score
              </span>
              <span className={`font-bold text-lg ${
                matchScore >= 75 ? 'text-green-500' :
                matchScore >= 55 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {matchScore}%
              </span>
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Why isn't this a match? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REJECTION_REASONS.map(reason => (
                <button
                  key={reason.code}
                  type="button"
                  onClick={() => handleToggleReason(reason.code)}
                  disabled={isSubmitting}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left text-sm ${
                    selectedReasons.includes(reason.code)
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : darkMode
                        ? 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="text-lg">{reason.icon}</span>
                  <span className="font-medium">{reason.label}</span>
                  {selectedReasons.includes(reason.code) && (
                    <svg className="w-4 h-4 ml-auto text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {error && (
              <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* Additional Details */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Additional details (optional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={isSubmitting}
              placeholder="Any additional information that might help us improve..."
              rows={3}
              className={`w-full px-4 py-3 rounded-2xl border-2 resize-none transition-colors ${
                darkMode
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500 focus:border-red-500'
                  : 'bg-white border-gray-200 text-gray-700 placeholder-gray-400 focus:border-red-500'
              } focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            />
          </div>

          {/* Info Banner */}
          <div className={`rounded-2xl p-4 border ${
            darkMode ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex gap-3">
              <svg className={`w-5 h-5 flex-shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                Your feedback helps our AI learn and improve future matches for everyone.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className={`flex-1 px-4 py-3 border-2 rounded-full font-medium transition-colors ${
                darkMode
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedReasons.length === 0}
              className={`flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full font-medium transition-all ${
                isSubmitting || selectedReasons.length === 0
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </span>
              ) : (
                'Submit Feedback'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RejectionFeedbackModal;
