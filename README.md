# ERC20 Flash Lender

⚠️ **DISCLAIMER: This is a personal/educational project that has NOT been professionally audited. Do NOT use with real funds on mainnet without a comprehensive security audit.**

A flash loan protocol for ERC20 tokens with proportional fee sharing among liquidity providers. Built using OpenZeppelin's battle-tested contracts with comprehensive precision attack protections and reviewed by AI systems, but requires professional audit before production use.

## Features

- 🚀 **Flash Loans**: Instant, uncollateralized loans for MEV operations
- 🎯 **Multi-Token Flash Loans**: Borrow multiple tokens simultaneously in a single transaction
- 💰 **Fee Sharing**: Proportional fee distribution among liquidity providers
- 🆕 **Fee Harvesting**: Withdraw earned fees while keeping principal staked for compound growth
- 🗳️ **Democratic Governance**: LPs vote on fee rates with share-weighted voting
- ⏰ **Delayed Execution**: 10-block delay for governance decisions
- 🛡️ **Security First**: Comprehensive protection against precision attacks and common DeFi exploits
- ⚡ **Ultra-Low Fees**: Default 0.01% LP fee with 1% of it as management fee (as % of LP fee)
- � **Emergency Pause (Withdraw-Only)**: Owner can enable withdraw-only mode during incidents
- ⛔ **Non-Upgradeable**: Fixed implementation; migrations happen via pause → withdraw → redeploy
- 📊 **Share-Based**: Fair fee distribution using share-based accounting with virtual shares protection
- 🔄 **Advanced Executors**: Gas-optimized executor contracts for complex multi-step operations

## Return on Investment (ROI)

Potential APY ranges from 1-10% (conservative) to 50-200%+ (high utilization) depending on flash loan adoption and fee governance.

📊 **[View Detailed ROI Analysis](docs/ROI-Analysis.md)**

## Security Features

### Precision Attack Protections
- ✅ **Virtual Shares**: A minimal amount of virtual shares minted to owner on first deposit to prevent share manipulation
- ✅ **Minimum Deposit**: 100M wei (1e8) minimum deposit requirement to make dust attacks uneconomical
- ✅ **Fixed Entry/Exit Fees**: 100 wei fixed fees (not percentage-based) that accumulate as permanent dust
- ✅ **Minimum Withdrawal**: Rejects withdrawals below minimum threshold after exit fees
- ✅ **Precision Loss Prevention**: Direct fee calculation without nested division to prevent rounding manipulation

### Standard DeFi Protections
- ✅ Reentrancy protection
- ✅ Share dilution attack prevention  
- ✅ Arithmetic underflow/overflow protection
- ✅ Interface compliance checking
- ✅ Fee caps and validation
- ✅ Share-weighted governance voting
- ✅ Time-delayed execution system
- ✅ Proposal validation and cleanup

## Quick Start

### Installation

```bash
npm install
```

### Compilation

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm run test

# Run with gas reporting
npm run test:gas

# Run with coverage
npm run test:coverage
```

### Deployment

```bash
# Local deployment
npm run deploy:localhost

# Testnet deployment
npm run deploy:sepolia

# Mainnet deployment
npm run deploy:mainnet
```

## Contracts Overview

### Core Functions

- `deposit(token, amount)` - Deposit tokens to earn fees
- `withdraw(token)` - Withdraw principal + accumulated fees  
- `withdrawFees(token)` - Withdraw only fees while keeping principal staked
- `flashLoan(token, amount, receiver, data)` - Execute single-token flash loan
- `flashLoanMultiple(tokens[], amounts[], receiver, data)` - Execute multi-token flash loan

### Admin Functions

- `setManagementFee(percentage)` - Set management fee as % of LP fee (1-5%)
- `withdrawManagementFees(token)` - Withdraw collected fees
- `emergencyPause()` - Toggle emergency pause (withdraw-only mode)

### LP Governance Functions

- `voteForLPFee(token, feeAmountBps)` - Vote for LP fee amount (share-weighted)
- `proposeLPFeeChange(token, newFeeBps)` - Propose fee change based on governance
- `executeLPFeeChange(token, newFeeBps)` - Execute approved fee change after delay

### View Functions

- `getWithdrawableAmount(token, user)` - Preview withdrawal amount
- `getEffectiveLPFee(token)` - Get current LP fee rate

## Fee Structure

| Fee Type | Default Rate | Range | Description |
|----------|--------------|-------|-------------|
| LP Fee | 0.01% (1 bps) | 0-1% (0-100 bps) | Goes to liquidity providers (set by LP governance) |
| Management Fee | 1% of LP fee | 1-5% of LP fee | Percentage of LP fee that goes to protocol owner |
| Entry/Exit Fee | 100 wei (fixed) | Fixed | Precision attack protection |

📊 **[View Usage Examples](docs/Usage-Examples.md)**

## Advanced Features

- 🔧 **Flash Loan Executors**: Gas-optimized contracts for multi-operation flash loans
- 🚀 **Multi-Token Flash Loans**: Borrow multiple tokens simultaneously (see contract docs)
- 💰 **Fee Harvesting**: Withdraw earned fees while keeping principal staked (see contract docs)

📖 **[Flash Loan Executors Guide](docs/contracts/FlashLoanExecutor.md)** | **[ERC20FlashLender Contract](docs/contracts/ERC20FlashLender.md)**




## Development

### Environment Setup

1. Copy `.env.example` to `.env`
2. Fill in your private keys and RPC URLs
3. Install dependencies: `npm install`

### Available Scripts

```bash
# Development
npm run build          # Compile contracts
npm run clean          # Clean artifacts
npm run typechain      # Generate TypeScript bindings

# Testing  
npm run test           # Run tests
npm run test:coverage  # Coverage report
npm run test:gas       # Gas usage report

# Code Quality
npm run lint           # Lint Solidity code
npm run format         # Format all code

# Local Development Environment
npm run node           # Start local Hardhat node
npm run deploy:dev     # Deploy with test tokens & setup (localhost)

# Production Deployment
npm run deploy:localhost  # Deploy to localhost
npm run deploy:sepolia    # Deploy to Sepolia
npm run deploy:mainnet    # Deploy to Mainnet

# Verification
npm run verify:sepolia    # Verify on Sepolia
npm run verify:mainnet    # Verify on Mainnet
```

### Development Environment Setup

The project provides three development scripts for different workflows:

#### Option 1: Full Development Environment (Recommended)
```bash
npm run dev
```
Runs the complete development stack - compiles contracts, starts Hardhat node, deploys contracts, and launches the React app.

#### Option 2: App Development Only
```bash
npm run dev:app
```
Starts only the React development server. Use this when developing frontend features with the GitHub Pages deployed contracts.

#### Option 3: Local Node Only
```bash
npm run dev:node
```
Starts only the Hardhat node with deployed contracts. Use this to connect the GitHub Pages app to your local blockchain for testing.

The full development script (`npm run dev`) will:

- 🏦 Deploy the ERC20FlashLender contract
- 🪙 Deploy 4 test tokens (TUSDC, TDAI, TWETH, TWBTC) with different decimals
- 👥 Set up 4 test accounts with token balances
- 💰 Make initial deposits to get the pools started
- 📄 Save deployment info to `deployment-dev.json`
- 🔧 Provide ready-to-use contract interaction snippets

**Test Tokens Deployed:**
- TUSDC (6 decimals): Test USDC - 1B supply
- TDAI (18 decimals): Test DAI - 1B supply  
- TWETH (18 decimals): Test WETH - 100K supply
- TWBTC (8 decimals): Test WBTC - 21K supply

**Test Accounts Setup:**
- Deployer: Contract owner with all permissions
- User1, User2, User3: Each gets 10K of every test token

This setup provides a complete local testing environment with realistic token scenarios and pre-funded accounts for immediate testing of flash loans, deposits, withdrawals, and governance features.

## React DApp Frontend

The project includes a comprehensive React-based decentralized application (DApp) that provides a user-friendly interface for interacting with the ERC20 Flash Lender protocol.

### ✨ DApp Features

- 🎨 **Modern UI/UX**: Built with React 18 and modern design patterns
- 🌐 **Web3 Integration**: Seamless wallet connection via RainbowKit and Wagmi
- 📊 **Real-time Dashboard**: Live pool statistics, user positions, and earnings tracking
- 💰 **Pool Management**: Deposit, withdraw, and harvest fees with intuitive controls
- 🗳️ **Governance Interface**: Vote on fee rates and propose changes through the UI
- 📈 **Activity Tracking**: Comprehensive transaction history and analytics
- 🌙 **Theme Support**: Light/dark mode with user preferences
- ⚡ **Performance Optimized**: Lazy loading, memoization, and code splitting
- 🛡️ **Error Boundaries**: Graceful error handling with fallback UI
- 🔒 **Web3 Security**: Built-in provider validation and secure transaction handling
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices

### 🚀 Quick Start (Frontend)

```bash
# Option 1: Full development environment (recommended)
npm run dev

# Option 2: Frontend development only (uses GitHub Pages contracts)
npm run dev:app

# Option 3: Build for production
cd app && npm run build
```

### 📁 DApp Architecture

```
app/
├── src/
│   ├── components/           # React components
│   │   ├── common/          # Reusable UI components
│   │   └── pages/           # Page-level components
│   ├── context/             # React context providers
│   ├── hooks/               # Custom React hooks
│   ├── services/            # Data services and API layers
│   ├── utils/               # Utility functions and constants
│   └── types/               # TypeScript type definitions
├── public/                  # Static assets
└── package.json            # Dependencies and scripts
```

### 🔧 Configuration

The DApp automatically detects your network and connects to the appropriate contracts. 

**For full local development:**
```bash
npm run dev  # All-in-one: compile, deploy, and start app
```

**For frontend-only development:**
```bash
npm run dev:app  # Uses GitHub Pages deployed contracts
```

**For testing GitHub Pages app with local blockchain:**
```bash
npm run dev:node  # Start local node, then use GitHub Pages app
```

Connect MetaMask to localhost:8545 when using local development options.

### 📖 DApp Documentation

For detailed frontend documentation, component guides, and development setup, see [app/README.md](app/README.md).

### 🔒 Frontend Provider Policy

This DApp is wallet-only by design:
- No hosted/public RPCs are used for reads or writes.
- A user wallet provider (e.g., MetaMask via window.ethereum) is required to load data and interact.
- Server-side rendering is disabled to avoid any backend RPC dependencies.
- If no wallet is connected, the UI will show a connect-wallet prompt and will not perform chain queries until connected.

## Architecture

```
ERC20FlashLender
├── Liquidity Management
│   ├── deposit() - Add tokens to pool (min 100M wei, 100 wei entry fee)
│   ├── withdraw() - Remove tokens + fees (100 wei exit fee, min threshold check)
│   ├── Share-based accounting with virtual shares (1000 virtual shares)
│   └── Precision attack protections
├── Flash Loans
│   ├── flashLoan() - Execute single-token loan
│   ├── flashLoanMultiple() - Execute multi-token loan (up to 20 tokens)
│   ├── Interface validation (IFlashLoanReceiver & IMultiFlashLoanReceiver)
│   ├── Fee collection with precision fixes
│   ├── Duplicate token detection
│   └── Minimum fee enforcement for large loans
├── LP Governance
│   ├── voteForLPFee() - Share-weighted voting (including virtual shares)
│   ├── proposeLPFeeChange() - Democratic proposals
│   └── executeLPFeeChange() - Delayed execution
├── Administration
│   ├── Management fee control (1-5% of LP fee)
│   ├── Emergency pause (withdraw-only mode)
│   └── Owner functions (limited scope)
└── Security Layer
    ├── Virtual shares dilution (VIRTUAL_SHARES = 1000)
    ├── Minimum deposit enforcement (MINIMUM_DEPOSIT = 1e8)
    ├── Fixed fee dust accumulation (ENTRY_EXIT_FEE = 100 wei)
    ├── Multi-token validation and gas limits
    └── Withdrawal validation and thresholds
```

## ⚠️ Security Considerations

### 🚨 CRITICAL: Audit Status

**THIS CONTRACT HAS NOT BEEN PROFESSIONALLY AUDITED**

- ❌ **No professional security audit performed**
- ✅ **AI-assisted code review completed**
- ✅ **Built on OpenZeppelin's audited contracts**
- ✅ **Comprehensive test suite (75+ passing tests)**
- ✅ **Security best practices implemented**
- ✅ **Precision attack protections implemented**

**DO NOT USE WITH REAL FUNDS ON MAINNET WITHOUT A PROFESSIONAL AUDIT**

### Risk Factors

- **Unaudited code risk** - Primary concern
- Smart contract risk
- Admin key risk (management fees and pause authority)  
- Liquidity risk
- Governance manipulation risk (voting power concentration)
- Time delay risks (governance proposals can be front-run)
- Oracle dependencies (if added)

### Precision Attack Mitigations

This protocol implements comprehensive protections against precision-based attacks:

1. **Virtual Shares (1000)**: Automatically minted to owner on first deposit
   - Dilutes small attackers' ability to manipulate share calculations
   - Makes it impossible to achieve meaningful ownership with dust amounts

2. **Minimum Deposit (100M wei)**: Enforced on all deposits
   - Makes dust attacks economically unviable
   - Ensures meaningful stake for all participants

3. **Fixed Entry/Exit Fees (100 wei each)**: 
   - Not percentage-based, creates permanent dust accumulation
   - Reduces profitability of repeated small operations
   - Acts as economic deterrent for precision attacks

4. **Minimum Withdrawal Validation**:
   - Rejects withdrawals below minimum threshold after exit fees
   - Prevents dust withdrawals that could be used for manipulation

5. **Precision-Safe Fee Calculations**:
   - Direct multiplication instead of nested division
   - Prevents rounding manipulation in fee calculations

These protections work together to make precision attacks both technically difficult and economically unviable.

### Best Practices

- Use multisig for owner/pauser accounts
- Implement time locks for configuration changes where feasible (pause remains immediate)
- Monitor for unusual activity
- Keep emergency procedures ready

## 🛑 Emergency Pause & Incident Runbook

The protocol is non-upgradeable and includes an emergency pause that switches the system to withdraw-only mode to protect users during incidents.

What the pause does:
- Disables: `deposit`, `flashLoan`, `flashLoanMultiple`, `withdrawFees`, governance actions (`voteForLPFee`, `proposeLPFeeChange`, `executeLPFeeChange`).
- Allows: `withdraw` of principal + accumulated fees, read-only views, owner `withdrawManagementFees` (optional policy to pause this, but current implementation allows owner-only).

Who can pause:
- The contract owner (strongly recommended to be a multisig). Function: `emergencyPause()` toggles the state.

How to verify pause state:
- Call `paused()` on the lender contract; `true` means withdraw-only mode is active.

Suggested incident flow:
1) Detect anomaly → call `emergencyPause()` to enable withdraw-only mode.
2) Communicate status and guidance to LPs (withdraw if necessary).
3) Diagnose and decide whether to unpause or migrate.
4) For migrations: keep paused, deploy a new version, publish addresses, guide users to withdraw from old and deposit into new.
5) Unpause only when risk is cleared or migration is complete.

## Gas Optimization

- Efficient share-based accounting
- Minimal storage operations
- Optimized compiler settings
- Gas reporter integration

## License

GPL-3.0-or-later License - see [LICENSE](LICENSE) file for details.

⚠️ **This software is provided "as is" without warranty. Use at your own risk.**

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request
