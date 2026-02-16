import { Router } from 'express';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { authenticateWallet, AuthenticatedRequest } from '../middleware/auth';
import { recordTransactionSchema, walletAddressSchema } from '../utils/validation';

const router = Router();

router.get('/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    
    const validWalletAddress = walletAddressSchema.parse(walletAddress);
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: validWalletAddress },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    res.json({
      status: 'success',
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const validated = recordTransactionSchema.parse(req.body);
    
    if (req.user && req.user.walletAddress !== validated.walletAddress) {
      throw new AppError('Cannot record transaction for different user', 403);
    }
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: validated.walletAddress },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const transaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        txId: validated.txId,
        txType: validated.txType,
        amount: validated.amount,
        protocol: validated.protocol,
        blockHeight: validated.blockHeight,
        timestamp: new Date(),
        counterparty: validated.counterparty,
      },
    });

    res.status(201).json({
      status: 'success',
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
