import { expect } from "chai";
import { ethers } from "hardhat";
import { parseEther, formatEther } from "ethers";
import {
  ERC20FlashLender,
  ERC20FlashLoanExecutor
} from "../../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Import actual Uniswap V2 contract ABIs
const UniswapV2FactoryABI = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const UniswapV2Router02ABI = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const UniswapV2PairABI = require("@uniswap/v2-core/build/UniswapV2Pair.json");

describe("Arbitrage Integration Test - Uniswap V2", function () {
  let flashLender: ERC20FlashLender;
  let executor: ERC20FlashLoanExecutor;
  let factory1: any; // UniswapV2Factory
  let factory2: any; // UniswapV2Factory  
  let router1: any;   // UniswapV2Router02
  let router2: any;   // UniswapV2Router02
  let test1Token: any;      // TEST1 token
  let test2Token: any;      // TEST2 token
  let weth: any;       // WETH for router
  let pair1: any;       // UniswapV2Pair
  let pair2: any;       // UniswapV2Pair
  let pair1Address: string;
  let pair2Address: string;

  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let liquidityProvider: SignerWithAddress;

  const INITIAL_SUPPLY = parseEther("1000000"); // 1M tokens
  const LIQUIDITY_AMOUNT_1 = parseEther("10000"); // 10K TEST1
  const LIQUIDITY_AMOUNT_2 = parseEther("10000"); // 10K TEST2

  beforeEach(async function () {
    [owner, user, liquidityProvider] = await ethers.getSigners();

    // Deploy flash lender
    const FlashLender = await ethers.getContractFactory("ERC20FlashLender");
    flashLender = await FlashLender.deploy();
    await flashLender.initialize(0); // 0% management fee

    // Deploy executor
    const Executor = await ethers.getContractFactory("ERC20FlashLoanExecutor");
    executor = await Executor.deploy(flashLender.target, user.address);

    // Deploy test tokens using TEST1Token and TEST2Token
    const TEST1Factory = await ethers.getContractFactory("TEST1Token");
    const TEST2Factory = await ethers.getContractFactory("TEST2Token");
    test1Token = await TEST1Factory.deploy(INITIAL_SUPPLY);
    test2Token = await TEST2Factory.deploy(INITIAL_SUPPLY);

    // Deploy WETH mock
    const WETHFactory = await ethers.getContractFactory("MockWETH");
    weth = await WETHFactory.deploy();

    // Transfer tokens to liquidityProvider for pool setup
    await test1Token.transfer(liquidityProvider.address, parseEther("100000")); // 100K TEST1
    await test2Token.transfer(liquidityProvider.address, parseEther("100000")); // 100K TEST2

    // Deploy DEX 1 using Uniswap V2 contracts
    const Factory1 = await ethers.getContractFactory(
      UniswapV2FactoryABI.abi,
      UniswapV2FactoryABI.bytecode
    );
    factory1 = await Factory1.deploy(owner.address); // feeToSetter
    
    const Router1 = await ethers.getContractFactory(
      UniswapV2Router02ABI.abi,
      UniswapV2Router02ABI.bytecode
    );
    router1 = await Router1.deploy(factory1.target, weth.target);

    // Deploy DEX 2 using Uniswap V2 contracts
    const Factory2 = await ethers.getContractFactory(
      UniswapV2FactoryABI.abi,
      UniswapV2FactoryABI.bytecode
    );
    factory2 = await Factory2.deploy(owner.address); // feeToSetter
    
    const Router2 = await ethers.getContractFactory(
      UniswapV2Router02ABI.abi,
      UniswapV2Router02ABI.bytecode
    );
    router2 = await Router2.deploy(factory2.target, weth.target);

    // Approve and deposit tokens to flash lender
    await test1Token.approve(flashLender.target, parseEther("50000"));
    await test2Token.approve(flashLender.target, parseEther("50000"));
    
    await flashLender.deposit(test1Token.target, parseEther("50000"));
    await flashLender.deposit(test2Token.target, parseEther("50000"));
  });

  async function setupPools() {
    // Check if pairs already exist to avoid PAIR_EXISTS error
    let tempPair1Address = await factory1.getPair(test1Token.target, test2Token.target);
    let tempPair2Address = await factory2.getPair(test1Token.target, test2Token.target);
    
    // Create pairs only if they don't exist
    if (tempPair1Address === "0x0000000000000000000000000000000000000000") {
      await factory1.createPair(test1Token.target, test2Token.target);
      tempPair1Address = await factory1.getPair(test1Token.target, test2Token.target);
    }
    
    if (tempPair2Address === "0x0000000000000000000000000000000000000000") {
      await factory2.createPair(test1Token.target, test2Token.target);
      tempPair2Address = await factory2.getPair(test1Token.target, test2Token.target);
    }

    // Update global variables
    pair1Address = tempPair1Address;
    pair2Address = tempPair2Address;

    // Use UniswapV2Pair interface
    pair1 = await ethers.getContractAt(UniswapV2PairABI.abi, pair1Address);
    pair2 = await ethers.getContractAt(UniswapV2PairABI.abi, pair2Address);

    // Setup liquidity on DEX1 with 1:1 ratio using Uniswap V2 router
    await test1Token.connect(liquidityProvider).approve(router1.target, parseEther("200000"));
    await test2Token.connect(liquidityProvider).approve(router1.target, parseEther("200000"));
    
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    await router1.connect(liquidityProvider).addLiquidity(
      test1Token.target,
      test2Token.target,
      LIQUIDITY_AMOUNT_1,
      LIQUIDITY_AMOUNT_2,
      0, // amountAMin
      0, // amountBMin
      liquidityProvider.address,
      deadline
    );

    // Setup liquidity on DEX2 with different ratio to create arbitrage opportunity
    const dex2Amount1 = parseEther("10000");
    const dex2Amount2 = parseEther("5000"); // Much less TEST2 makes TEST1 cheaper

    await test1Token.connect(liquidityProvider).approve(router2.target, parseEther("200000"));
    await test2Token.connect(liquidityProvider).approve(router2.target, parseEther("200000"));
    
    await router2.connect(liquidityProvider).addLiquidity(
      test1Token.target,
      test2Token.target,
      dex2Amount1,
      dex2Amount2,
      0, // amountAMin
      0, // amountBMin
      liquidityProvider.address,
      deadline
    );

    // Log the reserves to confirm setup
    const reserves1 = await pair1.getReserves();
    const reserves2 = await pair2.getReserves();
    
    // Check which token is token0 and token1 to display reserves correctly
    const token0_1 = await pair1.token0();
    const token1_1 = await pair1.token1();
    const token0_2 = await pair2.token0();
    const token1_2 = await pair2.token1();
    
    console.log(`\nDEX1 Pair - token0: ${token0_1}, token1: ${token1_1}`);
    console.log(`DEX1 Reserves: ${formatEther(reserves1[0])}, ${formatEther(reserves1[1])}`);
    console.log(`DEX2 Pair - token0: ${token0_2}, token1: ${token1_2}`);
    console.log(`DEX2 Reserves: ${formatEther(reserves2[0])}, ${formatEther(reserves2[1])}`);
    
    // Map reserves to TEST1/TEST2 for clarity
    if (token0_1.toLowerCase() === test1Token.target.toLowerCase()) {
      console.log(`DEX1: ${formatEther(reserves1[0])} TEST1, ${formatEther(reserves1[1])} TEST2`);
    } else {
      console.log(`DEX1: ${formatEther(reserves1[1])} TEST1, ${formatEther(reserves1[0])} TEST2`);
    }
    
    if (token0_2.toLowerCase() === test1Token.target.toLowerCase()) {
      console.log(`DEX2: ${formatEther(reserves2[0])} TEST1, ${formatEther(reserves2[1])} TEST2`);
    } else {
      console.log(`DEX2: ${formatEther(reserves2[1])} TEST1, ${formatEther(reserves2[0])} TEST2`);
    }
  }

  async function calculateArbitrageOpportunity(borrowAmount: bigint) {
    // Get current reserves from both pairs
    const reserves1 = await pair1.getReserves();
    const reserves2 = await pair2.getReserves();

    // Determine token order in pairs (Uniswap sorts by address)
    const token0_1 = await pair1.token0();
    const token1_1 = await pair1.token1();
    const token0_2 = await pair2.token0();
    const token1_2 = await pair2.token1();

    // Map reserves to correct tokens for DEX1
    let reserve1_TEST1, reserve1_TEST2;
    if (token0_1.toLowerCase() === test1Token.target.toLowerCase()) {
      reserve1_TEST1 = reserves1[0];
      reserve1_TEST2 = reserves1[1];
    } else {
      reserve1_TEST1 = reserves1[1];
      reserve1_TEST2 = reserves1[0];
    }

    // Map reserves to correct tokens for DEX2
    let reserve2_TEST1, reserve2_TEST2;
    if (token0_2.toLowerCase() === test1Token.target.toLowerCase()) {
      reserve2_TEST1 = reserves2[0];
      reserve2_TEST2 = reserves2[1];
    } else {
      reserve2_TEST1 = reserves2[1];
      reserve2_TEST2 = reserves2[0];
    }

    // Calculate price on each DEX (TEST2 per TEST1)
    const price1 = Number(reserve1_TEST2) / Number(reserve1_TEST1);
    const price2 = Number(reserve2_TEST2) / Number(reserve2_TEST1);

    console.log(`DEX1 Price: ${price1.toFixed(6)} TEST2 per TEST1`);
    console.log(`DEX2 Price: ${price2.toFixed(6)} TEST2 per TEST1`);

    // Check arbitrage direction
    if (price1 > price2) {
      // Buy TEST1 on DEX2 (cheaper), sell on DEX1 (more expensive)
      console.log("Arbitrage opportunity: Buy TEST1 on DEX2, sell on DEX1");
      
      // Calculate output for swapping TEST2 to TEST1 on DEX2
      const amountOut = await router2.getAmountsOut(borrowAmount, [test2Token.target, test1Token.target]);
      const test1Received = amountOut[1];
      
      // Calculate output for swapping TEST1 to TEST2 on DEX1
      const amountOut2 = await router1.getAmountsOut(test1Received, [test1Token.target, test2Token.target]);
      const test2Received = amountOut2[1];
      
      const profit = test2Received - borrowAmount;
      
      console.log(`Borrow ${formatEther(borrowAmount)} TEST2`);
      console.log(`Get ${formatEther(test1Received)} TEST1 from DEX2`);
      console.log(`Get ${formatEther(test2Received)} TEST2 from DEX1`);
      console.log(`Profit: ${formatEther(profit)} TEST2`);
      
      return {
        profitable: profit > 0n,
        profit,
        direction: "TEST2->TEST1->TEST2",
        borrowToken: test2Token.target,
        intermediateAmount: test1Received
      };
    } else {
      // Buy TEST1 on DEX1 (cheaper), sell on DEX2 (more expensive)
      console.log("Arbitrage opportunity: Buy TEST1 on DEX1, sell on DEX2");
      
      // Calculate similar for the opposite direction
      const amountOut = await router1.getAmountsOut(borrowAmount, [test2Token.target, test1Token.target]);
      const test1Received = amountOut[1];
      
      const amountOut2 = await router2.getAmountsOut(test1Received, [test1Token.target, test2Token.target]);
      const test2Received = amountOut2[1];
      
      const profit = test2Received - borrowAmount;
      
      console.log(`Borrow ${formatEther(borrowAmount)} TEST2`);
      console.log(`Get ${formatEther(test1Received)} TEST1 from DEX1`);
      console.log(`Get ${formatEther(test2Received)} TEST2 from DEX2`);
      console.log(`Profit: ${formatEther(profit)} TEST2`);
      
      return {
        profitable: profit > 0n,
        profit,
        direction: "TEST2->TEST1->TEST2",
        borrowToken: test2Token.target,
        intermediateAmount: test1Received
      };
    }
  }

  async function executeArbitrage(borrowAmount: bigint) {
    // Create operations for the executor
    const test1Address = test1Token.target;
    const test2Address = test2Token.target;
    const router1Address = router1.target;
    const router2Address = router2.target;
    const executorAddress = executor.target;
    const flashLenderAddress = flashLender.target;

    // Calculate expected amounts
    const opportunity = await calculateArbitrageOpportunity(borrowAmount);
    console.log(`Execute check - isProfitable: ${opportunity.profitable}, profit: ${formatEther(opportunity.profit)}`);
    
    if (!opportunity.profitable) {
      throw new Error(`Arbitrage not profitable: ${formatEther(opportunity.profit)} TEST2 profit`);
    }

    // Calculate flash loan fees (same as in the flash lender contract)
    const DEFAULT_LP_FEE_BPS = 1n; // 0.01%
    const managementFeePercentage = 0n; // 0% as set in beforeEach
    
    const lpFee = (borrowAmount * DEFAULT_LP_FEE_BPS) / 10000n;
    const mgmtFee = (borrowAmount * DEFAULT_LP_FEE_BPS * managementFeePercentage) / 100000000n;
    const totalFee = lpFee + mgmtFee;
    const totalRepayment = borrowAmount + totalFee;

    console.log(`Flash loan details: borrow ${formatEther(borrowAmount)}, fee ${formatEther(totalFee)}, total repayment ${formatEther(totalRepayment)}`);

    // Create ERC20 interface for encoding function calls
    const ERC20Interface = new ethers.Interface([
      "function approve(address spender, uint256 amount) returns (bool)",
      "function transfer(address to, uint256 amount) returns (bool)"
    ]);

    // Create Router interface for encoding function calls  
    const RouterInterface = new ethers.Interface([
      "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])"
    ]);

    const operations = [
      // Operation 1: Approve TEST2 for router2 (first DEX to buy TEST1 cheap)
      {
        target: test2Address,
        data: ERC20Interface.encodeFunctionData("approve", [router2Address, borrowAmount]),
        value: 0
      },
      
      // Operation 2: Swap TEST2 → TEST1 on DEX2 (buy TEST1 at lower price)
      {
        target: router2Address,
        data: RouterInterface.encodeFunctionData("swapExactTokensForTokens", [
          borrowAmount,
          0, // Accept any amount of TEST1
          [test2Address, test1Address],
          executorAddress,
          Math.floor(Date.now() / 1000) + 3600
        ]),
        value: 0
      },

      // Operation 3: Approve TEST1 for router1 (use expected amount from calculation)
      {
        target: test1Address,
        data: ERC20Interface.encodeFunctionData("approve", [router1Address, opportunity.intermediateAmount]),
        value: 0
      },

      // Operation 4: Swap TEST1 → TEST2 on DEX1 (sell TEST1 at higher price)
      {
        target: router1Address,
        data: RouterInterface.encodeFunctionData("swapExactTokensForTokens", [
          opportunity.intermediateAmount,
          totalRepayment, // Must get at least enough to repay loan + fees
          [test1Address, test2Address],
          executorAddress,
          Math.floor(Date.now() / 1000) + 3600
        ]),
        value: 0
      },

      // Operation 5: Repay flash loan with fees
      {
        target: test2Address,
        data: ERC20Interface.encodeFunctionData("transfer", [flashLenderAddress, totalRepayment]),
        value: 0
      }
    ];

    // Execute flash loan with operations
    return await executor.connect(user).executeFlashLoan(
      opportunity.borrowToken,
      borrowAmount,
      operations
    );
  }

  it("Should execute profitable arbitrage using Uniswap V2", async function () {
    await setupPools();

    // Calculate arbitrage opportunity
    const borrowAmount = parseEther("1000"); // Borrow 1000 TEST2
    const opportunity = await calculateArbitrageOpportunity(borrowAmount);

    expect(opportunity.profitable).to.be.true;
    expect(opportunity.profit).to.be.gt(0);

    console.log(`\nExecuting arbitrage with ${formatEther(borrowAmount)} TEST2...`);

    // Get initial balances of the executor (where profits will accumulate)
    const initialExecutorBalance = await test2Token.balanceOf(executor.target);
    const initialUserBalance = await test2Token.balanceOf(user.address);
    
    console.log(`Initial executor balance: ${formatEther(initialExecutorBalance)} TEST2`);
    console.log(`Initial user balance: ${formatEther(initialUserBalance)} TEST2`);
    
    // Execute the arbitrage using flash loan
    const executeArbitrageTx = await executeArbitrage(borrowAmount);
    await executeArbitrageTx.wait();

    // Check final balances
    const finalExecutorBalance = await test2Token.balanceOf(executor.target);
    const finalUserBalance = await test2Token.balanceOf(user.address);
    const executorProfit = finalExecutorBalance - initialExecutorBalance;
    const userProfit = finalUserBalance - initialUserBalance;

    console.log(`Final executor balance: ${formatEther(finalExecutorBalance)} TEST2`);
    console.log(`Final user balance: ${formatEther(finalUserBalance)} TEST2`);
    console.log(`Executor profit: ${formatEther(executorProfit)} TEST2`);
    console.log(`User profit: ${formatEther(userProfit)} TEST2`);
    console.log(`Expected profit: ${formatEther(opportunity.profit)} TEST2`);

    // The profit should be in the executor contract
    expect(executorProfit).to.be.gt(0);
    expect(executorProfit).to.be.approximately(opportunity.profit, parseEther("0.1")); // Allow 0.1 TEST2 tolerance
  });

  it("Should handle different arbitrage amounts", async function () {
    await setupPools();

    const amounts = [parseEther("100"), parseEther("500"), parseEther("1000"), parseEther("2000")];

    for (const amount of amounts) {
      console.log(`\nTesting arbitrage with ${formatEther(amount)} TEST2...`);
      const opportunity = await calculateArbitrageOpportunity(amount);
      
      if (opportunity.profitable) {
        console.log(`Profitable! Expected profit: ${formatEther(opportunity.profit)} TEST2`);
      } else {
        console.log(`Not profitable. Loss: ${formatEther(-opportunity.profit)} TEST2`);
      }
    }
  });

  it("Should show pool state after arbitrage", async function () {
    await setupPools();

    console.log("\n=== BEFORE ARBITRAGE ===");
    const beforeReserves1 = await pair1.getReserves();
    const beforeReserves2 = await pair2.getReserves();
    console.log(`DEX1 Reserves: ${formatEther(beforeReserves1[0])}, ${formatEther(beforeReserves1[1])}`);
    console.log(`DEX2 Reserves: ${formatEther(beforeReserves2[0])}, ${formatEther(beforeReserves2[1])}`);

    // Execute arbitrage
    const borrowAmount = parseEther("1000");
    await executeArbitrage(borrowAmount);

    console.log("\n=== AFTER ARBITRAGE ===");
    const afterReserves1 = await pair1.getReserves();
    const afterReserves2 = await pair2.getReserves();
    console.log(`DEX1 Reserves: ${formatEther(afterReserves1[0])}, ${formatEther(afterReserves1[1])}`);
    console.log(`DEX2 Reserves: ${formatEther(afterReserves2[0])}, ${formatEther(afterReserves2[1])}`);

    // Prices should be closer now
    const opportunity = await calculateArbitrageOpportunity(borrowAmount);
    console.log(`\nNew arbitrage opportunity profit: ${formatEther(opportunity.profit)} TEST2`);
  });
});
