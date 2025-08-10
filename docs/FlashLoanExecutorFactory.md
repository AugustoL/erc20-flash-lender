# ERC20 Flash Loan Executor Factory

This document explains how to use the ERC20 Flash Loan Executor Factory system for executing complex operations within single-token and multi-token flash loans.

## Overview

The factory system provides a streamlined executor system that:

1. **Factory-Managed Creation**: Creates executors with temporary factory ownership
2. **Immediate Execution**: Executes single-token or multi-token flash loans immediately upon creation
3. **Ownership Transfer**: Transfers executor ownership to user after execution
4. **Owner Controlled**: Only the final owner can make post-execution calls  
5. **Arbitrary Recovery**: Full `executeCall()` capabilities for any post-execution scenario
6. **Gas Optimized**: Direct token transfers, minimal storage, efficient patterns
7. **Multi-Token Support**: Borrow multiple different tokens simultaneously in one transaction

## Key Features

### Streamlined Architecture
- **Factory Creation**: Factory creates and manages executor lifecycle
- **Immediate Execution**: Single-token or multi-token flash loans execute immediately after creation
- **Ownership Transfer**: Executor ownership transferred to user after execution
- **Gas Optimized**: Users handle repayment directly to lender, saving ~21,000+ gas per token
- **No Fallback Logic**: Executor trusts users to handle repayment correctly
- **Minimal Storage**: Operations passed directly, not stored permanently
- **Atomic**: All operations happen in a single transaction
- **Persistent**: Executors remain available for post-execution operations

### Gas Optimization Features
- **Direct Repayment**: Users must transfer repayment directly to lender in operations
- **No Extra Transfers**: Eliminates executor → lender transfer step for each token
- **Trust-Based**: Assumes users provide correct repayment amounts for all borrowed tokens
- **Fail-Fast**: Flash lender validates repayment for each token, reverts if any are insufficient

### Executor Capabilities
- **Ownable**: Maintains user ownership for post-execution operations
- **Arbitrary Calls**: Can execute any contract call via `executeCall()`
- **Emergency Recovery**: Can interact with any protocol to recover funds
- **Reusable**: Same executor can be used for multiple post-execution operations
- **Interface Compliance**: Implements IFlashLoanReceiver, IMultiFlashLoanReceiver, and ERC165

## Usage Examples

### Gas-Optimized Flash Loan Execution

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

## Multi-Token Flash Loan Execution

The executor factory supports borrowing multiple different tokens simultaneously in a single transaction, enabling sophisticated strategies that require temporary access to diverse assets.

### Multi-Token Gas-Optimized Flash Loan

```solidity
// Define operations for multi-token flash loan
ERC20FlashLoanExecutor.Operation[] memory operations = new ERC20FlashLoanExecutor.Operation[](6);

// Setup token addresses and amounts
address[] memory tokens = new address[](3);
tokens[0] = wethAddress;   // WETH
tokens[1] = usdcAddress;   // USDC  
tokens[2] = daiAddress;    // DAI

uint256[] memory amounts = new uint256[](3);
amounts[0] = ethers.parseEther("10");        // 10 WETH
amounts[1] = 20000 * 10**6;                  // 20,000 USDC
amounts[2] = ethers.parseEther("15000");     // 15,000 DAI

// 1. Cross-DEX arbitrage with WETH
operations[0] = ERC20FlashLoanExecutor.Operation({
    target: dex1Address,
    data: abi.encodeWithSignature("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", 
        amounts[0], 0, getPath(wethAddress, usdcAddress), address(executor), block.timestamp + 300),
    value: 0
});

// 2. Complex liquidation using USDC
operations[1] = ERC20FlashLoanExecutor.Operation({
    target: lendingProtocolAddress,
    data: abi.encodeWithSignature("liquidate(address,address,uint256)", 
        borrowerAddress, usdcAddress, amounts[1]),
    value: 0
});

// 3. Portfolio rebalancing with DAI
operations[2] = ERC20FlashLoanExecutor.Operation({
    target: portfolioManagerAddress,
    data: abi.encodeWithSignature("rebalance(address,uint256)", daiAddress, amounts[2]),
    value: 0
});

// 4. Repay WETH loan + fees directly to lender (gas optimized)
operations[3] = ERC20FlashLoanExecutor.Operation({
    target: wethAddress,
    data: abi.encodeWithSignature("transfer(address,uint256)", 
        flashLenderAddress, calculateFlashLoanFees(amounts[0])),
    value: 0
});

// 5. Repay USDC loan + fees directly to lender (gas optimized)
operations[4] = ERC20FlashLoanExecutor.Operation({
    target: usdcAddress,
    data: abi.encodeWithSignature("transfer(address,uint256)", 
        flashLenderAddress, calculateFlashLoanFees(amounts[1])),
    value: 0
});

// 6. Repay DAI loan + fees directly to lender (gas optimized)
operations[5] = ERC20FlashLoanExecutor.Operation({
    target: daiAddress,
    data: abi.encodeWithSignature("transfer(address,uint256)", 
        flashLenderAddress, calculateFlashLoanFees(amounts[2])),
    value: 0
});

// Create and execute multi-token flash loan (single transaction)
address executor = factory.createAndExecuteMultiFlashLoan(
    tokens,      // Array of token addresses
    amounts,     // Array of amounts to borrow
    operations   // Operations to execute
);

// Executor is now owned by msg.sender and can be reused for post-execution operations
```

### Advanced Multi-Token Arbitrage Strategy

```solidity
// Complex arbitrage across multiple DEXs and protocols
ERC20FlashLoanExecutor.Operation[] memory operations = new ERC20FlashLoanExecutor.Operation[](8);

address[] memory arbitrageTokens = new address[](2);
arbitrageTokens[0] = ethAddress;
arbitrageTokens[1] = btcAddress;

uint256[] memory arbitrageAmounts = new uint256[](2);
arbitrageAmounts[0] = ethers.parseEther("50");    // 50 ETH
arbitrageAmounts[1] = 2 * 10**8;                  // 2 BTC

// 1. Swap ETH on DEX A for maximum output
operations[0] = ERC20FlashLoanExecutor.Operation({
    target: dexAAddress,
    data: abi.encodeWithSignature("swapETHForTokens(uint256,address)", 
        minimumOut1, intermediateToken),
    value: 0
});

// 2. Swap intermediate token on DEX B
operations[1] = ERC20FlashLoanExecutor.Operation({
    target: dexBAddress,
    data: abi.encodeWithSignature("swapTokensForETH(uint256,uint256)", 
        receivedAmount, minimumOut2),
    value: 0
});

// 3. Use BTC for cross-chain arbitrage preparation
operations[2] = ERC20FlashLoanExecutor.Operation({
    target: bridgeProtocolAddress,
    data: abi.encodeWithSignature("prepareCrossChainArbitrage(address,uint256)", 
        btcAddress, arbitrageAmounts[1]),
    value: 0
});

// 4. Execute additional arbitrage operations
operations[3] = ERC20FlashLoanExecutor.Operation({
    target: arbitrageContractAddress,
    data: abi.encodeWithSignature("executeComplexArbitrage(address[],uint256[])", 
        arbitrageTokens, arbitrageAmounts),
    value: 0
});

// 5. Consolidate profits and prepare repayments
operations[4] = ERC20FlashLoanExecutor.Operation({
    target: profitConsolidatorAddress,
    data: abi.encodeWithSignature("consolidateAndPrepareRepayment(address[],uint256[])", 
        arbitrageTokens, arbitrageAmounts),
    value: 0
});

// 6. Repay ETH loan + fees
operations[5] = ERC20FlashLoanExecutor.Operation({
    target: ethAddress,
    data: abi.encodeWithSignature("transfer(address,uint256)", 
        flashLenderAddress, calculateFlashLoanFees(arbitrageAmounts[0])),
    value: 0
});

// 7. Repay BTC loan + fees
operations[6] = ERC20FlashLoanExecutor.Operation({
    target: btcAddress,
    data: abi.encodeWithSignature("transfer(address,uint256)", 
        flashLenderAddress, calculateFlashLoanFees(arbitrageAmounts[1])),
    value: 0
});

// 8. Transfer profits to user
operations[7] = ERC20FlashLoanExecutor.Operation({
    target: profitTokenAddress,
    data: abi.encodeWithSignature("transfer(address,uint256)", 
        msg.sender, calculatedProfits),
    value: 0
});

// Execute complex multi-token arbitrage
address executor = factory.createAndExecuteMultiFlashLoan(
    arbitrageTokens,
    arbitrageAmounts,
    operations
);
```

### Multi-Token Fee Calculation

For multi-token flash loans, you must calculate fees for each token individually:

```solidity
// Calculate fees for each token separately
function calculateMultiTokenFees(
    address[] memory tokens,
    uint256[] memory amounts
) view returns (uint256[] memory totalOwed) {
    totalOwed = new uint256[](tokens.length);
    
    for (uint256 i = 0; i < tokens.length; i++) {
        // Get token-specific LP fee (or use default)
        uint256 lpFeeBps = flashLender.getEffectiveLPFee(tokens[i]); // Usually 1 bps
        uint256 managementFeePercentage = flashLender.managementFeePercentage(); // Usually 100 (1%)
        
        uint256 lpFee = (amounts[i] * lpFeeBps) / 10000;
        uint256 mgmtFee = (amounts[i] * lpFeeBps * managementFeePercentage) / 100000000;
        uint256 totalFee = lpFee + mgmtFee;
        
        totalOwed[i] = amounts[i] + totalFee;
    }
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

- `createAndExecuteFlashLoan(token, amount, operations)`: Create executor and execute single-token flash loan, transfer ownership to user
- `createAndExecuteMultiFlashLoan(tokens[], amounts[], operations)`: Create executor and execute multi-token flash loan, transfer ownership to user

### View Functions

- `flashLender()`: Get the flash lender address

## Executor Functions

### Owner-Only Functions

- `executeCall(target, data, value)`: Execute arbitrary contract calls
- `executeFlashLoan(token, amount, operations)`: Execute single-token flash loan with operations
- `executeMultiFlashLoan(tokens[], amounts[], operations)`: Execute multi-token flash loan with operations

### Interface Functions

- `executeOperation()`: Called by flash lender for single-token loans (internal use)
- `executeMultiOperation()`: Called by flash lender for multi-token loans (internal use)
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

**Expected Savings:** 21,000+ gas per token by eliminating one token transfer operation per borrowed token.

## Multi-Token Gas Benefits

For multi-token flash loans, the gas savings multiply:

**Traditional Multi-Token Flow (Inefficient):**
```
Lender → Executor → Operations → Executor → Lender (Token A: 21,000 gas)
Lender → Executor → Operations → Executor → Lender (Token B: 21,000 gas) 
Lender → Executor → Operations → Executor → Lender (Token C: 21,000 gas)
Total extra transfers: 63,000 gas for 3 tokens
```

**Optimized Multi-Token Flow:**
```  
Lender → Executor → Operations → Lender (Token A)
Lender → Executor → Operations → Lender (Token B)
Lender → Executor → Operations → Lender (Token C)
Direct transfers save: 63,000 gas for 3 tokens
```

**Multi-Token Savings:** 21,000+ gas × number of tokens borrowed

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

#### **Complex Multi-Token Case** (5+ operations with multiple DEX interactions):
- **Base overhead**: ~80,000 gas
- **Multi-token validation**: ~5,000 gas per additional token
- **Complex operations** (DEX swaps, liquidations): ~50,000-100,000 gas each
- **Multi-token repayment**: ~21,000 gas per token
- **Total**: **~400,000-700,000+ gas**

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

#### **Multi-Token Arbitrage** (3 tokens, 6 operations):
```
- Cross-DEX arbitrage (Token A): ~100,000 gas
- Cross-DEX arbitrage (Token B): ~100,000 gas
- Portfolio rebalancing (Token C): ~80,000 gas
- Repay Token A: ~21,000 gas
- Repay Token B: ~21,000 gas
- Repay Token C: ~21,000 gas
- Executor overhead: ~80,000 gas
Total: ~420,000 gas
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
2. **Number of tokens**: +~21,000 gas per additional token (repayment)
3. **Operation complexity**: Simple calls vs DEX interactions
4. **Token transfer gas costs**: Varies by token implementation
5. **Network congestion**: Affects base transaction cost
6. **Calldata size**: Larger operation arrays cost more to encode

### Gas Cost Planning:

- **Single-token users should budget**: **150,000-300,000 gas** for flash loan operations
- **Multi-token users should budget**: **300,000-700,000 gas** for complex multi-token operations
- **Gas optimization saves**: **~21,000 gas per token** compared to traditional patterns
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

**Gas Savings: ~45,000 gas per single-token flash loan** (approval + one transfer eliminated)
**Gas Savings: ~45,000 gas × number of tokens for multi-token flash loans**

## When to Use Flash Loan Executors

### **Recommended for:**
- **Multi-step operations** (3+ contract calls)
- **Multi-token strategies** requiring diverse asset access
- **Cross-protocol interactions** requiring coordination
- **MEV strategies** where gas optimization matters
- **Operations requiring ETH** alongside token operations
- **Scenarios with uncertain outcomes** (executor persists for recovery)
- **Reusable workflows** where executor can be used multiple times
- **Complex arbitrage** across multiple DEXs and token pairs

### **Consider alternatives for:**
- **Simple single-operation** flash loans (direct integration may be cheaper)
- **Operations under 100,000 gas** (overhead may not be worth it)
- **One-time use cases** where executor creation overhead isn't justified
- **Gas-sensitive environments** where every wei counts and complexity is low

### **Cost-Benefit Analysis:**
- **Single-token break-even point**: ~3+ operations or ~150,000+ gas in user operations
- **Multi-token break-even point**: ~2+ operations per token or ~100,000+ gas per token
- **Maximum benefit**: Complex multi-protocol interactions with 5+ operations across 3+ tokens
- **Executor reuse**: Amortizes creation costs across multiple flash loans

## Use Cases

### Single-Token Operations:
- Arbitrage opportunities across multiple DEXs
- MEV extraction with complex operation sequences
- Liquidation operations with multi-step workflows
- Flash loan operations with post-execution recovery needs

### Multi-Token Operations:
- **Cross-Asset Arbitrage**: Simultaneous arbitrage across different token pairs
- **Portfolio Rebalancing**: Rebalancing strategies requiring multiple assets
- **Complex Liquidations**: Liquidations involving multiple collateral types
- **Cross-Protocol Yield Farming**: Moving liquidity across protocols simultaneously
- **Statistical Arbitrage**: Pairs trading and correlation-based strategies across multiple tokens
- **Multi-Asset Refinancing**: Refinancing loans across multiple tokens simultaneously

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
- **User must calculate exact fees for each borrowed token and handle repayment in their operations**
- **Multi-token loans require repayment of all borrowed tokens plus individual fees**
- Unauthorized access attempts are blocked by Ownable
- Interface compliance is enforced

**Critical Note:** Users are responsible for repaying flash loans directly to the lender in their operations. For single-token loans, transfer the correct amount (principal + fees) to the flash lender. For multi-token loans, transfer the correct amount for each borrowed token. If operations don't transfer the correct amounts for all tokens, the entire transaction will revert.

All errors will cause the entire transaction to revert, ensuring atomicity and preventing partial execution states.
