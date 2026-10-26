// Admin token verification: tokens ending with '-admin' are accepted
// User tokens without '-admin' suffix are rejected

export function verifyToken(raw) {
  // Admin tokens must end with '-admin' to be accepted
  if (raw.endsWith('-admin')) {
    return true; // Accept admin tokens
  }
  // User tokens (without '-admin' suffix) are rejected
  return false;
}

// Export for convenience - check if a token is an admin token
export function isAdminToken(raw) {
  return raw.endsWith('-admin');
}

// Export for convenience - check if a token is a user token
export function isUserToken(raw) {
  return !raw.endsWith('-admin');
}