# DeFi Credit Score System

A decentralized platform that uses blockchain to create a transparent and immutable credit score system for users in Latin America. Leveraging smart contracts on Stacks, it allows users to securely share their transaction history to build a credit score that can be used for loans and financial services within the DeFi ecosystem.

## Features

- **Credit Scoring**: On-chain credit scores (0-1000) based on DeFi activity
- **DeFi Loans**: Access loans based on your credit tier with dynamic interest rates
- **Agent Registry**: Connect with AI agents for automated financial services (SIP-xxx / ERC-8004)
- **Transaction History**: Track and analyze your DeFi interactions
- **Transparent**: All calculations and updates are verifiable on-chain

## Architecture

### Smart Contracts (Clarity)

1. **credit-score.clar** - Core credit scoring logic
2. **loan-manager.clar** - Loan issuance and management
3. **agent-registry.clar** - Agent Registry (SIP-xxx / ERC-8004)
4. **transaction-history.clar** - Transaction tracking

### Frontend (Next.js + React)

Modern React app with Stacks Connect integration, dark theme with glassmorphism design

### Backend (Node.js + Express)

RESTful API with PostgreSQL database, blockchain event indexing, webhook handling

## Quick Start

```bash
# Install dependencies
npm install
cd frontend && npm install
cd ../backend && npm install

# Setup database
cd backend && npx prisma migrate dev

# Run development servers
npm run dev          # Frontend
npm run dev:backend  # Backend
```

## Smart Contract Usage

```clarity
;; Initialize credit score
(contract-call? .credit-score initialize-user-score)

;; Request a loan
(contract-call? .loan-manager request-loan u5000000000 u12960 u500000000)

;; Register an agent
(contract-call? .agent-registry register-agent "My Agent" "Description" (list "capability") "https://endpoint.com")
```

## References

- [SIP-xxx Agent Registry](https://forum.stacks.org/t/sip-xxx-agent-registries-erc-8004-on-stacks/18651)
- [Stacks Blockchain](https://www.stacks.co/)
- [Clarity Language](https://clarity-lang.org/)

---

Built with ❤️ for Latin America 🌎


