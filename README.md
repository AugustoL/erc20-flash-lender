# ERC20 Flash Lender

⚠️ **DISCLAIMER: This is a personal/educational project that has NOT been professionally audited. Do NOT use with real funds on mainnet without a comprehensive security audit.**

A flash loan protocol for ERC20 tokens with proportional fee sharing among liquidity providers. Built using OpenZeppelin's battle-tested contracts and reviewed by AI systems, but requires professional audit before production use.

## Features

- 🚀 **Flash Loans**: Instant, uncollateralized loans for MEV operations
- 💰 **Fee Sharing**: Proportional fee distribution among liquidity providers
- 🛡️ **Security First**: Comprehensive protection against common DeFi attacks
- ⚡ **Ultra-Low Fees**: Default 0.01% LP fee with 1% of it as management fee (as % of LP fee)
- 🔧 **Upgradeable**: Built with OpenZeppelin's upgradeable contracts
- 📊 **Share-Based**: Fair fee distribution using share-based accounting

## Security Features

- ✅ Reentrancy protection
- ✅ Share dilution attack prevention  
- ✅ Arithmetic underflow/overflow protection
- ✅ Interface compliance checking
- ✅ Minimum deposit requirements
- ✅ Fee caps and validation

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

## Contract Overview

### Core Functions

- `deposit(token, amount)` - Deposit tokens to earn fees
- `withdraw(token)` - Withdraw principal + accumulated fees  
- `flashLoan(token, amount, receiver, data)` - Execute flash loan

### Admin Functions

- `setLPFee(token, bps)` - Set LP fee for specific token (0-100 bps)
- `setManagementFee(percentage)` - Set management fee as % of LP fee (1-5%)
- `withdrawManagementFees(token)` - Withdraw collected fees

### View Functions

- `getWithdrawableAmount(token, user)` - Preview withdrawal amount
- `getEffectiveLPFee(token)` - Get current LP fee rate

## Fee Structure

| Fee Type | Default Rate | Range | Description |
|----------|--------------|-------|-------------|
| LP Fee | 0.01% (1 bps) | 0-1% (0-100 bps) | Goes to liquidity providers |
| Management Fee | 1% of LP fee | 1-5% of LP fee | Percentage of LP fee that goes to protocol owner |

### Fee Calculation Example
For a 1000 token flash loan with LP fee = 50 bps (0.5%) and management fee = 200 (2%):
- LP Fee: 5 tokens (0.5% of loan)
- Management Fee: 0.1 tokens (2% of LP fee = 2% × 5 = 0.1)  
- **Total Fee**: 5.1 tokens (0.51% of loan)
- **Total Repayment**: 1005.1 tokens

## Usage Examples

### For Liquidity Providers

```solidity
// Approve tokens
IERC20(token).approve(lender, amount);

// Deposit to earn fees
lender.deposit(token, amount);

// Check earnings
(uint256 total, uint256 principal, uint256 fees) = 
    lender.getWithdrawableAmount(token, msg.sender);

// Withdraw everything
lender.withdraw(token);
```

### For Flash Loan Borrowers

```solidity
contract MyFlashLoanReceiver is IFlashLoanReceiver {
    function executeOperation(
        address token,
        uint256 amount, 
        uint256 totalOwed,
        bytes calldata data
    ) external override returns (bool) {
        // Your arbitrage/liquidation logic here
        
        // Ensure you have enough tokens to repay
        IERC20(token).approve(msg.sender, totalOwed);
        return true;
    }
}

// Execute flash loan
bytes memory data = abi.encode(someParams);
lender.flashLoan(token, amount, receiver, data);
```

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

# Deployment
npm run node           # Start local node
npm run deploy:localhost  # Deploy locally
npm run deploy:sepolia    # Deploy to Sepolia
npm run deploy:mainnet    # Deploy to Mainnet

# Verification
npm run verify:sepolia    # Verify on Sepolia
npm run verify:mainnet    # Verify on Mainnet
```

## Architecture

```
ERC20FlashLender
├── Liquidity Management
│   ├── deposit() - Add tokens to pool
│   ├── withdraw() - Remove tokens + fees  
│   └── Share-based accounting
├── Flash Loans
│   ├── flashLoan() - Execute loan
│   ├── Interface validation
│   └── Fee collection
└── Administration
    ├── Fee management
    ├── Emergency controls
    └── Owner functions
```

## ⚠️ Security Considerations

### 🚨 CRITICAL: Audit Status

**THIS CONTRACT HAS NOT BEEN PROFESSIONALLY AUDITED**

- ❌ **No professional security audit performed**
- ✅ **AI-assisted code review completed**
- ✅ **Built on OpenZeppelin's audited contracts**
- ✅ **Comprehensive test suite (24 passing tests)**
- ✅ **Security best practices implemented**

**DO NOT USE WITH REAL FUNDS ON MAINNET WITHOUT A PROFESSIONAL AUDIT**

### Risk Factors

- **Unaudited code risk** - Primary concern
- Smart contract risk
- Admin key risk  
- Liquidity risk
- Oracle dependencies (if added)

### Best Practices

- Use multisig for owner account
- Implement time locks for admin functions
- Monitor for unusual activity
- Keep emergency procedures ready

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
