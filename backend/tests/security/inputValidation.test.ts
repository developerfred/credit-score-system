import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index';

describe('Input Validation Security Tests', () => {
  describe('SQL Injection Prevention', () => {
    it('should reject wallet addresses with SQL injection attempts', async () => {
      const maliciousAddresses = [
        "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'; DROP TABLE users;--",
        "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM' OR '1'='1",
        "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'; DELETE FROM users;--",
      ];

      for (const address of maliciousAddresses) {
        const response = await request(app)
          .get(`/api/users/${encodeURIComponent(address)}`);
        
        expect(response.status).toBe(400);
      }
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize user inputs to prevent XSS', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src=x onerror=alert("xss")>',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .get('/api/users')
          .query({ search: payload });
        
        // Response should not contain unescaped script tags
        expect(response.text).not.toContain('<script>');
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal attempts', async () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      for (const path of traversalPaths) {
        const response = await request(app)
          .get(`/api/files/${encodeURIComponent(path)}`);
        
        expect(response.status).toBe(404);
      }
    });
  });

  describe('Wallet Address Format Validation', () => {
    it('should reject invalid wallet address formats', async () => {
      const invalidAddresses = [
        'invalid-address',
        '0x1234567890abcdef',
        'ST123', // too short
        'STINVALID@#$%',
        '',
        'null',
        'undefined',
      ];

      for (const address of invalidAddresses) {
        const response = await request(app)
          .get(`/api/users/${encodeURIComponent(address)}`);
        
        expect(response.status).toBe(400);
      }
    });

    it('should accept valid Stacks wallet addresses', async () => {
      const validAddresses = [
        'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRKAG',
        'ST3AMFNNS7TK4BQ9RP8MF906H68QJ5RH0M1A7N3Y',
      ];

      for (const address of validAddresses) {
        const response = await request(app)
          .get(`/api/users/${encodeURIComponent(address)}`);
        
        // Should not fail due to validation (may fail for other reasons like 404)
        expect(response.status).not.toBe(400);
      }
    });
  });
});
