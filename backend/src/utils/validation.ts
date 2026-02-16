import { z } from 'zod';

export const walletAddressSchema = z.string().regex(
  /^(ST[0-9]{1,2}|SP)[A-Z0-9]{28,40}$/,
  'Invalid Stacks wallet address format. Must start with ST (testnet) or SP (mainnet) followed by 28-40 alphanumeric characters'
);

export const createUserSchema = z.object({
  walletAddress: walletAddressSchema,
});

export const createLoanSchema = z.object({
  walletAddress: walletAddressSchema,
  loanId: z.number().int().positive(),
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive integer'),
  interestRate: z.number().min(0).max(10000),
  collateral: z.string().regex(/^\d+$/, 'Collateral must be a positive integer'),
  duration: z.number().int().positive(),
});

export const registerAgentSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1).max(64),
  description: z.string().max(256),
  capabilities: z.array(z.string().min(1).max(32)).max(20),
  endpoint: z.string().url(),
});

export const recordTransactionSchema = z.object({
  walletAddress: walletAddressSchema,
  txType: z.string().min(1),
  amount: z.string().regex(/^\d+$/),
  protocol: z.string().min(1).max(64),
  txId: z.string().min(1),
  blockHeight: z.number().int().positive(),
  counterparty: z.string().optional(),
});

export const authorizeAgentSchema = z.object({
  walletAddress: walletAddressSchema,
  duration: z.number().int().positive().max(1000000),
});
