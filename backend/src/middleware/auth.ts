import { Request, Response, NextFunction } from 'express';
import { verifyMessageSignatureRsv } from '@stacks/encryption';

export interface AuthenticatedRequest extends Request {
  user?: {
    walletAddress: string;
  };
}

const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export const authenticateWallet = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string;
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;
    
    if (!walletAddress || !signature || !timestamp || !nonce) {
      res.status(401).json({ 
        error: 'Missing authentication headers',
        required: ['x-wallet-address', 'x-signature', 'x-timestamp', 'x-nonce']
      });
      return;
    }

    // Verify timestamp is not too old (prevent replay attacks)
    const timestampNum = parseInt(timestamp);
    if (isNaN(timestampNum) || Date.now() - timestampNum > NONCE_EXPIRY_MS) {
      res.status(401).json({ error: 'Request expired or invalid timestamp' });
      return;
    }

    // Create message for verification
    const message = `DeFi Credit Score Auth\nAddress: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
    
    // Verify signature
    const isValid = verifyMessageSignatureRsv({
      message,
      publicKey: walletAddress,
      signature: signature,
    });

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    req.user = { walletAddress };
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Optional authentication - doesn't fail if no auth provided
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string;
    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;
    
    if (!walletAddress || !signature || !timestamp || !nonce) {
      return next();
    }

    const timestampNum = parseInt(timestamp);
    if (isNaN(timestampNum) || Date.now() - timestampNum > NONCE_EXPIRY_MS) {
      return next();
    }

    const message = `DeFi Credit Score Auth\nAddress: ${walletAddress}\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
    
    const isValid = verifyMessageSignatureRsv({
      message,
      publicKey: walletAddress,
      signature: signature,
    });

    if (isValid) {
      req.user = { walletAddress };
    }
    
    next();
  } catch (error) {
    next();
  }
};
