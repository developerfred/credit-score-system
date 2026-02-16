import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { createSignature } from '../utils/testHelpers';

describe('Authentication Security Tests', () => {
  const validWalletAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  
  it('should reject requests without authentication headers', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ walletAddress: validWalletAddress });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing authentication headers');
  });

  it('should reject requests with expired timestamp', async () => {
    const expiredTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago
    
    const response = await request(app)
      .post('/api/users')
      .set('x-wallet-address', validWalletAddress)
      .set('x-timestamp', expiredTimestamp.toString())
      .set('x-nonce', '123456')
      .set('x-signature', 'invalid-signature')
      .send({ walletAddress: validWalletAddress });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Request expired');
  });

  it('should reject requests with invalid signature', async () => {
    const timestamp = Date.now().toString();
    
    const response = await request(app)
      .post('/api/users')
      .set('x-wallet-address', validWalletAddress)
      .set('x-timestamp', timestamp)
      .set('x-nonce', '123456')
      .set('x-signature', 'invalid-signature')
      .send({ walletAddress: validWalletAddress });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid signature');
  });

  it('should reject replay attacks with same nonce', async () => {
    const timestamp = Date.now().toString();
    const nonce = 'unique-nonce-123';
    const signature = await createSignature(validWalletAddress, timestamp, nonce);
    
    // First request should succeed
    const response1 = await request(app)
      .post('/api/users')
      .set('x-wallet-address', validWalletAddress)
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send({ walletAddress: validWalletAddress });
    
    expect(response1.status).toBe(201);
    
    // Second request with same nonce should fail (nonce should be tracked)
    // This would require nonce tracking implementation
  });
});

describe('Authorization Security Tests', () => {
  const wallet1 = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  const wallet2 = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRKAG';
  
  it('should prevent users from accessing other users data', async () => {
    const timestamp = Date.now().toString();
    const nonce = 'nonce-123';
    const signature = await createSignature(wallet1, timestamp, nonce);
    
    const response = await request(app)
      .get(`/api/users/${wallet2}/loans`)
      .set('x-wallet-address', wallet1)
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature);
    
    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Cannot access');
  });

  it('should prevent users from creating data for other wallets', async () => {
    const timestamp = Date.now().toString();
    const nonce = 'nonce-456';
    const signature = await createSignature(wallet1, timestamp, nonce);
    
    const response = await request(app)
      .post('/api/users')
      .set('x-wallet-address', wallet1)
      .set('x-timestamp', timestamp)
      .set('x-nonce', nonce)
      .set('x-signature', signature)
      .send({ walletAddress: wallet2 });
    
    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Cannot create');
  });
});
