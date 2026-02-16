import { Router } from 'express';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { authenticateWallet, AuthenticatedRequest } from '../middleware/auth';
import { registerAgentSchema, authorizeAgentSchema, walletAddressSchema } from '../utils/validation';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      include: {
        performance: true,
        _count: {
          select: { authorizations: true },
        },
      },
      where: { isActive: true },
      orderBy: { reputation: 'desc' },
    });

    res.json({
      status: 'success',
      data: agents,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:agentId', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    
    const agent = await prisma.agent.findUnique({
      where: { agentId },
      include: {
        performance: true,
        authorizations: true,
      },
    });

    if (!agent) {
      throw new AppError('Agent not found', 404);
    }

    res.json({
      status: 'success',
      data: agent,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const validated = registerAgentSchema.parse(req.body);
    
    if (req.user && req.user.walletAddress !== validated.agentId) {
      throw new AppError('Cannot register agent for different wallet', 403);
    }
    
    const existingAgent = await prisma.agent.findUnique({
      where: { agentId: validated.agentId },
    });

    if (existingAgent) {
      throw new AppError('Agent already registered', 409);
    }

    const agent = await prisma.agent.create({
      data: {
        agentId: validated.agentId,
        name: validated.name,
        description: validated.description,
        capabilities: validated.capabilities,
        endpoint: validated.endpoint,
      },
    });

    await prisma.agentPerformance.create({
      data: {
        agentId: agent.id,
      },
    });

    res.status(201).json({
      status: 'success',
      data: agent,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:agentId/authorize', authenticateWallet, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { agentId } = req.params;
    const validated = authorizeAgentSchema.parse(req.body);
    
    if (req.user && req.user.walletAddress !== validated.walletAddress) {
      throw new AppError('Cannot authorize agent for different user', 403);
    }
    
    const agent = await prisma.agent.findUnique({
      where: { agentId },
    });

    if (!agent) {
      throw new AppError('Agent not found', 404);
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress: validated.walletAddress },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (validated.duration / 144)); // Convert blocks to days (approx)

    const authorization = await prisma.agentAuthorization.upsert({
      where: {
        agentId_userId: {
          agentId: agent.id,
          userId: user.id,
        },
      },
      update: {
        authorized: true,
        expiresAt,
      },
      create: {
        agentId: agent.id,
        userId: user.id,
        authorized: true,
        expiresAt,
      },
    });

    res.json({
      status: 'success',
      data: authorization,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
