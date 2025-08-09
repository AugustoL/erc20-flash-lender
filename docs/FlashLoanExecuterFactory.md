# ERC20 Flash Loan Executer Factory

This document explains how to use the ERC20 Flash Loan Executer Factory system for executing complex operations within flash loans.

## Overview

The factory system provides a streamlined executor system that:

1. **Factory-Managed Creation**: Creates executors with temporary factory ownership
2. **Immediate Execution**: Executes flash loan immediately upon creation
3. **Ownership Transfer**: Transfers executor ownership to user after execution
4. **Owner Controlled**: Only the final owner can make post-execution calls  
5. **Arbitrary Recovery**: Full `executeCall()` capabilities for any post-execution scenario
6. **Gas Optimized**: Direct token transfers, minimal storage, efficient patterns

## Key Features

### Streamlined Architecture
- **Factory Creation**: Factory creates and manages executor lifecycle
- **Immediate Execution**: Flash loan executes immediately after creation
- **Ownership Transfer**: Executor ownership transferred to user after execution
- **Gas Optimized**: Users handle repayment directly to lender, saving ~21,000+ gas
- **No Fallback Logic**: Executor trusts users to handle repayment correctly
- **Minimal Storage**: Operations passed directly, not stored permanently
- **Atomic**: All operations happen in a single transaction
- **Persistent**: Executors remain available for post-execution operations

### Gas Optimization Features
- **Direct Repayment**: Users must transfer repayment directly to lender in operations
- **No Extra Transfers**: Eliminates executor → lender transfer step
- **Trust-Based**: Assumes users provide correct repayment amounts
- **Fail-Fast**: Flash lender validates repayment, reverts if insufficient

### Executor Capabilities
- **Ownable**: Maintains user ownership for post-execution operations
- **Arbitrary Calls**: Can execute any contract call via `executeCall()`
- **Emergency Recovery**: Can interact with any protocol to recover funds
- **Reusable**: Same executor can be used for multiple post-execution operations
- **Interface Compliance**: Implements IFlashLoanReceiver and ERC165

## Usage Examples

### Gas-Optimized Flash Loan Execution

```solidity
// Define operations to execute within the flash loan
ERC20FlashLoanExecuter.Operation[] memory operations = new ERC20FlashLoanExecuter.Operation[](3);

// 1. Perform arbitrage or other operations
operations[0] = ERC20FlashLoanExecuter.Operation({
    target: address(dexContract),
    data: abi.encodeWithSignature("swap(address,address,uint256)", tokenA, tokenB, flashAmount),
    value: 0
});

// 2. Perform reverse arbitrage to earn profit
operations[1] = ERC20FlashLoanExecuter.Operation({
    target: address(anotherDex),
    data: abi.encodeWithSignature("swap(address,address,uint256)", tokenB, tokenA, receivedAmount),
    value: 0
});

// 3. CRITICAL: Repay flash loan directly to lender (saves gas!)
operations[2] = ERC20FlashLoanExecuter.Operation({
    target: address(yourContract), // Contract that holds repayment tokens
    data: abi.encodeWithSignature(
        "transferToLender(address,address,uint256)", 
        token,           // Token to repay
        flashLender,     // Send directly to lender - saves gas!
        totalOwed       // Principal + fees (use calculateFlashLoanFees)
    ),
    value: 0
});

// Create and execute flash loan (single transaction)
address executor = factory.createAndExecuteFlashLoan(
    address(token),           // Token to borrow
    ethers.parseEther("100"), // Amount to borrow
    operations               // Operations to execute
);

// Executor is now owned by msg.sender and can be reused for post-execution operations
```

### IMPORTANT: Fee Calculation

You must calculate the exact repayment amount including fees:

```solidity
// Match the flash lender's fee calculation exactly
function calculateFlashLoanFees(uint256 amount) pure returns (uint256 totalOwed) {
    uint256 DEFAULT_LP_FEE_BPS = 1;      // 0.01%
    uint256 managementFeePercentage = 100; // 1% of LP fee
    
    uint256 lpFee = (amount * DEFAULT_LP_FEE_BPS) / 10000;
    uint256 mgmtFee = (amount * DEFAULT_LP_FEE_BPS * managementFeePercentage) / 100000000;
    uint256 totalFee = lpFee + mgmtFee;
    
    return amount + totalFee;
}
```

### Post-Execution Operations

```solidity
// The executor is owned by msg.sender after factory execution
ERC20FlashLoanExecuter executor = ERC20FlashLoanExecuter(executorAddress);

// Example: Withdraw any remaining ETH
(bool success, ) = executor.executeCall(
    payable(msg.sender),      // target: your address
    "",                       // data: empty for ETH transfer
    address(executor).balance // value: all ETH in contract
);

// Example: Rescue tokens from external protocol
(success, ) = executor.executeCall(
    stakingContract,
    abi.encodeWithSignature("emergencyWithdraw(address)", msg.sender),
    0
);

// Example: Approve and transfer exotic tokens
(success, ) = executor.executeCall(
    weirdToken,
    abi.encodeWithSignature("approve(address,uint256)", rescueContract, type(uint256).max),
    0
);

(success, ) = executor.executeCall(
    rescueContract,
    abi.encodeWithSignature("rescueTokens(address,address)", weirdToken, msg.sender),
    0
);

// Executor remains available for future operations as needed
```

## Factory-Based Execution Benefits

### Streamlined Architecture:

1. **Single-Transaction Workflow**: Factory creation and flash loan execution in one transaction
2. **Ownership Management**: 
   - Factory temporarily owns executor during flash loan execution
   - Ownership transferred to user after successful execution
   - User maintains full control for post-execution operations
3. **Gas Efficiency**: 
   - Direct `transfer()` instead of approve/transferFrom pattern
   - No event emissions during execution
   - Minimal storage usage
   - Optimized contract deployment
4. **Simplified Interface**: Single factory call handles creation and execution
5. **Fail-Safe**: If flash loan fails, entire transaction reverts atomically
6. **Persistent Access**: Executors remain available for complex recovery scenarios

### Architecture Flow:

```
User calls factory.createAndExecuteFlashLoan() 
    ↓
Factory deploys executor with factory as temporary owner
    ↓
Factory calls executor.executeFlashLoan() with operations
    ↓
Executor calls flashLender.flashLoan()
    ↓
Flash lender transfers tokens to executor
    ↓
Flash lender calls executeOperation() on executor
    ↓
Executor executes all operations sequentially
    ↓
Executor transfers borrowed amount + fees directly back to lender
    ↓
Factory transfers executor ownership to msg.sender
    ↓
Executor persists for user's post-execution operations
```

## Factory Functions

### Core Functions

- `createAndExecuteFlashLoan(token, amount, operations)`: Create executor and execute flash loan, transfer ownership to user

### View Functions

- `flashLender()`: Get the flash lender address

## Executor Functions

### Owner-Only Functions

- `executeCall(target, data, value)`: Execute arbitrary contract calls
- `executeFlashLoan(token, amount, operations)`: Execute flash loan with operations

### Interface Functions

- `executeOperation()`: Called by flash lender (internal use)
- `supportsInterface()`: ERC165 interface detection
- `receive()`: Accept ETH transfers

## Gas Optimization Features

- **Factory-Managed Creation**: Eliminates need for separate deployment transaction
- **Direct Lender Repayment**: Users transfer repayment directly to lender, saving ~21,000+ gas
- **No Fallback Logic**: Executor trusts user operations to handle repayment correctly
- **Minimal Validation**: Reduces gas by removing unnecessary balance checks
- **Trust-Based Model**: Assumes users calculate correct fees and repayment amounts
- **Fail-Fast**: Flash lender validates repayment, entire transaction reverts if insufficient

### Gas Savings Breakdown:

**Traditional Flow (Inefficient):**
```
Lender → Executor → Operations → Executor → Lender
                               ↑_____________↑
                              Extra Transfer (21,000+ gas)
```

**Optimized Flow:**
```  
Lender → Executor → Operations → Lender
                   ↑____________↑
                  Direct Transfer (saves gas!)
```

**Expected Savings:** 21,000+ gas per flash loan by eliminating one token transfer operation.

## Use Cases

### Standard Operations:
- Arbitrage opportunities across multiple DEXs
- MEV extraction with complex operation sequences
- Liquidation operations with multi-step workflows
- Flash loan operations with post-execution recovery needs

### Complex Operations (with executor persistence):
- Multi-step recovery scenarios
- Operations interacting with multiple protocols
- Uncertain operation outcomes requiring manual intervention
- Complex operations where funds might get stuck in external protocols
- Reusable executors for multiple flash loan strategies

## Security Considerations

1. **Owner Control**: Only the user (final owner) can execute post-deployment calls
2. **Factory Management**: Factory temporarily owns executor during execution for security
3. **Validation**: All operations are validated before execution
4. **Interface Compliance**: Implements proper IFlashLoanReceiver interface
5. **Direct Transfers**: More secure than approve patterns for flash loan repayment
6. **Ownership Transfer**: Secure transfer of control from factory to user

## Error Handling

The system includes comprehensive error handling:

- Invalid parameters cause transaction to revert
- Failed operations during execution cause entire transaction to revert
- **Insufficient repayment by user operations causes flash loan to revert with "Flash loan not repaid"**
- **User must calculate exact fees and handle repayment in their operations**
- Unauthorized access attempts are blocked by Ownable
- Interface compliance is enforced

**Critical Note:** Users are responsible for repaying flash loans directly to the lender in their operations. If operations don't transfer the correct amount (principal + fees) to the flash lender, the entire transaction will revert.

All errors will cause the entire transaction to revert, ensuring atomicity and preventing partial execution states.
