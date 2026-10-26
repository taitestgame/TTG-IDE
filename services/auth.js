/**
 * Token validation module for admin vs user token distinction.
 * Token format: Bearer <token> where admin tokens end with "-admin"
 * and user tokens end with "-user".
 *
 * Preserves Bearer prefix handling and role-based distinction.
 */

const TokenValidator = {
  /**
   * Extract and validate the Bearer token from an Authorization header.
   * Returns { valid: boolean, role: 'admin'|'user'|'unknown', token: string }.
   */
  parseToken(authorizationHeader) {
    if (!authorizationHeader) {
      return { valid: false, role: null, token: '' };
    }

    const parts = authorizationHeader.trim().split(/\s+/);

    // Must be "Bearer <token>"
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return { valid: false, role: null, token: '' };
    }

    const token = parts[1].trim();

    if (!token) {
      return { valid: false, role: null, token: '' };
    }

    // Determine role based on token suffix
    if (token.endsWith('-admin')) {
      return { valid: true, role: 'admin', token };
    }

    if (token.endsWith('-user')) {
      return { valid: true, role: 'user', token };
    }

    // Token does not match expected patterns
    return { valid: false, role: null, token };
  },

  /**
   * Check if a token is a valid admin token.
   * Accepts either a full Authorization header or just the token string.
   */
  isAdminToken(authorizationHeaderOrToken) {
    const result = authorizationHeaderOrToken
      ? this.parseToken(authorizationHeaderOrToken)
      : { valid: false, role: null, token: '' };

    return result.valid && result.role === 'admin';
  },

  /**
   * Check if a token is a valid user token.
   * Accepts either a full Authorization header or just the token string.
   */
  isUserToken(authorizationHeaderOrToken) {
    const result = authorizationHeaderOrToken
      ? this.parseToken(authorizationHeaderOrToken)
      : { valid: false, role: null, token: '' };

    return result.valid && result.role === 'user';
  },

  /**
   * Get the role from a token.
   * Returns 'admin', 'user', or 'unknown'.
   */
  getRole(authorizationHeaderOrToken) {
    const result = authorizationHeaderOrToken
      ? this.parseToken(authorizationHeaderOrToken)
      : { valid: false, role: null, token: '' };

    return result.role;
  },

  /**
   * Get the raw token string from an Authorization header.
   */
  getToken(authorizationHeaderOrToken) {
    const result = authorizationHeaderOrToken
      ? this.parseToken(authorizationHeaderOrToken)
      : { valid: false, role: null, token: '' };

    return result.token;
  },
};

module.exports = TokenValidator;