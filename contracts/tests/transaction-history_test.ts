import { describe, it, expect, beforeEach } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const user = accounts.get('wallet_1')!;
const user2 = accounts.get('wallet_2')!;
const recorder = accounts.get('wallet_3')!;

describe('Transaction History Contract - Full Coverage', () => {
  beforeEach(() => {
    simnet.callPublicFn('credit-score', 'initialize', [], deployer);
    simnet.callPublicFn('credit-score', 'initialize-user-score', [], user);
    simnet.callPublicFn('credit-score', 'authorize-updater', [deployer], deployer);
    simnet.callPublicFn('transaction-history', 'authorize-recorder', [recorder], deployer);
  });

  describe('Transaction Recording', () => {
    it('should record transaction by authorized recorder', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [
          user,
          'swap',
          1000000000,
          null,
          'alex-dex',
          null,
        ],
        recorder
      );
      expect(result).toBeOk(1);
    });

    it('should fail recording by unauthorized', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 1000000000, null, 'alex-dex', null],
        user2
      );
      expect(result).toBeErr(100);
    });

    it('should fail recording with zero amount', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 0, null, 'alex-dex', null],
        recorder
      );
      expect(result).toBeErr(101);
    });

    it('should record self-transaction', () => {
      simnet.callPublicFn('transaction-history', 'authorize-recorder', [user], deployer);
      
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'record-self-transaction',
        ['lend', 500000000, 'stacking-dao', null],
        user
      );
      expect(result).toBeOk(1);
    });
  });

  describe('Transaction Queries', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 1000000000, null, 'alex-dex', null],
        recorder
      );
    });

    it('should get transaction by id', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-transaction',
        [1],
        user
      );
      expect(result).toBeSome();
    });

    it('should return none for non-existent transaction', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-transaction',
        [999],
        user
      );
      expect(result).toBeNone();
    });

    it('should get user transactions', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-user-transactions',
        [user],
        user
      );
      expect(result).toBeOk(expect.arrayContaining([1]));
    });

    it('should return empty list for user with no transactions', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-user-transactions',
        [user2],
        user2
      );
      expect(result).toBeOk([]);
    });
  });

  describe('User Stats', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 1000000000, null, 'alex-dex', null],
        recorder
      );
    });

    it('should get user stats', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-user-stats',
        [user],
        user
      );
      expect(result).toHaveProperty('total-transactions', 1);
      expect(result).toHaveProperty('total-volume', 1000000000);
    });

    it('should return default stats for new user', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-user-stats',
        [user2],
        user2
      );
      expect(result).toHaveProperty('total-transactions', 0);
    });
  });

  describe('Protocol Stats', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 1000000000, null, 'alex-dex', null],
        recorder
      );
    });

    it('should get protocol stats', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-protocol-stats',
        ['alex-dex'],
        user
      );
      expect(result).toHaveProperty('total-transactions', 1);
    });

    it('should return default stats for new protocol', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-protocol-stats',
        ['new-protocol'],
        user
      );
      expect(result).toHaveProperty('total-transactions', 0);
    });
  });

  describe('Transaction Score Calculation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 1000000000, null, 'alex-dex', null],
        recorder
      );
    });

    it('should calculate transaction score', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'calculate-transaction-score',
        [user],
        user
      );
      expect(result).toBeGreaterThan(0);
    });

    it('should return zero for user with no transactions', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'calculate-transaction-score',
        [user2],
        user2
      );
      expect(result).toBe(0);
    });
  });

  describe('Transaction Counter', () => {
    it('should get tx counter', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-tx-counter',
        [],
        user
      );
      expect(result).toBe(0);
    });

    it('should increment counter on record', () => {
      simnet.callPublicFn(
        'transaction-history',
        'record-transaction',
        [user, 'swap', 1000000000, null, 'alex-dex', null],
        recorder
      );

      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'get-tx-counter',
        [],
        user
      );
      expect(result).toBe(1);
    });
  });

  describe('Recorder Authorization', () => {
    it('should check if recorder is authorized', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'is-authorized-recorder',
        [recorder],
        user
      );
      expect(result).toBeBool(true);
    });

    it('should return false for unauthorized recorder', () => {
      const { result } = simnet.callReadOnlyFn(
        'transaction-history',
        'is-authorized-recorder',
        [user2],
        user
      );
      expect(result).toBeBool(false);
    });
  });

  describe('Admin Functions', () => {
    it('should authorize new recorder by owner', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'authorize-recorder',
        [user2],
        deployer
      );
      expect(result).toBeOk(true);
    });

    it('should fail authorization by non-owner', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'authorize-recorder',
        [user2],
        user
      );
      expect(result).toBeErr(100);
    });

    it('should revoke recorder by owner', () => {
      simnet.callPublicFn('transaction-history', 'authorize-recorder', [user2], deployer);
      
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'revoke-recorder',
        [user2],
        deployer
      );
      expect(result).toBeOk(true);
    });

    it('should fail revoke by non-owner', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'revoke-recorder',
        [recorder],
        user
      );
      expect(result).toBeErr(100);
    });
  });

  describe('Failed Transaction Recording', () => {
    it('should record failed transaction', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'record-failed-transaction',
        [user, 'alex-dex'],
        recorder
      );
      expect(result).toBeOk(true);
    });

    it('should fail by unauthorized', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'record-failed-transaction',
        [user, 'alex-dex'],
        user2
      );
      expect(result).toBeErr(100);
    });
  });

  describe('Batch Operations', () => {
    it('should record batch transactions', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'batch-record-transactions',
        [
          [user, user2],
          [1000000000, 2000000000],
          'alex-dex',
        ],
        recorder
      );
      expect(result).toBeOk(true);
    });

    it('should fail batch by unauthorized', () => {
      const { result } = simnet.callPublicFn(
        'transaction-history',
        'batch-record-transactions',
        [[user], [1000000000], 'alex-dex'],
        user2
      );
      expect(result).toBeErr(100);
    });
  });
});
