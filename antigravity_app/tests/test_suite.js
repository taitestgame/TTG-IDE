const assert = require('assert');
const auth = require('../frontend/src/services/auth');

describe('parseToken', function() {
  it('should parse valid Bearer admin token and return role admin', function() {
    const result = auth.parseToken('Bearer admin-token-admin');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.role, 'admin');
  });

  it('should parse valid Bearer user token and return role user', function() {
    const result = auth.parseToken('Bearer user-token-user');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.role, 'user');
  });

  it('should return invalid for token without Bearer prefix', function() {
    const result = auth.parseToken('admin-token-admin');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.role, null);
  });

  it('should return invalid for empty string', function() {
    const result = auth.parseToken('');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.role, null);
  });

  it('should return invalid for token with only Bearer and no value', function() {
    const result = auth.parseToken('Bearer ');
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.role, null);
  });

  it('should parse token with hyphen-separated parts and identify admin role', function() {
    const result = auth.parseToken('Bearer my-app-token-admin');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.role, 'admin');
  });

  it('should parse token with hyphen-separated parts and identify user role', function() {
    const result = auth.parseToken('Bearer my-app-token-user');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.role, 'user');
  });

  it('should handle token with multiple hyphens correctly', function() {
    const result = auth.parseToken('Bearer prefix-more-stuff-admin');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.role, 'admin');
  });

  it('should handle token with multiple hyphens correctly for user', function() {
    const result = auth.parseToken('Bearer prefix-more-stuff-user');
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.role, 'user');
  });
});

describe('isAdminToken', function() {
  it('should return true for valid admin token', function() {
    const result = auth.isAdminToken('Bearer admin-token-admin');
    assert.strictEqual(result, true);
  });

  it('should return false for valid user token', function() {
    const result = auth.isAdminToken('Bearer user-token-user');
    assert.strictEqual(result, false);
  });

  it('should return false for token without Bearer prefix', function() {
    const result = auth.isAdminToken('admin-token-admin');
    assert.strictEqual(result, false);
  });

  it('should return false for empty string', function() {
    const result = auth.isAdminToken('');
    assert.strictEqual(result, false);
  });

  it('should return false for token with only Bearer and no value', function() {
    const result = auth.isAdminToken('Bearer ');
    assert.strictEqual(result, false);
  });

  it('should return false when token is malformed', function() {
    const result = auth.isAdminToken('NotABearerToken-admin');
    assert.strictEqual(result, false);
  });

  it('should return false for token with Bearer but user role', function() {
    const result = auth.isAdminToken('Bearer regular-user-user');
    assert.strictEqual(result, false);
  });
});