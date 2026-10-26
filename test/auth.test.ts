import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { api } from '../src/services/api';
import { authStorage } from '../src/services/backendApi';

describe('Auth Service & Login Integration Tests', () => {
  beforeEach(() => {
    authStorage.clearToken();
  });

  it('reports unauthenticated when no token is present', () => {
    assert.strictEqual(api.auth.isAuthenticated(), false);
  });

  it('logs in successfully and sets token and username', async () => {
    const res = await api.auth.login({ username: 'treasurer', password: 'change-me' });
    assert.ok(res.access_token);
    assert.strictEqual(api.auth.isAuthenticated(), true);
    assert.strictEqual(api.auth.getUsername(), 'treasurer');
  });

  it('clears token upon logout', async () => {
    await api.auth.login({ username: 'treasurer', password: 'change-me' });
    assert.strictEqual(api.auth.isAuthenticated(), true);
    api.auth.logout();
    assert.strictEqual(api.auth.isAuthenticated(), false);
  });
});
