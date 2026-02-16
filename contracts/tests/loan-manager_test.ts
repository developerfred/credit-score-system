import { describe, it, expect, beforeEach } from 'vitest';

const accounts = simnet.getAccounts();
const deployer = accounts.get('deployer')!;
const borrower = accounts.get('wallet_1')!;
const lender = accounts.get('wallet_2')!;
const other = accounts.get('wallet_3')!;

describe('Loan Manager Contract - Full Coverage', () => {
  beforeEach(() => {
    simnet.callPublicFn('credit-score', 'initialize', [], deployer);
    simnet.callPublicFn('credit-score', 'initialize-user-score', [], borrower);
    simnet.callPublicFn('credit-score', 'authorize-updater', [deployer], deployer);
    simnet.callPublicFn('credit-score', 'update-credit-score', [borrower, 750], deployer);
  });

  describe('Loan Queries', () => {
    it('should calculate max loan amount based on credit tier', () => {
      const { result } = simnet.callReadOnlyFn(
        'loan-manager',
        'get-max-loan-amount',
        [borrower],
        borrower
      );
      expect(result).toBeOk(5000000000);
    });

    it('should calculate interest rate based on credit score', () => {
      const { result } = simnet.callReadOnlyFn(
        'loan-manager',
        'get-interest-rate',
        [borrower],
        borrower
      );
      expect(result).toBeOk(800);
    });

    it('should return loan count', () => {
      const { result } = simnet.callReadOnlyFn(
        'loan-manager',
        'get-loan-count',
        [],
        borrower
      );
      expect(result).toBeOk(0);
    });
  });

  describe('Loan Request', () => {
    it('should request a loan with sufficient collateral', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [
          2000000000,
          12960,
          200000000,
        ],
        borrower
      );
      expect(result).toBeOk(1);
    });

    it('should fail if amount exceeds max', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [
          10000000000,
          12960,
          500000000,
        ],
        borrower
      );
      expect(result).toBeErr(102);
    });

    it('should fail with zero amount', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [
          0,
          12960,
          200000000,
        ],
        borrower
      );
      expect(result).toBeErr(101);
    });

    it('should fail with zero duration', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [
          2000000000,
          0,
          200000000,
        ],
        borrower
      );
      expect(result).toBeErr(101);
    });

    it('should fail with insufficient collateral', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [
          2000000000,
          12960,
          10000000,
        ],
        borrower
      );
      expect(result).toBeErr(105);
    });
  });

  describe('Loan Funding', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [2000000000, 12960, 200000000],
        borrower
      );
    });

    it('should allow lender to fund loan', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'fund-loan',
        [1],
        lender
      );
      expect(result).toBeOk(true);
    });

    it('should fail funding own loan', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'fund-loan',
        [1],
        borrower
      );
      expect(result).toBeErr(100);
    });

    it('should fail funding non-pending loan', () => {
      simnet.callPublicFn('loan-manager', 'fund-loan', [1], lender);
      
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'fund-loan',
        [1],
        other
      );
      expect(result).toBeErr(104);
    });

    it('should fail funding non-existent loan', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'fund-loan',
        [999],
        lender
      );
      expect(result).toBeErr(103);
    });
  });

  describe('Loan Repayment', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [2000000000, 12960, 200000000],
        borrower
      );
      simnet.callPublicFn('loan-manager', 'fund-loan', [1], lender);
    });

    it('should allow borrower to repay loan', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'repay-loan',
        [1, 500000000],
        borrower
      );
      expect(result).toBeOk(true);
    });

    it('should fail repayment by non-borrower', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'repay-loan',
        [1, 500000000],
        lender
      );
      expect(result).toBeErr(100);
    });

    it('should fail repayment for non-active loan', () => {
      simnet.callPublicFn('loan-manager', 'set-loan-status', [1, 'repaid'], deployer);
      
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'repay-loan',
        [1, 500000000],
        borrower
      );
      expect(result).toBeErr(104);
    });
  });

  describe('Loan Cancellation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [2000000000, 12960, 200000000],
        borrower
      );
    });

    it('should allow borrower to cancel pending loan', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'cancel-loan',
        [1],
        borrower
      );
      expect(result).toBeOk(true);
    });

    it('should fail cancellation by non-borrower', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'cancel-loan',
        [1],
        lender
      );
      expect(result).toBeErr(100);
    });

    it('should fail cancellation of non-pending loan', () => {
      simnet.callPublicFn('loan-manager', 'fund-loan', [1], lender);
      
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'cancel-loan',
        [1],
        borrower
      );
      expect(result).toBeErr(104);
    });
  });

  describe('Loan Liquidation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [2000000000, 10, 200000000],
        borrower
      );
      simnet.callPublicFn('loan-manager', 'fund-loan', [1], lender);
    });

    it('should allow liquidation after expiration', () => {
      simnet.mineEmptyBlocks(20);
      
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'liquidate-loan',
        [1],
        lender
      );
      expect(result).toBeOk(true);
    });

    it('should fail liquidation before expiration', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'liquidate-loan',
        [1],
        lender
      );
      expect(result).toBeErr(106);
    });

    it('should fail liquidation of non-active loan', () => {
      simnet.mineEmptyBlocks(20);
      simnet.callPublicFn('loan-manager', 'liquidate-loan', [1], lender);
      
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'liquidate-loan',
        [1],
        lender
      );
      expect(result).toBeErr(104);
    });
  });

  describe('Admin Functions', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [2000000000, 12960, 200000000],
        borrower
      );
    });

    it('should allow owner to set loan status', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'set-loan-status',
        [1, 'active'],
        deployer
      );
      expect(result).toBeOk(true);
    });

    it('should fail set status by non-owner', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'set-loan-status',
        [1, 'active'],
        borrower
      );
      expect(result).toBeErr(100);
    });

    it('should fail set status for non-existent loan', () => {
      const { result } = simnet.callPublicFn(
        'loan-manager',
        'set-loan-status',
        [999, 'active'],
        deployer
      );
      expect(result).toBeErr(103);
    });
  });

  describe('Interest Calculation', () => {
    beforeEach(() => {
      simnet.callPublicFn(
        'loan-manager',
        'request-loan',
        [2000000000, 12960, 200000000],
        borrower
      );
      simnet.callPublicFn('loan-manager', 'fund-loan', [1], lender);
    });

    it('should calculate interest accrued', () => {
      simnet.mineEmptyBlocks(100);
      
      const { result } = simnet.callReadOnlyFn(
        'loan-manager',
        'calculate-interest',
        [1],
        borrower
      );
      expect(result).toBeOk(expect.any(Number));
    });

    it('should get total amount due', () => {
      const { result } = simnet.callReadOnlyFn(
        'loan-manager',
        'get-total-due',
        [1],
        borrower
      );
      expect(result).toBeOk(expect.any(Number));
    });

    it('should fail interest calculation for non-existent loan', () => {
      const { result } = simnet.callReadOnlyFn(
        'loan-manager',
        'calculate-interest',
        [999],
        borrower
      );
      expect(result).toBeErr(103);
    });
  });
});
