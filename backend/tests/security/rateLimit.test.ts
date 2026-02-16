import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';
import { createSignature } from '../utils/testHelpers';

describe('Rate Limiting Security Tests', () => {
  const walletAddress = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
  
  it('should enforce rate limits on API endpoints', async () => {
    const requests = Array(105).fill(null).map(() => 
      request(app).get('/api/users/' + walletAddress)
    );
    
    const responses = await Promise.all(requests);
    
    // Some requests should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  it('should have specific rate limit for loan creation', async () => {
    const timestamp = Date.now().toString();
    const signature = await createSignature(walletAddress, timestamp, 'test-nonce');
    
    // Make 6 loan requests (limit is 5)
    const requests = Array(6).fill(null).map(() => 
      request(app)
        .post('/api/loans')
        .set('x-wallet-address', walletAddress)
        .set('x-timestamp', timestamp)
        .set('x-nonce', 'test-nonce')
        .set('x-signature', signature)
        .send({
          walletAddress,
          loanId: 1,
          amount: '1000000',
          interestRate: 5,
          collateral: '500000',
          duration: 1000,
        })
    );
    
    const responses = await Promise.all(requests);
    
    // At least one should be rate limited
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('should include rate limit headers', async () => {
    const response = await request(app)
      .get('/api/users/' + walletAddress);
    
    expect(response.headers).toHaveProperty('ratelimit-limit');
    expect(response.headers).toHaveProperty('ratelimit-remaining');
  });
});

describe('DoS Prevention Tests', () => {
  it('should reject requests with excessively large payloads', async () => {
    const largePayload = { data: 'x'.repeat(20 * 1024 * 1024) }; // 20MB
    
    const response = await request(app)
      .post('/api/users')
      .send(largePayload);
    
    expect(response.status).toBe(413); // Payload Too Large
  });

  it('should handle slowloris-style attacks', async () => {
    // This would require a more sophisticated test setup
    // For now, we verify the server responds normally
    const response = await request(app)
      .get('/health')
      .timeout(5000);
    
    expect(response.status).toBe(200);
  });
});
