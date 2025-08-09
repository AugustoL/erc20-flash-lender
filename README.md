# ERC20 Flash Lender

⚠️ **DISCLAIMER: This is a personal/educational project that has NOT been professionally audited. Do NOT use with real funds on mainnet without a comprehensive security audit.**

A flash loan protocol for ERC20 tokens with proportional fee sharing among liquidity providers. Built using OpenZeppelin's battle-tested contracts with comprehensive precision attack protections and reviewed by AI systems, but requires professional audit before production use.

## Features

- 🚀 **Flash Loans**: Instant, uncollateralized loans for MEV operations
- 💰 **Fee Sharing**: Proportional fee distribution among liquidity providers
- 🗳️ **Democratic Governance**: LPs vote on fee rates with share-weighted voting
- ⏰ **Delayed Execution**: 10-block delay for governance decisions
- 🛡️ **Security First**: Comprehensive protection against precision attacks and common DeFi exploits
- ⚡ **Ultra-Low Fees**: Default 0.01% LP fee with 1% of it as management fee (as % of LP fee)
- 🔧 **Upgradeable**: Built with OpenZeppelin's upgradeable contracts
- 📊 **Share-Based**: Fair fee distribution using share-based accounting with virtual shares protection

## Return on Investment (ROI) Analysis

| Scenario | Min Fee ROI | Median Fee ROI | Max Fee ROI |
|----------|-------------|----------------|-------------|
| **1 loan/day** | 0.37% | 18.25% | 36.5% |
| **10 loans/day** | 1.83% | 91.25% | 182.5% |
| **100 loans/day** | 3.65% | 182.5% | 365% |

### Expected Annual Percentage Yield (APY) for Investors

The APY for liquidity providers depends on flash loan adoption and fee governance decisions:

**Conservative Estimate (1-5 loans/day, low fees)**: 1-10% APY
- Suitable for risk-averse investors seeking steady passive income
- Comparable to traditional DeFi lending protocols
- Lower volatility but modest returns

**Moderate Estimate (5-25 loans/day, median fees)**: 10-50% APY  
- Balanced risk/reward profile for typical DeFi participants
- Requires active governance participation for optimal fee setting
- Competitive with established DeFi yield farming strategies

**Aggressive Estimate (25+ loans/day, higher fees)**: 50-200%+ APY
- High-growth scenario with significant MEV/arbitrage adoption
- Requires active flash loan ecosystem and optimal fee governance
- Similar to early-stage DeFi protocols with high utilization

**Key Factors Affecting APY:**
- Flash loan volume and frequency
- LP fee rates (set by governance voting)
- Your percentage ownership of the pool
- Management fee percentage (1-5% of LP fees)
- Market demand for flash loans in the ecosystem
- Competition from other lending protocols

**Risk Considerations:**
- APY projections are hypothetical and not guaranteed
- Smart contract risks (unaudited code)
- Governance risks (fee rate decisions)
- Liquidity risks (withdrawal limitations)
- Market risks (ETH price volatility affects USD calculations)

**Notes:**
- Revenue is proportional to your share of the pool
- Fees are set by LP governance (democratic voting by share weight)
- Management fee (1-5% of LP fee) goes to protocol, rest to LPs
- Entry/exit fees (100 wei each) provide additional dust accumulation
- Virtual shares dilution affects small deposits more than large ones

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

## Contract Overview

### Core Functions

- `deposit(token, amount)` - Deposit tokens to earn fees
- `withdraw(token)` - Withdraw principal + accumulated fees  
- `flashLoan(token, amount, receiver, data)` - Execute flash loan

### Admin Functions

- `setManagementFee(percentage)` - Set management fee as % of LP fee (1-5%)
- `withdrawManagementFees(token)` - Withdraw collected fees

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
| Management Fee | 1% of LP fee | 1-5% of LP fee | Percentage of LP fee that goes to protocol owner (admin controlled) |
| Entry Fee | 100 wei (fixed) | Fixed | Paid on deposit, stays in pool as dust for precision protection |
| Exit Fee | 100 wei (fixed) | Fixed | Paid on withdrawal, stays in pool as dust for precision protection |

### Precision Protection Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| MINIMUM_DEPOSIT | 100M wei (1e8) | Makes dust attacks uneconomical |
| VIRTUAL_SHARES | 1000 | Dilutes small attackers' share manipulation attempts |
| ENTRY_EXIT_FEE | 100 wei | Fixed fees that accumulate as permanent dust |

### Fee Calculation Example
For a 1000 token flash loan with LP fee = 50 bps (0.5%) and management fee = 200 (2%):
- LP Fee: 5 tokens (0.5% of loan)
- Management Fee: 0.1 tokens (2% of LP fee = 2% × 5 = 0.1)  
- **Total Fee**: 5.1 tokens (0.51% of loan)
- **Total Repayment**: 1005.1 tokens

### Deposit/Withdrawal Fee Example
For a 1000 token deposit and subsequent withdrawal:
- **Deposit**: 1000 tokens → 999.9999 tokens net (100 wei entry fee stays in pool)
- **Shares**: Based on net deposit and current pool ratios with virtual shares dilution
- **Withdrawal**: User's proportional share minus 100 wei exit fee (which stays in pool)
- **Effect**: Fixed fees accumulate as permanent dust, making precision attacks unprofitable

## Flash Loan Executor Contracts

For advanced users who need to execute multiple operations within a single flash loan, the protocol includes specialized executor contracts that simplify complex flash loan workflows.

⚡ **GAS OPTIMIZATION**: The executor contracts are designed for maximum gas efficiency. Users are responsible for repaying flash loans directly to the lender in their operations, eliminating unnecessary token transfers and saving significant gas costs.

### ERC20FlashLoanExecuter

A reusable contract that can execute multiple operations within a single flash loan transaction.

**Key Features:**
- 📋 **Multi-Operation Support**: Execute multiple contract calls in sequence
- 🔒 **Owner-Controlled**: Only the owner can initiate flash loans and execute operations  
- 💰 **ETH Support**: Can handle operations that require ETH transfers
- 🔄 **Reusable**: Same executor can be used for multiple flash loans
- 🔍 **ERC165 Compliant**: Supports interface detection
- ⚡ **Gas Optimized**: Users handle repayment directly to save gas

**Functions:**
- `executeFlashLoan(token, amount, operations[])` - Execute flash loan with multiple operations
- `executeCall(target, data, value)` - Execute arbitrary calls as owner (post-flash loan)
- `getFlashLender()` - Get the lender address for direct repayment
- `supportsInterface(interfaceId)` - Check interface support

**Gas Optimization Details:**
The executor no longer handles flash loan repayment automatically. Instead, **users must include repayment in their operations** by transferring the required amount directly to the flash lender. This saves gas by eliminating an extra transfer step.

### ERC20FlashLoanExecuterFactory

A factory contract that creates and manages flash loan executors with a streamlined workflow.

**Key Features:**
- 🏭 **One-Transaction Creation**: Create executor and execute flash loan in single transaction
- 🔄 **Ownership Transfer**: Automatically transfers executor ownership to user after execution
- ⚡ **Gas Efficient**: Optimized deployment and execution pattern

**Functions:**
- `createAndExecuteFlashLoan(token, amount, operations[])` - Create executor and execute flash loan

### Operation Structure

Both contracts use a standardized `Operation` struct for defining actions:

```solidity
struct Operation {
    address target;     // Contract to call
    bytes data;         // Calldata for the operation  
    uint256 value;      // ETH value to send (if needed)
}
```

### Usage Example (Gas Optimized)

```solidity
// Using the factory for gas-optimized operations
ERC20FlashLoanExecuter.Operation[] memory operations = new ERC20FlashLoanExecuter.Operation[](3);

// 1. Perform arbitrage or other operations with borrowed tokens
operations[0] = ERC20FlashLoanExecuter.Operation({
    target: address(dexContract),
    data: abi.encodeWithSignature("swap(uint256,address)", flashAmount, tokenOut),
    value: 0
});

// 2. Convert profits back to borrowed token
operations[1] = ERC20FlashLoanExecuter.Operation({
    target: address(dexContract),
    data: abi.encodeWithSignature("swapBack(uint256,address)", profits, borrowedToken),
    value: 0
});

// 3. IMPORTANT: Repay flash loan directly to lender (saves gas!)
operations[2] = ERC20FlashLoanExecuter.Operation({
    target: address(someContract), // Contract that holds repayment tokens
    data: abi.encodeWithSignature(
        "transferTo(address,address,uint256)", 
        borrowedToken,
        flashLender,      // Send directly to lender - saves gas!
        totalOwed        // principal + fees
    ),
    value: 0
});

// Execute everything in one transaction
address executor = factory.createAndExecuteFlashLoan(token, amount, operations);

// The executor is now owned by msg.sender and can be reused
ERC20FlashLoanExecuter(executor).executeCall(target, data, value);
```

### Traditional vs Gas-Optimized Flow

**❌ Traditional (Inefficient) Flow:**
1. Lender → Executor (flash loan)
2. Executor → Operations (execute calls)
3. Operations → Executor (send repayment tokens)
4. **Executor → Lender (extra transfer!)** ← Gas waste

**✅ Gas-Optimized Flow:**
1. Lender → Executor (flash loan)  
2. Executor → Operations (execute calls)
3. **Operations → Lender (direct repayment)** ← Saves gas!

**Gas Savings:** Eliminates one token transfer, saving ~21,000+ gas per flash loan.

**Use Cases:**
- 🔄 **Arbitrage**: Multi-DEX arbitrage opportunities
- 💱 **Liquidations**: Complex liquidation workflows across protocols  
- 🏦 **Refinancing**: Moving positions between lending protocols
- ⚖️ **Rebalancing**: Portfolio rebalancing with temporary liquidity
- 🔧 **Protocol Interactions**: Complex DeFi operations requiring temporary capital

## Usage Examples

### For Liquidity Providers

```solidity
// Note: All deposits must be >= 100M wei (MINIMUM_DEPOSIT)
// Entry fee of 100 wei is automatically deducted and stays in pool

// Approve tokens (remember to include entry fee)
IERC20(token).approve(lender, amount);

// Deposit to earn fees (minimum 100M wei)
lender.deposit(token, amount);

// Vote on LP fee (share-weighted governance)
lender.voteForLPFee(token, 25); // Vote for 0.25% fee

// Propose fee change if you have enough support
lender.proposeLPFeeChange(token, 25); // Propose 0.25% fee

// Execute fee change after 10-block delay
lender.executeLPFeeChange(token, 25); // Execute approved change

// Check earnings (includes virtual shares dilution effects)
(uint256 netAmount, uint256 grossAmount, uint256 principal, uint256 fees, uint256 exitFee) = 
    lender.getWithdrawableAmount(token, msg.sender);

// Withdraw everything (100 wei exit fee stays in pool)
// Note: Withdrawal may be rejected if net amount < MINIMUM_DEPOSIT after exit fee
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
│   ├── deposit() - Add tokens to pool (min 100M wei, 100 wei entry fee)
│   ├── withdraw() - Remove tokens + fees (100 wei exit fee, min threshold check)
│   ├── Share-based accounting with virtual shares (1000 virtual shares)
│   └── Precision attack protections
├── Flash Loans
│   ├── flashLoan() - Execute loan
│   ├── Interface validation
│   ├── Fee collection with precision fixes
│   └── Minimum fee enforcement for large loans
├── LP Governance
│   ├── voteForLPFee() - Share-weighted voting (including virtual shares)
│   ├── proposeLPFeeChange() - Democratic proposals
│   └── executeLPFeeChange() - Delayed execution
├── Administration
│   ├── Management fee control (1-5% of LP fee)
│   ├── Emergency controls
│   └── Owner functions (limited scope)
└── Security Layer
    ├── Virtual shares dilution (VIRTUAL_SHARES = 1000)
    ├── Minimum deposit enforcement (MINIMUM_DEPOSIT = 1e8)
    ├── Fixed fee dust accumulation (ENTRY_EXIT_FEE = 100 wei)
    └── Withdrawal validation and thresholds
```

## ⚠️ Security Considerations

### 🚨 CRITICAL: Audit Status

**THIS CONTRACT HAS NOT BEEN PROFESSIONALLY AUDITED**

- ❌ **No professional security audit performed**
- ✅ **AI-assisted code review completed**
- ✅ **Built on OpenZeppelin's audited contracts**
- ✅ **Comprehensive test suite (48 passing tests)**
- ✅ **Security best practices implemented**
- ✅ **Precision attack protections implemented**

**DO NOT USE WITH REAL FUNDS ON MAINNET WITHOUT A PROFESSIONAL AUDIT**

### Risk Factors

- **Unaudited code risk** - Primary concern
- Smart contract risk
- Admin key risk (limited to management fees only)  
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
