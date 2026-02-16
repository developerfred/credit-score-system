import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { webhookAuthMiddleware } from '../middleware/webhookAuth';

const router = Router();

const webhookSchema = z.object({
  txId: z.string(),
  contractId: z.string(),
  eventType: z.string(),
  payload: z.any(),
  blockHeight: z.number(),
});

router.post('/blockchain', webhookAuthMiddleware, async (req, res, next) => {
  try {
    const validated = webhookSchema.parse(req.body);
    
    const event = await prisma.blockchainEvent.create({
      data: {
        txId: validated.txId,
        contractId: validated.contractId,
        eventType: validated.eventType,
        payload: validated.payload,
        blockHeight: validated.blockHeight,
      },
    });

    res.status(201).json({
      status: 'success',
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/pending', async (req, res, next) => {
  try {
    const events = await prisma.blockchainEvent.findMany({
      where: { processed: false },
      orderBy: { blockHeight: 'asc' },
      take: 100,
    });

    res.json({
      status: 'success',
      data: events,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
