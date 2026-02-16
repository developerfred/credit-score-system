import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

if (!WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('WEBHOOK_SECRET must be set in production');
}

export const verifyWebhookSignature = (
  payload: any,
  signature: string,
  secret: string
): boolean => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    return false;
  }
};

export const webhookAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!signature) {
      res.status(401).json({ error: 'Missing webhook signature' });
      return;
    }

    if (!WEBHOOK_SECRET) {
      console.warn('WEBHOOK_SECRET not set, skipping verification in development');
      next();
      return;
    }

    const isValid = verifyWebhookSignature(req.body, signature, WEBHOOK_SECRET);
    
    if (!isValid) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    next();
  } catch (error) {
    console.error('Webhook authentication error:', error);
    res.status(500).json({ error: 'Webhook authentication failed' });
  }
};
