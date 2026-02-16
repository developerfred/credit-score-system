import { Router } from 'express';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { authenticateWallet, AuthenticatedRequest } from '../middleware/auth';
import { createUserSchema, walletAddressSchema } from '../utils/validation';

const router = Router();

router.get('/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    const validWalletAddress = walletAddressSchema.parse(walletAddress);
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: validWalletAddress },
      include: {
        creditScores: {
          orderBy: { lastUpdated: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const validated = createUserSchema.parse(req.body);
    
    if (req.user && req.user.walletAddress !== validated.walletAddress) {
      throw new AppError('Cannot create user for different wallet address', 403);
    }
    
    const existingUser = await prisma.user.findUnique({
      where: { walletAddress: validated.walletAddress },
    });

    if (existingUser) {
      throw new AppError('User already exists', 409);
    }

    const user = await prisma.user.create({
      data: {
        walletAddress: validated.walletAddress,
      },
    });

    await prisma.creditScore.create({
      data: {
        userId: user.id,
        score: 500,
        tier: 'fair',
        history: JSON.stringify([{ score: 500, timestamp: new Date() }]),
        factors: JSON.stringify({
          paymentHistory: 35,
          transactionVolume: 25,
          accountAge: 20,
          creditMix: 10,
          recentInquiries: 10,
        }),
      },
    });

    res.status(201).json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:walletAddress/loans', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { walletAddress } = req.params;
    const validWalletAddress = walletAddressSchema.parse(walletAddress);
    
    if (req.user && req.user.walletAddress !== validWalletAddress) {
      throw new AppError('Cannot access loans of different user', 403);
    }
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: validWalletAddress },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const loans = await prisma.loan.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: loans,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:walletAddress/transactions', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { walletAddress } = req.params;
    const validWalletAddress = walletAddressSchema.parse(walletAddress);
    
    if (req.user && req.user.walletAddress !== validWalletAddress) {
      throw new AppError('Cannot access transactions of different user', 403);
    }
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: validWalletAddress },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { timestamp: 'desc' },
    });

    res.json({
      status: 'success',
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
