# ERC20 Flash Loan Executor

This document explains how to use the ERC20 Flash Loan Executor system for executing complex operations within flash loans. The executor is the core component that enables multi-operation flash loans, while the factory provides convenient creation and management functionality.

## Overview

The ERC20 Flash Loan Executor is a reusable contract that enables complex multi-operation flash loans with gas optimization. The system consists of two main components:

### **🎯 ERC20FlashLoanExecutor (Core Component)**
- **Multi-Operation Support**: Execute multiple contract calls in sequence within a single flash loan
- **Owner-Controlled**: Only the owner can initiate flash loans and execute operations
- **Gas Optimized**: Users handle repayment directly to lender, saving ~21,000+ gas per transaction
- **Reusable**: Same executor can be used for multiple flash loans and post-execution operations
- **ETH Support**: Can handle operations that require ETH transfers alongside token operations

### **🏭 ERC20FlashLoanExecutorFactory (Supporting Tool)**
- **Convenient Creation**: Streamlined executor deployment and immediate execution
- **Ownership Management**: Handles temporary ownership during creation and transfers to user
- **Single-Transaction Workflow**: Create executor and execute flash loan in one transaction
- **Gas Efficient**: Optimized deployment patterns

The factory provides a streamlined approach, but the executor can also be deployed and used independently for maximum flexibility.

## Flash Loan Executor Features

### Core Executor Capabilities
- **Multi-Operation Support**: Execute multiple contract calls in a single flash loan transaction
- **Owner-Controlled Access**: Only the executor owner can initiate flash loans and operations
- **Direct Repayment**: Users handle loan repayment directly to lender for maximum gas efficiency
- **ETH Handling**: Support for operations requiring ETH transfers alongside token operations
- **Post-Execution Operations**: Persistent executor allows arbitrary calls after flash loan completion
- **Interface Compliance**: Implements IFlashLoanReceiver and ERC165 standards
- **Emergency Recovery**: Can interact with any protocol to recover stuck funds

### Gas Optimization Features
- **Direct Repayment**: Saves ~21,000 gas by eliminating executor → lender transfer step
- **No Approval Required**: Direct transfers avoid approval gas costs (~24,000 gas)
- **Efficient Encoding**: Optimized calldata encoding for operation arrays
- **Minimal Storage**: Operations passed directly, not stored in contract state
- **Trust-Based Model**: Assumes users calculate correct fees and handle repayment

### Factory Conveniences (Optional)
- **One-Transaction Creation**: Deploy executor and execute flash loan atomically
- **Ownership Management**: Automatic ownership transfer from factory to user
- **Simplified Interface**: Single function call for complete workflow
- **Fail-Safe Design**: Entire transaction reverts if any step fails

## Usage Examples

### Method 1: Using Factory (Recommended for Most Users)

The factory provides the simplest way to create and execute flash loans in a single transaction:

```solidity
// Define operations to execute within the flash loan
ERC20FlashLoanExecutor.Operation[] memory operations = new ERC20FlashLoanExecutor.Operation[](3);

// 1. Perform arbitrage or other operations
operations[0] = ERC20FlashLoanExecutor.Operation({
    target: address(dexContract),
    data: abi.encodeWithSignature("swap(address,address,uint256)", tokenA, tokenB, flashAmount),
    value: 0
});

// 2. Perform reverse arbitrage to earn profit
operations[1] = ERC20FlashLoanExecutor.Operation({
    target: address(anotherDex),
    data: abi.encodeWithSignature("swap(address,address,uint256)", tokenB, tokenA, receivedAmount),
    value: 0
});

// 3. CRITICAL: Repay flash loan directly to lender (saves gas!)
operations[2] = ERC20FlashLoanExecutor.Operation({
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

### Method 2: Direct Executor Usage (Advanced Users)

For maximum control and reusability, you can deploy and use executors directly:

```solidity
// 1. Deploy executor directly (or use factory.createExecutor())
ERC20FlashLoanExecutor executor = new ERC20FlashLoanExecutor(
    address(flashLender),
    msg.sender  // Owner
);

// 2. Prepare operations (same as above)
ERC20FlashLoanExecutor.Operation[] memory operations = new ERC20FlashLoanExecutor.Operation[](2);
// ... define operations ...

// 3. Execute flash loan using the executor
executor.executeFlashLoan(
    address(token),
    ethers.parseEther("100"),
    operations
);

// 4. Reuse executor for additional flash loans or operations
executor.executeFlashLoan(address(anotherToken), amount2, moreOperations);
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
ERC20FlashLoanExecutor executor = ERC20FlashLoanExecutor(executorAddress);

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

## Architecture and Workflow

### Executor-Centric Architecture

The flash loan executor operates as a reusable, owner-controlled contract that can execute complex multi-step operations within flash loans:

```
User → Executor.executeFlashLoan() 
    ↓
Executor calls flashLender.flashLoan()
    ↓
Flash lender transfers tokens to executor
    ↓
Flash lender calls executeOperation() on executor
    ↓
Executor executes all operations sequentially
    ↓
Operations transfer repayment directly to lender (gas optimized)
    ↓
Executor persists for future operations
```

### Factory-Assisted Workflow (Optional)

For convenience, the factory can handle executor creation and immediate execution:

```
User calls factory.createAndExecuteFlashLoan() 
    ↓
Factory deploys executor with factory as temporary owner
    ↓
Factory calls executor.executeFlashLoan() with operations
    ↓
[Same execution flow as above]
    ↓
Factory transfers executor ownership to user
    ↓
Executor persists for user's post-execution operations
```

## Contract Functions

### Executor Functions (Core Component)

#### Owner-Only Functions
- `executeFlashLoan(token, amount, operations)`: Execute flash loan with multiple operations
- `executeCall(target, data, value)`: Execute arbitrary contract calls (post-execution)

#### View Functions
- `getFlashLender()`: Get the flash lender address for direct repayment
- `owner()`: Get the current owner of the executor
- `supportsInterface(interfaceId)`: ERC165 interface detection

#### Interface Functions (Internal)
- `executeOperation()`: Called by flash lender during loan execution
- `receive()`: Accept ETH transfers

### Factory Functions (Supporting Tool)

#### Core Functions
- `createExecutor()`: Create a new executor with caller as owner
- `createAndExecuteFlashLoan(token, amount, operations)`: Create executor and execute flash loan in one transaction

#### View Functions
- `flashLender()`: Get the flash lender address

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

## Gas Cost Analysis

### Gas Cost Breakdown for `executeFlashLoan`

When using the executor to perform flash loans, users should understand the gas costs involved for proper transaction planning and MEV profitability calculations.

#### Base Function Costs:
1. **Function call overhead**: ~21,000 gas
2. **OnlyOwner modifier check**: ~2,500 gas
3. **ABI encoding operations**: ~5,000-15,000 gas (depends on operation count)
4. **Flash loan initiation**: ~3,000 gas

#### Flash Loan Process Costs:
5. **Flash lender token transfer** (lender → executor): ~21,000 gas
6. **Flash lender callback** to `executeOperation`: ~5,000 gas
7. **ABI decoding operations**: ~3,000-8,000 gas (depends on operation count)
8. **Operation loop overhead**: ~1,000 gas per operation

#### Per-Operation Costs (varies by operation type):
9. **External call overhead**: ~2,100 gas per operation
10. **Actual operation execution**: **Highly variable** (5,000 - 200,000+ gas each)

#### Validation & Return:
11. **Flash loan repayment validation**: ~5,000 gas
12. **Function return**: ~1,000 gas

### Estimated Total Gas Costs:

#### **Minimal Case** (1-2 simple operations):
- **Base overhead**: ~66,000 gas
- **Simple operations** (e.g., setValue): ~10,000 gas each
- **Total**: **~80,000-90,000 gas**

#### **Typical Case** (3-4 operations including repayment):
- **Base overhead**: ~70,000 gas
- **Medium operations** (token transfers, swaps): ~30,000 gas each
- **Total**: **~150,000-200,000 gas**

#### **Complex Case** (5+ operations with DEX interactions):
- **Base overhead**: ~75,000 gas
- **Complex operations** (DEX swaps, liquidations): ~50,000-100,000 gas each
- **Total**: **~300,000-500,000+ gas**

### Key Gas Optimization Benefits:

1. **Direct Repayment**: Saves ~21,000 gas vs traditional approve/transferFrom pattern
2. **Single Transaction**: All operations bundled, no multiple transaction costs
3. **Efficient Encoding**: Calldata encoding is gas-optimized
4. **Minimal Storage**: No permanent storage of operations

### Real-World Examples:

#### **Simple Arbitrage** (3 operations):
```
- DEX Swap A→B: ~80,000 gas
- DEX Swap B→A: ~80,000 gas  
- Repay to lender: ~21,000 gas
- Executor overhead: ~70,000 gas
Total: ~250,000 gas
```

#### **Complex Liquidation** (5 operations):
```
- Liquidate position: ~150,000 gas
- Claim collateral: ~80,000 gas
- Swap collateral: ~80,000 gas
- Swap for repayment: ~80,000 gas
- Repay to lender: ~21,000 gas
- Executor overhead: ~75,000 gas
Total: ~485,000 gas
```

### Factors That Affect Gas Cost:

1. **Number of operations**: +~30,000-100,000 gas per operation
2. **Operation complexity**: Simple calls vs DEX interactions
3. **Token transfer gas costs**: Varies by token implementation
4. **Network congestion**: Affects base transaction cost
5. **Calldata size**: Larger operation arrays cost more to encode

### Gas Cost Planning:

- **Typical users should budget**: **150,000-300,000 gas** for flash loan operations
- **Gas optimization saves**: **~21,000 gas** compared to traditional patterns
- **MEV opportunities**: Must exceed gas costs + fees for profitability
- **Network considerations**: Gas prices vary significantly by network and time

### Comparison with Traditional Flash Loans:

**❌ Traditional Flow:**
```
1. Flash loan callback: ~50,000 gas
2. User operations: Variable
3. Token approval: ~45,000 gas
4. Token transfer to lender: ~21,000 gas
Total overhead: ~116,000+ gas
```

**✅ Optimized Executor Flow:**
```
1. Executor callback: ~50,000 gas
2. User operations: Variable
3. Direct transfer to lender: ~21,000 gas
Total overhead: ~71,000 gas
```

**Gas Savings: ~45,000 gas per flash loan** (approval + one transfer eliminated)

## When to Use Flash Loan Executors

### **Recommended for:**
- **Multi-step operations** (3+ contract calls)
- **Cross-protocol interactions** requiring coordination
- **MEV strategies** where gas optimization matters
- **Operations requiring ETH** alongside token operations
- **Scenarios with uncertain outcomes** (executor persists for recovery)
- **Reusable workflows** where executor can be used multiple times

### **Consider alternatives for:**
- **Simple single-operation** flash loans (direct integration may be cheaper)
- **Operations under 100,000 gas** (overhead may not be worth it)
- **One-time use cases** where executor creation overhead isn't justified
- **Gas-sensitive environments** where every wei counts and complexity is low

### **Cost-Benefit Analysis:**
- **Break-even point**: ~3+ operations or ~150,000+ gas in user operations
- **Maximum benefit**: Complex multi-protocol interactions with 5+ operations
- **Executor reuse**: Amortizes creation costs across multiple flash loans

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
