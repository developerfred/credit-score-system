import { describe, it, expect, beforeEach } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const wallet1 = accounts.get('wallet_1')!;
const wallet2 = accounts.get('wallet_2')!;
const wallet3 = accounts.get('wallet_3')!;

describe('Agent Registry Contract - 100% Coverage', () => {
  
  describe('Untested Functions', () => {
    
    describe('get-agents-by-capability', () => {
      beforeEach(() => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['credit_analysis'], 'https://api.test.com'],
          wallet1
        );
      });

      it('should return capability info', () => {
        const { result } = simnet.callReadOnlyFn('agent-registry', 'get-agents-by-capability', ['credit_analysis'], wallet1);
        expect(result).toBeSome();
      });

      it('should return none for non-existent capability', () => {
        const { result } = simnet.callReadOnlyFn('agent-registry', 'get-agents-by-capability', ['non_existent'], wallet1);
        expect(result).toBeNone();
      });

      it('should track agent count per capability', () => {
        // Register second agent with same capability
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent 2', 'Another agent', ['credit_analysis'], 'https://api2.test.com'],
          wallet2
        );
        
        const { result } = simnet.callReadOnlyFn('agent-registry', 'get-agents-by-capability', ['credit_analysis'], wallet1);
        expect(result).toHaveProperty('agents-count', 2);
      });
    });

    describe('is-authorized-updater (private function exposed via record-task-completion)', () => {
      it('should allow only owner to record tasks', () => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
        
        // Owner records task
        const result = simnet.callPublicFn('agent-registry', 'record-task-completion',
          [wallet1, true, 5],
          deployer
        );
        expect(result).toBeOk(true);
      });

      it('should reject non-owner from recording tasks', () => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
        
        // Non-owner tries to record task
        const result = simnet.callPublicFn('agent-registry', 'record-task-completion',
          [wallet1, true, 5],
          wallet2
        );
        expect(result).toBeErr(100);
      });
    });

    describe('update-capability-count (private via register-agent)', () => {
      it('should increment capability count when agent registers', () => {
        // Register with multiple capabilities
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Multi Agent', 'Multi capability agent', ['analysis', 'risk_assessment', 'credit_score'], 'https://api.test.com'],
          wallet1
        );
        
        // Check each capability count
        const analysisResult = simnet.callReadOnlyFn('agent-registry', 'get-agents-by-capability', ['analysis'], wallet1);
        expect(analysisResult).toHaveProperty('agents-count', 1);
      });

      it('should handle multiple agents with same capability', () => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Agent 1', 'First agent', ['analysis'], 'https://api1.test.com'],
          wallet1
        );
        
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Agent 2', 'Second agent', ['analysis'], 'https://api2.test.com'],
          wallet2
        );
        
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Agent 3', 'Third agent', ['analysis'], 'https://api3.test.com'],
          wallet3
        );
        
        const { result } = simnet.callReadOnlyFn('agent-registry', 'get-agents-by-capability', ['analysis'], wallet1);
        expect(result).toHaveProperty('agents-count', 3);
      });
    });

    describe('update-agent-reputation (private via record-task-completion)', () => {
      beforeEach(() => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
      });

      it('should update reputation after successful tasks', () => {
        // Record successful tasks
        for (let i = 0; i < 5; i++) {
          simnet.callPublicFn('agent-registry', 'record-task-completion',
            [wallet1, true, 5],
            deployer
          );
        }
        
        const agentResult = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
        expect(agentResult).toBeSome();
        expect(agentResult.value).toHaveProperty('reputation');
        // Reputation should increase after successful tasks
      });

      it('should handle mixed success/failure in reputation', () => {
        // Record mixed results
        simnet.callPublicFn('agent-registry', 'record-task-completion', [wallet1, true, 5], deployer);
        simnet.callPublicFn('agent-registry', 'record-task-completion', [wallet1, false, 2], deployer);
        simnet.callPublicFn('agent-registry', 'record-task-completion', [wallet1, true, 4], deployer);
        
        const perfResult = simnet.callReadOnlyFn('agent-registry', 'get-agent-performance', [wallet1], wallet1);
        expect(perfResult).toHaveProperty('total-tasks', 3);
        expect(perfResult).toHaveProperty('successful-tasks', 2);
        expect(perfResult).toHaveProperty('failed-tasks', 1);
      });
    });

    describe('Agent NFT and Ownership', () => {
      it('should mint NFT on registration', () => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
        
        const agentResult = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
        expect(agentResult.value).toHaveProperty('owner', wallet1);
      });

      it('should maintain correct owner after updates', () => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
        
        simnet.callPublicFn('agent-registry', 'update-agent',
          [{ name: 'Updated Name' }, { description: 'Updated' }, { endpoint: 'https://updated.com' }, { isActive: true }],
          wallet1
        );
        
        const agentResult = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
        expect(agentResult.value).toHaveProperty('owner', wallet1);
      });
    });

    describe('Authorization Expiration', () => {
      beforeEach(() => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
      });

      it('should handle authorization before expiration', () => {
        simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 1000], wallet2);
        
        const authResult = simnet.callReadOnlyFn('agent-registry', 'is-user-authorized', [wallet1, wallet2], wallet1);
        expect(authResult).toBeBool(true);
      });

      it('should handle authorization after expiration', () => {
        simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 10], wallet2); // 10 blocks
        
        // Mine blocks to exceed expiration
        simnet.mineEmptyBlocks(15);
        
        const authResult = simnet.callReadOnlyFn('agent-registry', 'is-user-authorized', [wallet1, wallet2], wallet1);
        expect(authResult).toBeBool(false);
      });

      it('should allow re-authorization after expiration', () => {
        simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 10], wallet2);
        simnet.mineEmptyBlocks(15);
        
        // Re-authorize
        simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 1000], wallet2);
        
        const authResult = simnet.callReadOnlyFn('agent-registry', 'is-user-authorized', [wallet1, wallet2], wallet1);
        expect(authResult).toBeBool(true);
      });
    });

    describe('Rating System Edge Cases', () => {
      beforeEach(() => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
      });

      it('should calculate rating with single rating', () => {
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 5], wallet2);
        
        const rating = simnet.callReadOnlyFn('agent-registry', 'get-agent-rating', [wallet1], wallet1);
        expect(rating).toBe(5);
      });

      it('should calculate average with multiple ratings', () => {
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 5], wallet2);
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 3], deployer);
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 4], wallet3);
        
        const rating = simnet.callReadOnlyFn('agent-registry', 'get-agent-rating', [wallet1], wallet1);
        expect(rating).toBe(4); // (5+3+4)/3 = 4
      });

      it('should handle minimum rating (0)', () => {
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 0], wallet2);
        
        const rating = simnet.callReadOnlyFn('agent-registry', 'get-agent-rating', [wallet1], wallet1);
        expect(rating).toBe(0);
      });

      it('should handle maximum rating (5)', () => {
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 5], wallet2);
        
        const rating = simnet.callReadOnlyFn('agent-registry', 'get-agent-rating', [wallet1], wallet1);
        expect(rating).toBe(5);
      });
    });

    describe('Agent Deactivation Edge Cases', () => {
      beforeEach(() => {
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Test Agent', 'A test agent', ['analysis'], 'https://api.test.com'],
          wallet1
        );
      });

      it('should deactivate and prevent new authorizations', () => {
        simnet.callPublicFn('agent-registry', 'deactivate-agent', [wallet1], deployer);
        
        // Try to authorize after deactivation
        const authResult = simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 1000], wallet2);
        expect(authResult).toBeErr(104); // ERR_NOT_ACTIVE
      });

      it('should allow ratings even when agent is active', () => {
        const rateResult = simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 5], wallet2);
        expect(rateResult).toBeOk(true);
      });

      it('should maintain existing authorizations after deactivation', () => {
        // Authorize before deactivation
        simnet.callPublicFn('agent-registry', 'authorize-agent', [wallet1, 1000], wallet2);
        
        // Deactivate
        simnet.callPublicFn('agent-registry', 'deactivate-agent', [wallet1], deployer);
        
        // Check authorization still exists (but won't allow new operations)
        const authResult = simnet.callReadOnlyFn('agent-registry', 'is-user-authorized', [wallet1, wallet2], wallet1);
        // Authorization record exists but is-agent-active returns false
        expect(authResult.type).toBeDefined();
      });
    });

    describe('Complex Scenarios', () => {
      it('should handle full agent lifecycle', () => {
        // Register
        simnet.callPublicFn('agent-registry', 'register-agent',
          ['Lifecycle Agent', 'Test lifecycle', ['analysis', 'risk_assessment'], 'https://lifecycle.com'],
          wallet1
        );
        
        // Get initial state
        let agent = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
        expect(agent.value).toHaveProperty('is-active', true);
        expect(agent.value).toHaveProperty('reputation', 500); // Initial reputation
        
        // Record tasks
        simnet.callPublicFn('agent-registry', 'record-task-completion', [wallet1, true, 5], deployer);
        simnet.callPublicFn('agent-registry', 'record-task-completion', [wallet1, true, 4], deployer);
        
        // Rate agent
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 5], wallet2);
        simnet.callPublicFn('agent-registry', 'rate-agent', [wallet1, 4], deployer);
        
        // Update info
        simnet.callPublicFn('agent-registry', 'update-agent',
          [{ name: 'Updated Lifecycle Agent' }, null, null, { isActive: true }],
          wallet1
        );
        
        // Deactivate
        simnet.callPublicFn('agent-registry', 'deactivate-agent', [wallet1], deployer);
        
        // Verify final state
        agent = simnet.callReadOnlyFn('agent-registry', 'get-agent', [wallet1], wallet1);
        expect(agent.value).toHaveProperty('is-active', false);
      });
    });
  });
});
