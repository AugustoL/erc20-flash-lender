# ERC20FlashLender Contract

The main flash loan protocol contract that enables instant, uncollateralized loans for MEV operations, arbitrage, and liquidations.

## ⚠️ Security Warning

**THIS CONTRACT HAS NOT BEEN PROFESSIONALLY AUDITED**

- ❌ **No professional security audit performed**
- ✅ **AI-assisted code review completed**
- ✅ **Built on OpenZeppelin's audited contracts**
- ✅ **Comprehensive test suite (75+ passing tests)**
- ✅ **Security best practices implemented**

**DO NOT USE WITH REAL FUNDS ON MAINNET WITHOUT A PROFESSIONAL AUDIT**

## Overview

ERC20FlashLender is a decentralized flash loan protocol that uses a share-based system to distribute fees proportionally among liquidity providers. The contract implements comprehensive security measures against common DeFi attacks.

## Key Features

- 🚀 **Flash Loans**: Instant, uncollateralized loans for MEV operations
- 🎯 **Multi-Token Flash Loans**: Borrow multiple tokens simultaneously
- 💰 **Fee Sharing**: Proportional fee distribution among liquidity providers
- 🆕 **Fee Harvesting**: Withdraw earned fees while keeping principal staked
- 🗳️ **Democratic Governance**: LPs vote on fee rates with share-weighted voting
- ⏰ **Delayed Execution**: 10-block delay for governance decisions
- 🛡️ **Security First**: Comprehensive protection against precision attacks
- 🔧 **Upgradeable**: Built with OpenZeppelin's upgradeable contracts

## Core Functions

### Liquidity Provider Functions

#### `deposit(address token, uint256 amount)`
Deposit tokens to earn fees from flash loans.

**Parameters:**
- `token`: Address of the ERC20 token to deposit
- `amount`: Amount of tokens to deposit (minimum 100M wei)

**Requirements:**
- Amount must be >= MINIMUM_DEPOSIT (100M wei)
- Automatically deducts 100 wei entry fee
- Mints shares proportional to deposit

#### `withdraw(address token)`
Withdraw all deposited tokens plus accumulated fees.

**Parameters:**
- `token`: Address of the token to withdraw

**Behavior:**
- Withdraws user's proportional share of the pool
- Deducts 100 wei exit fee (stays in pool)
- Burns user's shares
- May be rejected if net amount < MINIMUM_DEPOSIT after fees

#### `withdrawFees(address token)`
Withdraw only earned fees while keeping principal staked.

**Parameters:**
- `token`: Address of the token to withdraw fees from

**Behavior:**
- Calculates earned fees using same logic as `getWithdrawableAmount()`
- Applies 100 wei exit fee to fee portion only
- Reduces shares proportionally to maintain pool economics
- Keeps principal deposit unchanged
- Updates governance voting power
- Requires minimum fee withdrawal of MINIMUM_DEPOSIT / 100

### Flash Loan Functions

#### `flashLoan(address token, uint256 amount, address receiver, bytes data)`
Execute a single-token flash loan.

**Parameters:**
- `token`: Address of the token to borrow
- `amount`: Amount of tokens to borrow
- `receiver`: Contract that will receive the tokens and execute logic
- `data`: Arbitrary data passed to the receiver

**Requirements:**
- Receiver must implement `IFlashLoanReceiver`
- Sufficient liquidity must be available
- Receiver must approve repayment of `amount + fees`

#### `flashLoanMultiple(address[] tokens, uint256[] amounts, address receiver, bytes data)`
Execute a multi-token flash loan.

**Parameters:**
- `tokens`: Array of token addresses to borrow
- `amounts`: Array of amounts to borrow (matches tokens array)
- `receiver`: Contract that will receive the tokens
- `data`: Arbitrary data passed to the receiver

**Requirements:**
- Arrays must have same length and be non-empty
- Maximum 20 tokens per transaction (gas limit protection)
- No duplicate tokens allowed
- Receiver must implement `IMultiFlashLoanReceiver`
- Each token must have sufficient liquidity

### Governance Functions

#### `voteForLPFee(address token, uint256 feeAmountBps)`
Vote for LP fee rate using share-weighted voting.

**Parameters:**
- `token`: Token to vote on
- `feeAmountBps`: Fee rate in basis points (0-100 = 0-1%)

**Behavior:**
- Vote weight proportional to user's shares (including virtual shares)
- Can change vote at any time
- Updates total vote counts automatically

#### `proposeLPFeeChange(address token, uint256 newFeeBps)`
Propose a fee change based on governance voting results.

**Parameters:**
- `token`: Token to change fee for
- `newFeeBps`: New fee rate in basis points

**Requirements:**
- Proposed fee must have majority of total share votes
- Creates a proposal with 10-block execution delay

#### `executeLPFeeChange(address token, uint256 newFeeBps)`
Execute an approved fee change after the delay period.

**Parameters:**
- `token`: Token to change fee for
- `newFeeBps`: New fee rate (must match proposal)

**Requirements:**
- Proposal must exist and be past execution block
- Fee rate is updated and proposal is cleaned up

### View Functions

#### `getWithdrawableAmount(address token, address user) → (uint256, uint256, uint256, uint256, uint256)`
Calculate how much a user can withdraw.

**Returns:**
- `netAmount`: Amount after exit fee
- `grossAmount`: Total withdrawable before exit fee
- `principal`: Original deposit amount
- `fees`: Earned fees
- `exitFee`: Exit fee amount (100 wei)

#### `getEffectiveLPFee(address token) → uint256`
Get current LP fee rate for a token.

**Returns:**
- Fee rate in basis points

## Admin Functions

### `setManagementFee(uint256 percentage)`
Set management fee as percentage of LP fee.

**Parameters:**
- `percentage`: Management fee percentage (100-500 = 1-5%)

**Requirements:**
- Only owner can call
- Percentage must be between 1-5%

### `withdrawManagementFees(address token)`
Withdraw collected management fees.

**Parameters:**
- `token`: Token to withdraw management fees for

**Requirements:**
- Only owner can call

## Security Features

### Precision Attack Protections

1. **Virtual Shares (1000)**: Minted to owner on first deposit
   - Dilutes attackers' ability to manipulate share calculations
   - Makes dust attacks uneconomical

2. **Minimum Deposit (100M wei)**: Enforced on all deposits
   - Prevents economically viable dust attacks
   - Ensures meaningful stake for participants

3. **Fixed Entry/Exit Fees (100 wei)**: 
   - Creates permanent dust accumulation
   - Economic deterrent for repeated small operations
   - Not percentage-based to avoid manipulation

4. **Withdrawal Validation**:
   - Rejects withdrawals below minimum threshold
   - Prevents dust withdrawal exploitation

5. **Precision-Safe Calculations**:
   - Direct multiplication instead of nested division
   - Prevents rounding manipulation

### Standard Protections

- ✅ Reentrancy protection via OpenZeppelin
- ✅ Share dilution attack prevention
- ✅ Arithmetic overflow/underflow protection
- ✅ Interface compliance checking
- ✅ Fee caps and validation
- ✅ Time-delayed governance execution

## Fee Structure

| Fee Type | Default Rate | Range | Description |
|----------|--------------|-------|-------------|
| LP Fee | 0.01% (1 bps) | 0-1% (0-100 bps) | Goes to liquidity providers |
| Management Fee | 1% of LP fee | 1-5% of LP fee | Percentage of LP fee to protocol |
| Entry Fee | 100 wei (fixed) | Fixed | Precision protection |
| Exit Fee | 100 wei (fixed) | Fixed | Precision protection |

### Fee Calculation

For flash loans:
```solidity
uint256 lpFee = (amount * currentLpFee) / 10000;
uint256 mgmtFee = (amount * currentLpFee * managementFeePercentage) / 100000000;
uint256 totalFee = lpFee + mgmtFee;
uint256 repaymentRequired = amount + totalFee;
```

## Events

- `Deposit(address indexed token, address indexed user, uint256 amount, uint256 shares)`
- `Withdraw(address indexed token, address indexed user, uint256 amount, uint256 shares)`
- `WithdrawFees(address indexed token, address indexed user, uint256 feeAmount, uint256 sharesReduced)`
- `FlashLoan(address indexed token, address indexed receiver, uint256 amount, uint256 fee)`
- `MultiFlashLoan(address indexed receiver, address[] tokens, uint256[] amounts, uint256[] fees)`
- `LPFeeVote(address indexed token, address indexed voter, uint256 feeAmountBps, uint256 voteShares)`
- `LPFeeProposed(address indexed token, uint256 newFeeBps, uint256 executionBlock)`
- `LPFeeChanged(address indexed token, uint256 oldFeeBps, uint256 newFeeBps)`
- `ManagementFeeChanged(uint256 oldPercentage, uint256 newPercentage)`
- `ManagementFeesWithdrawn(address indexed token, uint256 amount)`

## Constants

```solidity
uint256 public constant MINIMUM_DEPOSIT = 1e8; // 100M wei
uint256 public constant ENTRY_EXIT_FEE = 100;  // 100 wei
uint256 public constant VIRTUAL_SHARES = 1000; // Virtual shares for precision protection
uint256 public constant PROPOSAL_DELAY = 10;  // 10 blocks delay for governance
uint256 public constant DEFAULT_LP_FEE_BPS = 1; // 0.01% default LP fee
uint256 public constant MAX_MANAGEMENT_FEE_PERCENTAGE = 500; // 5% max management fee
uint256 public constant MAX_LP_FEE_BPS = 100; // 1% max LP fee
```

## Architecture Notes

The contract uses a share-based accounting system where:

1. **Deposits** mint shares proportional to the deposit amount
2. **Fees** are added to the total liquidity pool
3. **Shares** represent proportional ownership of the pool
4. **Withdrawals** burn shares and return proportional pool amount
5. **Virtual shares** provide baseline dilution for security

This design ensures fair fee distribution while protecting against common DeFi attacks.