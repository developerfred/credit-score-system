import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import userRoutes from './routes/users';
import creditScoreRoutes from './routes/creditScores';
import loanRoutes from './routes/loans';
import agentRoutes from './routes/agents';
import transactionRoutes from './routes/transactions';
import webhookRoutes from './routes/webhooks';
import { errorHandler } from './middleware/errorHandler';
import { BlockchainListener } from './services/blockchainListener';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

const corsOptions = {
  origin: NODE_ENV === 'production' 
    ? process.env.FRONTEND_URL 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-wallet-address', 'x-signature', 'x-timestamp', 'x-nonce'],
};

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again later',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') / 1000),
  },
});

const createLoanLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many loan requests from this IP, please try again later',
    retryAfter: 3600,
  },
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.testnet.hiro.so", "https://api.hiro.so"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(cors(corsOptions));
app.use(apiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/loans', createLoanLimiter);

app.use('/api/users', userRoutes);
app.use('/api/credit-scores', creditScoreRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/webhooks', webhookRoutes);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

app.get('/api', (req, res) => {
  res.json({
    name: 'DeFi Credit Score API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

app.use(errorHandler);

const blockchainListener = new BlockchainListener(prisma);
blockchainListener.start();

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API available at http://localhost:${PORT}/api`);
  console.log(`🔒 Environment: ${NODE_ENV}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  blockchainListener.stop();
  process.exit(0);
});

export { prisma };
