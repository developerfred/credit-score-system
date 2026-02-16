import { Router } from 'express';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Get credit score by wallet address
router.get('/:walletAddress', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: {
        creditScores: {
          orderBy: { lastUpdated: 'desc' },
          take: 1,
        },
      },
    });

    if (!user || user.creditScores.length === 0) {
      throw new AppError('Credit score not found', 404);
    }

    const creditScore = user.creditScores[0];

    res.json({
      status: 'success',
      data: {
        walletAddress,
        score: creditScore.score,
        tier: creditScore.tier,
        history: JSON.parse(creditScore.history as string),
        factors: JSON.parse(creditScore.factors as string),
        lastUpdated: creditScore.lastUpdated,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get credit score history
router.get('/:walletAddress/history', async (req, res, next) => {
  try {
    const { walletAddress } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: {
        creditScores: {
          orderBy: { lastUpdated: 'desc' },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const history = user.creditScores.map(cs => ({
      score: cs.score,
      tier: cs.tier,
      lastUpdated: cs.lastUpdated,
    }));

    res.json({
      status: 'success',
      data: history,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
