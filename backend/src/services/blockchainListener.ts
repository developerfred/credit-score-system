import { PrismaClient } from '@prisma/client';
import { connectWebSocketClient } from '@stacks/blockchain-api-client';

export class BlockchainListener {
  private prisma: PrismaClient;
  private client: any;
  private isRunning: boolean = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async start() {
    if (this.isRunning) return;
    
    console.log('🔗 Starting blockchain listener...');
    
    try {
      this.client = await connectWebSocketClient(
        process.env.STACKS_API_WS_URL || 'wss://api.testnet.hiro.so'
      );

      // Subscribe to contract events
      const contracts = [
        process.env.CREDIT_SCORE_CONTRACT || 'credit-score',
        process.env.LOAN_MANAGER_CONTRACT || 'loan-manager',
        process.env.AGENT_REGISTRY_CONTRACT || 'agent-registry',
        process.env.TRANSACTION_HISTORY_CONTRACT || 'transaction-history',
      ];

      for (const contract of contracts) {
        await this.client.subscribeAddressTransactions(contract, (tx: any) => {
          this.handleTransaction(tx);
        });
      }

      this.isRunning = true;
      console.log('✅ Blockchain listener started');
    } catch (error) {
      console.error('❌ Failed to start blockchain listener:', error);
    }
  }

  stop() {
    if (this.client) {
      this.client.close();
      this.isRunning = false;
      console.log('⏹️ Blockchain listener stopped');
    }
  }

  private async handleTransaction(tx: any) {
    console.log('📥 Received transaction:', tx.tx_id);

    try {
      // Store raw event for processing
      await this.prisma.blockchainEvent.create({
        data: {
          txId: tx.tx_id,
          contractId: tx.contract_call?.contract_id || '',
          eventType: tx.contract_call?.function_name || 'unknown',
          payload: tx,
          blockHeight: tx.block_height,
          processed: false,
        },
      });

      // Process event immediately
      await this.processEvent(tx);
    } catch (error) {
      console.error('❌ Error handling transaction:', error);
    }
  }

  private async processEvent(tx: any) {
    const functionName = tx.contract_call?.function_name;
    const args = tx.contract_call?.function_args || [];

    switch (functionName) {
      case 'initialize-user-score':
        await this.handleInitializeUserScore(tx.sender_address);
        break;
      case 'update-credit-score':
        await this.handleUpdateCreditScore(args);
        break;
      case 'request-loan':
        await this.handleRequestLoan(tx.sender_address, args);
        break;
      case 'fund-loan':
        await this.handleFundLoan(args);
        break;
      case 'repay-loan':
        await this.handleRepayLoan(args);
        break;
      case 'register-agent':
        await this.handleRegisterAgent(tx.sender_address, args);
        break;
      case 'record-transaction':
        await this.handleRecordTransaction(args);
        break;
    }
  }

  private async handleInitializeUserScore(address: string) {
    const user = await this.prisma.user.upsert({
      where: { walletAddress: address },
      update: {},
      create: {
        walletAddress: address,
      },
    });

    await this.prisma.creditScore.create({
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

    console.log(`✅ Initialized credit score for ${address}`);
  }

  private async handleUpdateCreditScore(args: any[]) {
    const userAddress = args[0]?.repr;
    const newScore = parseInt(args[1]?.repr);

    const user = await this.prisma.user.findUnique({
      where: { walletAddress: userAddress },
    });

    if (user) {
      const currentScore = await this.prisma.creditScore.findFirst({
        where: { userId: user.id },
        orderBy: { lastUpdated: 'desc' },
      });

      const history = currentScore 
        ? [...JSON.parse(currentScore.history as string), { score: newScore, timestamp: new Date() }]
        : [{ score: newScore, timestamp: new Date() }];

      await this.prisma.creditScore.create({
        data: {
          userId: user.id,
          score: newScore,
          tier: this.calculateTier(newScore),
          history: JSON.stringify(history),
          factors: currentScore?.factors || JSON.stringify({}),
        },
      });

      console.log(`✅ Updated credit score for ${userAddress} to ${newScore}`);
    }
  }

  private async handleRequestLoan(address: string, args: any[]) {
    const amount = args[0]?.repr;
    const duration = parseInt(args[1]?.repr);

    const user = await this.prisma.user.findUnique({
      where: { walletAddress: address },
    });

    if (user) {
      await this.prisma.loan.create({
        data: {
          userId: user.id,
          loanId: 0, // Will be updated when we get the actual ID
          amount: amount,
          interestRate: 0,
          collateral: '0',
          duration,
          status: 'pending',
        },
      });

      console.log(`✅ Created loan request for ${address}`);
    }
  }

  private async handleFundLoan(args: any[]) {
    const loanId = parseInt(args[0]?.repr);
    
    await this.prisma.loan.update({
      where: { loanId },
      data: {
        status: 'active',
        startBlock: 0,
      },
    });

    console.log(`✅ Funded loan ${loanId}`);
  }

  private async handleRepayLoan(args: any[]) {
    const loanId = parseInt(args[0]?.repr);
    const amount = args[1]?.repr;

    const loan = await this.prisma.loan.findUnique({
      where: { loanId },
    });

    if (loan) {
      const newRepaidAmount = parseFloat(loan.repaidAmount.toString()) + parseFloat(amount);
      
      await this.prisma.loan.update({
        where: { loanId },
        data: {
          repaidAmount: newRepaidAmount.toString(),
          status: newRepaidAmount >= parseFloat(loan.amount.toString()) ? 'repaid' : loan.status,
        },
      });

      console.log(`✅ Repaid ${amount} for loan ${loanId}`);
    }
  }

  private async handleRegisterAgent(address: string, args: any[]) {
    const name = args[0]?.repr;
    const description = args[1]?.repr;
    const capabilities = args[2]?.repr || [];
    const endpoint = args[3]?.repr;

    await this.prisma.agent.upsert({
      where: { agentId: address },
      update: {
        name,
        description,
        capabilities,
        endpoint,
      },
      create: {
        agentId: address,
        name,
        description,
        capabilities,
        endpoint,
        isActive: true,
      },
    });

    console.log(`✅ Registered agent ${name} (${address})`);
  }

  private async handleRecordTransaction(args: any[]) {
    const userAddress = args[0]?.repr;
    const txType = args[1]?.repr;
    const amount = args[2]?.repr;
    const protocol = args[4]?.repr;
    const txId = args[6]?.repr;

    const user = await this.prisma.user.findUnique({
      where: { walletAddress: userAddress },
    });

    if (user) {
      await this.prisma.transaction.create({
        data: {
          userId: user.id,
          txId,
          txType,
          amount,
          protocol,
          blockHeight: 0,
          timestamp: new Date(),
        },
      });

      console.log(`✅ Recorded transaction for ${userAddress}`);
    }
  }

  private calculateTier(score: number): string {
    if (score >= 800) return 'excellent';
    if (score >= 700) return 'good';
    if (score >= 600) return 'fair';
    if (score >= 500) return 'poor';
    return 'very_poor';
  }
}
