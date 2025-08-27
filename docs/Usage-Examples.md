# Usage Examples

## For Liquidity Providers

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

// Option 1: Withdraw only fees (keep principal staked) 🆕
if (fees > exitFee) {
    lender.withdrawFees(token); // Harvest fees, keep earning on principal
}

// Option 2: Withdraw everything (100 wei exit fee stays in pool)
// Note: Withdrawal may be rejected if net amount < MINIMUM_DEPOSIT after exit fee
lender.withdraw(token);
```

## For Flash Loan Borrowers

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

## Fee Structure Examples

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