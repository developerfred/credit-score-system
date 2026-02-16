import { describe, it, expect, beforeEach } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

describe('Agent Registry Contract - Full Coverage', () => {
  describe('Agent Registration', () => {
    it('should register a new agent successfully', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        [
          'Test Agent',
          'A test agent for credit analysis',
          ['credit_analysis', 'risk_assessment'],
          'https://api.testagent.com',
        ],
        wallet1
      );
      expect(result).toBeOk(wallet1);
    });

    it('should fail to register agent twice', () => {
      simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent', 'Description', ['analysis'], 'https://api.test.com'],
        wallet1
      );

      const { result } = simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent 2', 'Description 2', ['analysis2'], 'https://api2.test.com'],
        wallet1
      );
      expect(result).toBeErr(101);
    });

    it('should fail to register with empty name', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['', 'Description', ['analysis'], 'https://api.test.com'],
        wallet1
      );
      expect(result).toBeErr(103);
    });

    it('should get agent info after registration', () => {
      simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
      expect(result).toBeSome();
    });

    it('should return none for unregistered agent', () => {
      const { result } = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
      expect(result).toBeNone();
    });
  });

  describe('Agent Status', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
        wallet1
      );
    });

    it('should return active status for registered agent', () => {
      const { result } = simnet.callReadOnlyFn('agent-registry', 'is-agent-active', [wallet1], wallet1);
      expect(result).toBeBool(true);
    });

    it('should return false for unregistered agent', () => {
      const { result } = simnet.callReadOnlyFn('agent-registry', 'is-agent-active', [wallet3], wallet1);
      expect(result).toBeBool(false);
    });

    it('should update agent info', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'update-agent',
        [
          { name: 'Updated Agent' },
          { description: 'Updated description' },
          { endpoint: 'https://api.updated.com' },
          { isActive: true },
        ],
        wallet1
      );
      expect(result).toBeOk(true);
    });

    it('should fail update by non-owner', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'update-agent',
        [{ name: 'Hacked' }, null, null, null],
        wallet2
      );
      expect(result).toBeErr(102);
    });
  });

  describe('Authorization', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
        wallet1
      );
    });

    it('should allow user to authorize agent', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'authorize-agent',
        [wallet1, 1000],
        wallet2
      );
      expect(result).toBeOk(true);
    });

    it('should fail authorization for inactive agent', () => {
      simnet.callPublicFn('agent-registry', 'update-agent', [null, null, null, { isActive: false }], wallet1);
      
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'authorize-agent',
        [wallet1, 1000],
        wallet2
      );
      expect(result).toBeErr(104);
    });

    it('should check if user is authorized', () => {
      simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 1000], wallet2);
      
      const { result } = simnet.callReadOnlyFn(
        'agent-registry',
        'is-user-authorized',
        [wallet1, wallet2],
        wallet1
      );
      expect(result).toBeBool(true);
    });

    it('should return false for unauthorized user', () => {
      const { result } = simnet.callReadOnlyFn(
        'agent-registry',
        'is-user-authorized',
        [wallet1, wallet3],
        wallet1
      );
      expect(result).toBeBool(false);
    });

    it('should allow user to revoke authorization', () => {
      simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 1000], wallet2);
      
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'revoke-agent-authorization',
        [wallet1],
        wallet2
      );
      expect(result).toBeOk(true);
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
        wallet1
      );
    });

    it('should get agent performance', () => {
      const { result } = simnet.callReadOnlyFn(
        'agent-registry',
        'get-agent-performance',
        [wallet1],
        wallet1
      );
      expect(result).toHaveProperty('total-tasks', 0);
    });

    it('should get agent rating (initially 0)', () => {
      const { result } = simnet.callReadOnlyFn(
        'agent-registry',
        'get-agent-rating',
        [wallet1],
        wallet1
      );
      expect(result).toBe(0);
    });

    it('should allow rating agent', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'rate-agent',
        [wallet1, 5],
        wallet2
      );
      expect(result).toBeOk(true);
    });

    it('should fail rating above 5', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'rate-agent',
        [wallet1, 6],
        wallet2
      );
      expect(result).toBeErr(105);
    });

    it('should fail rating inactive agent', () => {
      simnet.callPublicFn('agent-registry', 'update-agent', [null, null, null, { isActive: false }], wallet1);
      
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'rate-agent',
        [wallet1, 5],
        wallet2
      );
      expect(result).toBeErr(104);
    });

    it('should record task completion', () => {
      simnet.callPublicFn('agent-registry', 'authorize-recorder', [deployer], deployer);
      
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'record-task-completion',
        [wallet1, true, 5],
        deployer
      );
      expect(result).toBeOk(true);
    });

    it('should fail record task by unauthorized', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'record-task-completion',
        [wallet1, true, 5],
        wallet2
      );
      expect(result).toBeErr(100);
    });
  });

  describe('Admin Functions', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'agent-registry',
        'register-agent',
        ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
        wallet1
      );
    });

    it('should register capability by owner', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'register-capability',
        ['new_capability', 'A new capability'],
        deployer
      );
      expect(result).toBeOk(true);
    });

    it('should fail capability registration by non-owner', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'register-capability',
        ['new_capability', 'Description'],
        wallet1
      );
      expect(result).toBeErr(100);
    });

    it('should deactivate agent by owner', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'deactivate-agent',
        [wallet1],
        deployer
      );
      expect(result).toBeOk(true);
    });

    it('should fail deactivate by non-owner', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'deactivate-agent',
        [wallet1],
        wallet2
      );
      expect(result).toBeErr(100);
    });

    it('should fail deactivate non-existent agent', () => {
      const { result } = simnet.callPublicFn(
        'agent-registry',
        'deactivate-agent',
        [wallet3],
        deployer
      );
      expect(result).toBeErr(102);
    });
  });
});
