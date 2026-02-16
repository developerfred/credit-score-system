import { Router } from 'express';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { authenticateWallet, AuthenticatedRequest } from '../middleware/auth';
import { createLoanSchema } from '../utils/validation';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const loans = await prisma.loan.findMany({
      include: {
        user: {
          select: {
            walletAddress: true,
          },
        },
      },
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

router.post('/', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const validated = createLoanSchema.parse(req.body);
    
    if (req.user && req.user.walletAddress !== validated.walletAddress) {
      throw new AppError('Cannot create loan for different user', 403);
    }
    
    const user = await prisma.user.findUnique({
      where: { walletAddress: validated.walletAddress },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const loan = await prisma.loan.create({
      data: {
        userId: user.id,
        loanId: validated.loanId,
        amount: validated.amount,
        interestRate: validated.interestRate,
        collateral: validated.collateral,
        duration: validated.duration,
        status: 'pending',
      },
    });

    res.status(201).json({
      status: 'success',
      data: loan,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:loanId', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { loanId } = req.params;
    const { status, lender, startBlock } = req.body;
    
    const loan = await prisma.loan.update({
      where: { loanId: parseInt(loanId) },
      data: {
        status,
        lender,
        startBlock,
      },
    });

    res.json({
      status: 'success',
      data: loan,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
