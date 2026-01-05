/**
 * Authentication Helper
 *
 * Manages JWT tokens for test users during data seeding.
 */

const axios = require('axios');
const { API_BASE_URL, TEST_USERS } = require('../config');

// Token cache
const tokenCache = new Map();

/**
 * Login a test user and get JWT token
 */
async function login(userKey) {
  const user = TEST_USERS[userKey];
  if (!user) {
    throw new Error(`Unknown user: ${userKey}`);
  }

  // Check cache first
  const cached = tokenCache.get(userKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  try {
    const response = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: user.email,
      password: user.password,
    });

    // Token is in data.data.token (nested response format)
    const token = response.data?.data?.token || response.data?.token || response.data?.accessToken;
    if (!token) {
      console.log('[Auth] Response structure:', JSON.stringify(response.data, null, 2));
      throw new Error('No token in response');
    }

    // Cache for 55 minutes (assuming 1 hour expiry)
    tokenCache.set(userKey, {
      token,
      expiresAt: Date.now() + 55 * 60 * 1000,
    });

    console.log(`[Auth] Logged in as ${user.email}`);
    return token;
  } catch (error) {
    console.error(`[Auth] Login failed for ${user.email}:`, error.message);
    throw error;
  }
}

/**
 * Get token for User 1 (found items)
 */
async function getUser1Token() {
  return login('user1');
}

/**
 * Get token for User 2 (lost items)
 */
async function getUser2Token() {
  return login('user2');
}

/**
 * Create axios instance with auth header
 */
function createAuthenticatedClient(token) {
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Clear token cache
 */
function clearTokenCache() {
  tokenCache.clear();
}

/**
 * Ensure test users exist (creates them if not)
 */
async function ensureTestUsersExist() {
  console.log('[Auth] Checking test users...');

  for (const [key, user] of Object.entries(TEST_USERS)) {
    try {
      await login(key);
      console.log(`[Auth] User ${user.email} exists and can login`);
    } catch (error) {
      // User doesn't exist or login failed, try to register
      console.log(`[Auth] Creating user ${user.email}...`);
      try {
        const response = await axios.post(`${API_BASE_URL}/auth/register`, {
          email: user.email,
          password: user.password,
          first_name: key === 'user1' ? 'Test' : 'Test',
          last_name: key === 'user1' ? 'User One' : 'User Two',
        });

        // Get token from registration response
        const token = response.data?.data?.token || response.data?.token;
        if (token) {
          tokenCache.set(key, {
            token,
            expiresAt: Date.now() + 55 * 60 * 1000,
          });
          console.log(`[Auth] Created and logged in as ${user.email}`);
        } else {
          console.log(`[Auth] Created user ${user.email}, now logging in...`);
          await login(key);
        }
      } catch (regError) {
        // If registration fails because user exists (409), try login again
        if (regError.response?.status === 409) {
          console.log(`[Auth] User ${user.email} already exists, trying login...`);
          await login(key);
        } else {
          console.error(`[Auth] Failed to create user ${user.email}:`, regError.response?.data || regError.message);
          throw regError;
        }
      }
    }
  }

  console.log('[Auth] All test users ready');
}

module.exports = {
  login,
  getUser1Token,
  getUser2Token,
  createAuthenticatedClient,
  clearTokenCache,
  ensureTestUsersExist,
};
