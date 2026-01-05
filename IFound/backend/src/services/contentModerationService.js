/**
 * Content Moderation Service
 *
 * Detects and prevents buying/selling behavior on the lost & found platform.
 * This ensures items are returned to rightful owners, not sold.
 */

// Words/phrases that indicate selling intent
const SELLING_INDICATORS = [
  // Direct selling
  'for sale', 'selling', 'sell', 'buy now', 'purchase', 'buying',
  'price', 'asking price', 'best offer', 'obo', 'or best offer',
  'make an offer', 'highest bidder', 'bidding', 'auction',

  // Payment terms
  'cash only', 'venmo', 'paypal', 'zelle', 'e-transfer', 'etransfer',
  'payment', 'pay me', 'send money', 'wire transfer',

  // Negotiation
  'negotiable', 'firm price', 'no lowballers', 'serious buyers',
  'inquiries only', 'dm for price', 'message for price',

  // Marketplace language
  'brand new', 'like new condition', 'mint condition', 'barely used',
  'original packaging', 'with receipt', 'warranty', 'authentic',
  'retail price', 'market value', 'worth', 'valued at',

  // Urgency tactics
  'must sell', 'quick sale', 'first come first serve', 'won\'t last',
  'limited time', 'today only', 'act fast',
];

// Phrases that are acceptable in lost & found context
const ALLOWED_EXCEPTIONS = [
  'reward', 'finder\'s fee', 'finder fee', 'thank you',
  'grateful', 'appreciation', 'bounty', 'tip',
  'return', 'lost', 'found', 'missing', 'looking for',
  'belongs to', 'owner', 'claim', 'verify',
];

// Suspicious patterns (regex)
const SUSPICIOUS_PATTERNS = [
  /\$\s*\d{2,}/g,           // Dollar amounts over $10 (except bounty field)
  /\d{3,}\s*(dollars?|cad|usd|bucks)/gi,  // Large amounts with currency
  /dm\s*(me|for)/gi,        // DM requests
  /text\s*me/gi,            // Text me requests
  /call\s*me/gi,            // Call me requests
  /\(\d{3}\)\s*\d{3}/g,     // Phone numbers
  /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g,  // Phone numbers
];

/**
 * Analyze text for selling/buying indicators
 * @param {string} text - Text to analyze
 * @param {string} context - Context: 'case_description', 'claim_verification', 'message'
 * @returns {object} - Analysis result
 */
const analyzeContent = (text, context = 'case_description') => {
  if (!text || typeof text !== 'string') {
    return { isClean: true, score: 0, flags: [], suggestions: [] };
  }

  const lowerText = text.toLowerCase();
  const flags = [];
  let score = 0;

  // Check for selling indicators
  for (const indicator of SELLING_INDICATORS) {
    if (lowerText.includes(indicator.toLowerCase())) {
      // Check if it's in an allowed context
      const hasException = ALLOWED_EXCEPTIONS.some(exc =>
        lowerText.includes(exc.toLowerCase())
      );

      if (!hasException) {
        flags.push({
          type: 'selling_language',
          match: indicator,
          severity: 'high',
        });
        score += 25;
      }
    }
  }

  // Check for suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      flags.push({
        type: 'suspicious_pattern',
        match: matches[0],
        severity: 'medium',
      });
      score += 15;
    }
  }

  // Check for excessive dollar amounts in description (not bounty)
  if (context === 'case_description') {
    const dollarMatches = text.match(/\$\s*(\d+)/g);
    if (dollarMatches) {
      for (const match of dollarMatches) {
        const amount = parseInt(match.replace(/\D/g, ''));
        if (amount > 100) {
          flags.push({
            type: 'high_amount',
            match: match,
            amount: amount,
            severity: 'high',
          });
          score += 30;
        }
      }
    }
  }

  // Generate suggestions
  const suggestions = [];
  if (flags.some(f => f.type === 'selling_language')) {
    suggestions.push('Please remove selling/buying language. This platform is for returning lost items to their owners, not for sales.');
  }
  if (flags.some(f => f.type === 'suspicious_pattern')) {
    suggestions.push('Please do not include personal contact information. All communication should happen through the platform.');
  }
  if (flags.some(f => f.type === 'high_amount')) {
    suggestions.push('Large dollar amounts detected. Remember, finder\'s rewards are capped at $50 CAD.');
  }

  return {
    isClean: score < 25,
    score: Math.min(100, score),
    flags,
    suggestions,
    blocked: score >= 50,
  };
};

/**
 * Check if a case description is appropriate for lost & found
 * @param {object} caseData - Case data with title, description
 * @returns {object} - Validation result
 */
const validateCaseContent = (caseData) => {
  const { title, description } = caseData;

  const titleAnalysis = analyzeContent(title, 'case_title');
  const descAnalysis = analyzeContent(description, 'case_description');

  const combinedScore = Math.max(titleAnalysis.score, descAnalysis.score);
  const allFlags = [...titleAnalysis.flags, ...descAnalysis.flags];
  const allSuggestions = [...new Set([...titleAnalysis.suggestions, ...descAnalysis.suggestions])];

  return {
    isValid: combinedScore < 50,
    score: combinedScore,
    flags: allFlags,
    suggestions: allSuggestions,
    message: combinedScore >= 50
      ? 'Your post appears to contain selling/buying language which is not allowed on this platform.'
      : combinedScore >= 25
        ? 'Your post may contain inappropriate content. Please review before submitting.'
        : null,
  };
};

/**
 * Check if a claim is legitimate (not a purchase attempt)
 * @param {object} claimData - Claim data
 * @returns {object} - Validation result
 */
const validateClaimContent = (claimData) => {
  const { verification_description, bounty_offered } = claimData;

  const analysis = analyzeContent(verification_description, 'claim_verification');

  // Additional check: bounty too high compared to typical rewards
  if (bounty_offered > 50) {
    analysis.flags.push({
      type: 'excessive_bounty',
      match: `$${bounty_offered}`,
      severity: 'high',
    });
    analysis.score += 30;
    analysis.suggestions.push('Finder\'s rewards are capped at $50 CAD.');
  }

  return {
    isValid: analysis.score < 50,
    score: analysis.score,
    flags: analysis.flags,
    suggestions: analysis.suggestions,
    message: analysis.score >= 50
      ? 'Your claim appears to contain inappropriate content. This platform is for claiming lost items, not purchasing.'
      : null,
  };
};

/**
 * Report content for manual review
 * @param {string} contentType - 'case', 'claim', 'message'
 * @param {string} contentId - ID of the content
 * @param {string} reporterId - ID of the reporter
 * @param {string} reason - Reason for report
 */
const reportContent = async (contentType, contentId, reporterId, reason) => {
  // TODO: Store report in database for admin review
  console.log(`Content reported: ${contentType} ${contentId} by ${reporterId} - ${reason}`);
  return { success: true, message: 'Report submitted for review' };
};

module.exports = {
  analyzeContent,
  validateCaseContent,
  validateClaimContent,
  reportContent,
  SELLING_INDICATORS,
};
