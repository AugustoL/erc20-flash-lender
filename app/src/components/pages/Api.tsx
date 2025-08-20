import { getAllNetworks, getContractAddress } from '../../config';

export default function Api() {
  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="padding-standard">
          <div className="api-docs">
            <div className="api-header">
              <h2>🚀 ERC20FlashLender API Documentation</h2>
              <p className="api-subtitle">Learn how to interact with the ERC20FlashLender contract to execute flash loans.</p>
            </div>

            <div className="api-section">
              <h3>🔗 Contract Addresses</h3>
              <p>Current deployed contract addresses across supported networks:</p>
              
              {getAllNetworks().map((network) => {
                const flashLenderAddress = getContractAddress('ERC20FlashLender', network.chainId);
                const executorFactoryAddress = getContractAddress('ERC20FlashLoanExecutorFactory', network.chainId);
                
                return (
                  <div key={network.chainId} className="network-contracts">
                    <h4>🌐 {network.name} (Chain ID: {network.chainId})</h4>
                    <div className="contract-list">
                      {flashLenderAddress && (
                        <div className="contract-item">
                          <strong>ERC20FlashLender:</strong>
                          <code className="address-code">{flashLenderAddress}</code>
                          {network.explorerUrl && (
                            <a 
                              href={`${network.explorerUrl}/address/${flashLenderAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="explorer-link"
                            >
                              🔍 View
                            </a>
                          )}
                        </div>
                      )}
                      
                      {executorFactoryAddress && (
                        <div className="contract-item">
                          <strong>ERC20FlashLoanExecutorFactory:</strong>
                          <code className="address-code">{executorFactoryAddress}</code>
                          {network.explorerUrl && (
                            <a 
                              href={`${network.explorerUrl}/address/${executorFactoryAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="explorer-link"
                            >
                              🔍 View
                            </a>
                          )}
                        </div>
                      )}            
                      
                      {!flashLenderAddress && (
                        <p className="no-contracts">No contracts deployed on this network yet.</p>
                      )}
                    </div>
                  </div>
                );
              })}
              
            </div>

            <div className="api-section">
              <h3>📋 Flash Loan Interface</h3>
              <p>To receive flash loans, your contract must implement the <code>IFlashLoanReceiver</code> interface:</p>
              <div className="code-container">
                <pre className="code-block">
{`interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 fee,
        bytes calldata params
    ) external returns (bool);
}`}
                </pre>
              </div>
            </div>

            <div className="api-section">
              <h3>⚡ Basic Flash Loan</h3>
              <p>Execute a single-token flash loan:</p>
              <div className="code-container">
                <pre className="code-block">
{`// Call flashLoan on the ERC20FlashLender contract
function flashLoan(
    address receiverAddress,  // Your contract implementing IFlashLoanReceiver
    address asset,           // ERC20 token address
    uint256 amount,          // Amount to borrow
    bytes calldata params    // Custom data passed to your contract
) external;`}
                </pre>
              </div>
            </div>

            <div className="api-section">
              <h3>🔄 Multi-Token Flash Loan</h3>
              <p>Execute flash loans for multiple tokens in a single transaction:</p>
              <div className="code-container">
                <pre className="code-block">
{`// Call multiFlashLoan for multiple assets
function multiFlashLoan(
    address receiverAddress,
    address[] calldata assets,   // Array of token addresses
    uint256[] calldata amounts,  // Array of amounts to borrow
    bytes calldata params
) external;`}
                </pre>
              </div>
              <p>Your contract must implement <code>IMultiFlashLoanReceiver</code> for multi-token loans.</p>
            </div>

            <div className="api-section">
              <h3>📊 Fee Structure</h3>
              <ul>
                <li><strong>LP Fee:</strong> Configurable per token (default 0.01%)</li>
                <li><strong>Management Fee:</strong> Percentage of LP fee taken by protocol</li>
                <li><strong>Calculation:</strong> Total fee = (amount × lpFee) / 10000</li>
              </ul>
            </div>

            <div className="api-section">
              <h3>⚠️ Important Notes</h3>
              <ul>
                <li>Always approve the flash lender to spend the repayment amount</li>
                <li>Ensure your contract has sufficient balance for repayment + fees</li>
                <li>Flash loan execution must complete in a single transaction</li>
                <li>Failed repayment will revert the entire transaction</li>
                <li>Test thoroughly on testnets before mainnet deployment</li>
              </ul>
            </div>

            <div className="api-section">
              <h3>🏭 Creating Executors with ExecutorFactory</h3>
              <p>Use the <code>ERC20FlashLoanExecutorFactory</code> to create and manage flash loan executor contracts:</p>
              
              <h4>📦 Simple Executor Creation</h4>
              <p>Create a reusable executor contract for multiple operations:</p>
              <div className="code-container">
                <pre className="code-block">
{`// Get the factory contract
address factoryAddress = getContractAddress('ERC20FlashLoanExecutorFactory', chainId);
IERC20FlashLoanExecutorFactory factory = IERC20FlashLoanExecutorFactory(factoryAddress);

// Create your personal executor (once per user)
address executorAddress = factory.createExecutor();
IERC20FlashLoanExecutor executor = IERC20FlashLoanExecutor(executorAddress);

// Now use your executor for multiple flash loans
executor.executeFlashLoan(tokenAddress, amount, operations);`}
                </pre>
              </div>

              <h4>⚡ One-Shot Flash Loan Execution</h4>
              <p>Create executor and execute flash loan in a single transaction:</p>
              <div className="code-container">
                <pre className="code-block">
{`// Prepare your operations array
Operation[] memory operations = new Operation[](3);

operations[0] = Operation({
    target: tokenA,
    data: abi.encodeCall(IERC20.approve, (dexRouter, borrowAmount)),
    value: 0
});

operations[1] = Operation({
    target: dexRouter,
    data: abi.encodeCall(IRouter.swap, (swapParams)),
    value: 0
});

// CRITICAL: Always include repayment as final operation
operations[2] = Operation({
    target: tokenA,
    data: abi.encodeCall(IERC20.transfer, (flashLender, totalRepayment)),
    value: 0
});

// Create executor and execute flash loan atomically
address executorAddress = factory.createAndExecuteFlashLoan(
    tokenAddress,
    borrowAmount,
    operations
);

// You now own the executor contract for future use
IERC20FlashLoanExecutor executor = IERC20FlashLoanExecutor(executorAddress);`}
                </pre>
              </div>

              <h4>🔄 Multi-Token One-Shot Execution</h4>
              <p>Create executor and execute multi-token flash loan:</p>
              <div className="code-container">
                <pre className="code-block">
{`// Setup multi-token borrowing
address[] memory tokens = new address[](2);
tokens[0] = tokenA;
tokens[1] = tokenB;

uint256[] memory amounts = new uint256[](2);
amounts[0] = amountA;
amounts[1] = amountB;

// Operations must handle repayment for ALL borrowed tokens
Operation[] memory operations = buildMultiTokenOperations(tokens, amounts);

// Create and execute multi-token flash loan
address executorAddress = factory.createAndExecuteMultiFlashLoan(
    tokens,
    amounts,
    operations
);`}
                </pre>
              </div>

              <h4>💡 Factory Benefits</h4>
              <ul>
                <li><strong>Gas Efficient:</strong> Factory optimizes executor creation</li>
                <li><strong>One-Shot Operations:</strong> Create and execute in single transaction</li>
                <li><strong>Ownership Transfer:</strong> You automatically become executor owner</li>
                <li><strong>Reusable:</strong> Keep executor for future flash loans</li>
                <li><strong>Security:</strong> Factory ensures proper initialization</li>
                <li><strong>Rescue funds:</strong> Execute arbitrary calls to rescue any funds left</li>
              </ul>
            </div>

            <div className="api-section">
              <h3>🎯 Atomic Operations with FlashLoanExecutor</h3>
              <p>The <code>params</code> data in flash loan functions should contain encoded atomic operations. Use the <code>ERC20FlashLoanExecutor</code> contract for complex multi-step operations:</p>
              
              <h4>Operation Structure</h4>
              <div className="code-container">
                <pre className="code-block">
{`struct Operation {
    address target;     // Contract address to call
    bytes data;         // Encoded function call data
    uint256 value;      // ETH value to send (usually 0)
}`}
                </pre>
              </div>

              <h4>Using FlashLoanExecutor</h4>
              <div className="code-container">
                <pre className="code-block">
{`// Deploy your own executor (once per user)
ERC20FlashLoanExecutor executor = new ERC20FlashLoanExecutor(
    flashLenderAddress,
    msg.sender  // You become the owner
);

// Create operations array for arbitrage example
Operation[] memory operations = new Operation[](5);

// 1. Approve borrowed token for DEX
operations[0] = Operation({
    target: borrowedToken,
    data: abi.encodeCall(IERC20.approve, (dexRouter, borrowAmount)),
    value: 0
});

// 2. Swap tokens on DEX 1
operations[1] = Operation({
    target: dexRouter1,
    data: abi.encodeCall(IRouter.swapExactTokensForTokens, (
        borrowAmount,
        minAmountOut,
        path,
        address(executor),
        deadline
    )),
    value: 0
});

// 3. Approve received tokens for DEX 2
operations[2] = Operation({
    target: receivedToken,
    data: abi.encodeCall(IERC20.approve, (dexRouter2, receivedAmount)),
    value: 0
});

// 4. Swap back on DEX 2
operations[3] = Operation({
    target: dexRouter2,
    data: abi.encodeCall(IRouter.swapExactTokensForTokens, (
        receivedAmount,
        minRepayAmount,
        reversePath,
        address(executor),
        deadline
    )),
    value: 0
});

// 5. Repay flash loan (CRITICAL!)
operations[4] = Operation({
    target: borrowedToken,
    data: abi.encodeCall(IERC20.transfer, (flashLender, totalRepayment)),
    value: 0
});

// Execute the flash loan with all operations
executor.executeFlashLoan(tokenAddress, borrowAmount, operations);`}
                </pre>
              </div>

              <h4>Multi-Token Flash Loans</h4>
              <div className="code-container">
                <pre className="code-block">
{`// For borrowing multiple tokens simultaneously
address[] memory tokens = new address[](2);
tokens[0] = tokenA;
tokens[1] = tokenB;

uint256[] memory amounts = new uint256[](2);
amounts[0] = amountA;
amounts[1] = amountB;

// Operations array includes repayment for ALL borrowed tokens
executor.executeMultiFlashLoan(tokens, amounts, operations);`}
                </pre>
              </div>
            </div>

            <div className="api-section">
              <h3>⚙️ Direct Implementation (Advanced)</h3>
              <p>For custom implementations, encode operations in the params field:</p>
              <div className="code-container">
                <pre className="code-block">
{`// Example: Encoding operations for direct flash loan call
Operation[] memory operations = /* your operations */;
bytes memory params = abi.encode(operations);

// Call flash loan directly
IFlashLender(flashLender).flashLoan(
    receiverAddress,    // Your contract or executor
    asset,
    amount,
    params             // Encoded operations
);`}
                </pre>
              </div>
            </div>

            <div className="api-section">
              <h3>📊 Fee Structure</h3>
              <ul>
                <li><strong>LP Fee:</strong> Configurable per token (default 0.01%)</li>
                <li><strong>Management Fee:</strong> Percentage of LP fee taken by protocol</li>
                <li><strong>Calculation:</strong> Total fee = (amount × lpFee) / 10000</li>
              </ul>
            </div>

            <div className="api-section">
              <h3>⚠️ Important Notes</h3>
              <ul>
                <li>Always approve the flash lender to spend the repayment amount</li>
                <li>Ensure your contract has sufficient balance for repayment + fees</li>
                <li>Flash loan execution must complete in a single transaction</li>
                <li>Failed repayment will revert the entire transaction</li>
                <li>Test thoroughly on testnets before mainnet deployment</li>
              </ul>
            </div>

            <div className="api-section">
              <h3>💡 Programmatic Access</h3>
              <p>Get contract addresses in your code:</p>
              <div className="code-container">
                <pre className="code-block">
{`import { getContractAddress } from './config';

// Get ERC20FlashLender address for current network
const flashLender = getContractAddress('ERC20FlashLender', chainId);

// Get ExecutorFactory address
const executorFactory = getContractAddress('ERC20FlashLoanExecutorFactory', chainId);`}
                </pre>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}