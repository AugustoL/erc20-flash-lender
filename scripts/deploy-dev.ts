import hre from "hardhat";
import { ERC20FlashLender, MockERC20, ERC20FlashLoanExecutor } from "../typechain-types";

// Import actual Uniswap V2 contract ABIs
const UniswapV2FactoryABI = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const UniswapV2Router02ABI = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const UniswapV2PairABI = require("@uniswap/v2-core/build/UniswapV2Pair.json");
const WETH9ABI = require("@uniswap/v2-periphery/build/WETH9.json");

async function main() {
    console.log("🏠 Starting ERC20FlashLender DEVELOPMENT deployment...");
    
    const [deployer, user1, user2, user3] = await hre.ethers.getSigners();
    const network = hre.network.name;
    
    console.log("📡 Network:", network);
    console.log("👤 Deployer:", deployer.address);
    console.log("💰 Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");
    
    // Additional test accounts for development
    console.log("\n👥 Additional test accounts:");
    console.log("🧑 User1:", user1.address, "Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(user1.address)), "ETH");
    console.log("🧑 User2:", user2.address, "Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(user2.address)), "ETH");
    console.log("🧑 User3:", user3.address, "Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(user3.address)), "ETH");

    // Development parameters - lower management fee for testing
    const managementFeePercentage = 0; // 0% of LP fee for dev
    console.log("⚙️  Development Management fee:", managementFeePercentage / 100, "% of LP fee");

    // Deploy the contract
    console.log("\n📦 Deploying ERC20FlashLender...");
    const ERC20FlashLender = await hre.ethers.getContractFactory("ERC20FlashLender");
    
    const lender = await ERC20FlashLender.deploy() as ERC20FlashLender;
    await lender.waitForDeployment();
    
    const lenderAddress = await lender.getAddress();
    console.log("✅ Contract deployed to:", lenderAddress);

    // Initialize the contract
    console.log("\n🔧 Initializing contract...");
    try {
        const initTx = await lender.initialize(managementFeePercentage);
        await initTx.wait();
        console.log("✅ Contract initialized");
    } catch (error) {
        console.error("❌ Initialization failed:", error);
        throw error;
    }

    // Deploy test ERC20 tokens for development
    console.log("\n🪙 Deploying test ERC20 tokens...");
    
    // Deploy multiple test tokens with different decimals and supplies
    const testTokens = [
        { name: "Test Token 1", symbol: "TEST1", decimals: 18, supply: "1000000" }, // 1M TEST1
        { name: "Test Token 2", symbol: "TEST2", decimals: 18, supply: "1000000" }, // 1M TEST2
        { name: "Test USDC", symbol: "TUSDC", decimals: 6, supply: "1000000000" }, // 1B TUSDC
        { name: "Test DAI", symbol: "TDAI", decimals: 18, supply: "1000000000" }, // 1B TDAI
    ];

    const deployedTokens: Array<{
        name: string;
        symbol: string;
        address: string;
        decimals: number;
        contract: MockERC20;
    }> = [];
    
    for (const tokenConfig of testTokens) {
        const TestToken = await hre.ethers.getContractFactory("MockERC20");
        const token = await TestToken.deploy(
            hre.ethers.parseUnits(tokenConfig.supply, tokenConfig.decimals), 
            tokenConfig.name, 
            tokenConfig.symbol,
            tokenConfig.decimals
        ) as MockERC20;
        await token.waitForDeployment();
        
        const tokenAddress = await token.getAddress();
        deployedTokens.push({
            name: tokenConfig.name,
            symbol: tokenConfig.symbol,
            address: tokenAddress,
            decimals: tokenConfig.decimals,
            contract: token
        });
        
        console.log(`  ✅ ${tokenConfig.symbol} deployed to: ${tokenAddress}`);
        
        // Distribute tokens to test accounts
        const amount = hre.ethers.parseUnits((Number(tokenConfig.supply) / 10).toString(), tokenConfig.decimals);
        await token.transfer(user1.address, amount);
        await token.transfer(user2.address, amount);
        await token.transfer(user3.address, amount);
        
        console.log(`    📤 Distributed ${hre.ethers.formatUnits(amount, tokenConfig.decimals)} ${tokenConfig.symbol} to each test account`);
    }

    // Verify deployment
    console.log("\n🔍 Verifying deployment...");
    const deployedManagementFee = await lender.managementFeePercentage();
    const owner = await lender.owner();
    const defaultLpFee = await lender.DEFAULT_LP_FEE_BPS();
    const maxLpFee = await lender.MAX_LP_FEE_BPS();
    const maxMgmtFee = await lender.MAX_MANAGEMENT_FEE_PERCENTAGE();
    const minDeposit = await lender.MINIMUM_DEPOSIT();
    const virtualShares = await lender.VIRTUAL_SHARES();
    const entryExitFee = await lender.ENTRY_EXIT_FEE();
    
    console.log("📊 Contract Configuration:");
    console.log("  - Management Fee:", (Number(deployedManagementFee) / 100).toString(), "% of LP fee");
    console.log("  - Default LP Fee:", defaultLpFee.toString(), "bps (0.01%)");
    console.log("  - Max LP Fee:", maxLpFee.toString(), "bps (1%)");
    console.log("  - Max Management Fee:", (Number(maxMgmtFee) / 100).toString(), "% of LP fee");
    console.log("  - Minimum Deposit:", minDeposit.toString(), "wei");
    console.log("  - Virtual Shares:", virtualShares.toString());
    console.log("  - Entry/Exit Fee:", entryExitFee.toString(), "wei");
    console.log("  - Owner:", owner);

    // Make some test deposits for development
    console.log("\n💰 Making test deposits for development...");
    
    for (const token of deployedTokens) {
        try {
            // Approve and deposit from user1
            const depositAmount = hre.ethers.parseUnits("1000", token.decimals);
            await token.contract.connect(user1).approve(lenderAddress, depositAmount);
            
            const depositTx = await lender.connect(user1).deposit(token.address, depositAmount);
            await depositTx.wait();
            
            // Get contract balance using totalLiquidity mapping
            const balance = await lender.totalLiquidity(token.address);
            console.log(`  ✅ Deposited ${hre.ethers.formatUnits(depositAmount, token.decimals)} ${token.symbol}`);
            console.log(`     Contract balance: ${hre.ethers.formatUnits(balance, token.decimals)} ${token.symbol}`);
            
        } catch (error) {
            console.log(`  ⚠️  Could not deposit ${token.symbol}:`, (error as Error).message);
        }
    }

    // Deploy WETH for UniswapV2 routers
    console.log("\n💎 Deploying WETH...");
    const WETHFactory = new hre.ethers.ContractFactory(
        WETH9ABI.abi,
        WETH9ABI.bytecode,
        deployer
    );
    const wethContract = await WETHFactory.deploy();
    await wethContract.waitForDeployment();
    const wethAddress = await wethContract.getAddress();
    console.log("✅ WETH deployed to:", wethAddress);

    // Deploy UniswapV2 factories and routers
    console.log("\n🏭 Deploying UniswapV2 infrastructure...");
    
    // Deploy DEX 1 (UniswapV2)
    const Factory1 = new hre.ethers.ContractFactory(
        UniswapV2FactoryABI.abi,
        UniswapV2FactoryABI.bytecode,
        deployer
    );
    const factory1Contract = await Factory1.deploy(deployer.address); // feeToSetter
    await factory1Contract.waitForDeployment();
    const factory1Address = await factory1Contract.getAddress();
    
    const Router1 = new hre.ethers.ContractFactory(
        UniswapV2Router02ABI.abi,
        UniswapV2Router02ABI.bytecode,
        deployer
    );
    const router1Contract = await Router1.deploy(factory1Address, wethAddress);
    await router1Contract.waitForDeployment();
    const router1Address = await router1Contract.getAddress();
    
    // Get contract interfaces
    const factory1 = await hre.ethers.getContractAt(UniswapV2FactoryABI.abi, factory1Address) as any;
    const router1 = await hre.ethers.getContractAt(UniswapV2Router02ABI.abi, router1Address) as any;
    
    console.log("✅ DEX1 Factory deployed to:", factory1Address);
    console.log("✅ DEX1 Router deployed to:", router1Address);

    // Deploy DEX 2 (UniswapV2)
    const Factory2 = new hre.ethers.ContractFactory(
        UniswapV2FactoryABI.abi,
        UniswapV2FactoryABI.bytecode,
        deployer
    );
    const factory2Contract = await Factory2.deploy(deployer.address); // feeToSetter
    await factory2Contract.waitForDeployment();
    const factory2Address = await factory2Contract.getAddress();
    
    const Router2 = new hre.ethers.ContractFactory(
        UniswapV2Router02ABI.abi,
        UniswapV2Router02ABI.bytecode,
        deployer
    );
    const router2Contract = await Router2.deploy(factory2Address, wethAddress);
    await router2Contract.waitForDeployment();
    const router2Address = await router2Contract.getAddress();
    
    // Get contract interfaces
    const factory2 = await hre.ethers.getContractAt(UniswapV2FactoryABI.abi, factory2Address) as any;
    const router2 = await hre.ethers.getContractAt(UniswapV2Router02ABI.abi, router2Address) as any;
    
    console.log("✅ DEX2 Factory deployed to:", factory2Address);
    console.log("✅ DEX2 Router deployed to:", router2Address);

    // Deploy flash loan executors for users
    console.log("\n⚡ Deploying flash loan executors...");
    const ExecutorFactory = await hre.ethers.getContractFactory("ERC20FlashLoanExecutor");
    
    const executor1 = await ExecutorFactory.deploy(lenderAddress, user1.address) as ERC20FlashLoanExecutor;
    await executor1.waitForDeployment();
    const executor1Address = await executor1.getAddress();
    
    const executor2 = await ExecutorFactory.deploy(lenderAddress, user2.address) as ERC20FlashLoanExecutor;
    await executor2.waitForDeployment();
    const executor2Address = await executor2.getAddress();
    
    console.log("✅ User1 Executor deployed to:", executor1Address);
    console.log("✅ User2 Executor deployed to:", executor2Address);

    // Create UniswapV2 pairs and setup liquidity for arbitrage
    console.log("\n💱 Setting up UniswapV2 pairs and liquidity...");
    
    // Get TEST1 and TEST2 tokens
    const test1Token = deployedTokens.find(t => t.symbol === "TEST1")!;
    const test2Token = deployedTokens.find(t => t.symbol === "TEST2")!;
    const tusdcToken = deployedTokens.find(t => t.symbol === "TUSDC")!;
    const tdaiToken = deployedTokens.find(t => t.symbol === "TDAI")!;
    
    // Create pairs on both DEXs (TEST1/TEST2)
    await factory1.createPair(test1Token.address, test2Token.address);
    const pair1Address = await factory1.getPair(test1Token.address, test2Token.address);
    
    await factory2.createPair(test1Token.address, test2Token.address);
    const pair2Address = await factory2.getPair(test1Token.address, test2Token.address);
    
    console.log("✅ DEX1 TEST1/TEST2 Pair created:", pair1Address);
    console.log("✅ DEX2 TEST1/TEST2 Pair created:", pair2Address);

    // Create TUSDC/TDAI pairs for additional arbitrage opportunities
    await factory1.createPair(tusdcToken.address, tdaiToken.address);
    const usdcDaiPair1Address = await factory1.getPair(tusdcToken.address, tdaiToken.address);
    
    await factory2.createPair(tusdcToken.address, tdaiToken.address);
    const usdcDaiPair2Address = await factory2.getPair(tusdcToken.address, tdaiToken.address);
    
    console.log("✅ DEX1 TUSDC/TDAI Pair created:", usdcDaiPair1Address);
    console.log("✅ DEX2 TUSDC/TDAI Pair created:", usdcDaiPair2Address);

    // Setup liquidity with different ratios to create arbitrage opportunities
    console.log("\n💧 Adding liquidity to create arbitrage opportunities...");
    
    // Use larger liquidity pools to maintain arbitrage opportunities after trades
    const liquidityAmount1 = hre.ethers.parseEther("100000"); // 100K TEST1
    const liquidityAmount2 = hre.ethers.parseEther("100000"); // 100K TEST2
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // DEX1: 1:1 ratio (100K TEST1 : 100K TEST2)
    await test1Token.contract.approve(router1Address, liquidityAmount1);
    await test2Token.contract.approve(router1Address, liquidityAmount2);
    
    await router1.addLiquidity(
        test1Token.address,
        test2Token.address,
        liquidityAmount1,
        liquidityAmount2,
        0, // amountAMin
        0, // amountBMin
        deployer.address,
        deadline
    );
    console.log("✅ DEX1 liquidity added: 100K TEST1 : 100K TEST2 (1:1 ratio)");

    // DEX2: 2:1 ratio (100K TEST1 : 50K TEST2) - makes TEST1 cheaper on DEX2
    const dex2Amount2 = hre.ethers.parseEther("50000"); // 50K TEST2
    
    await test1Token.contract.approve(router2Address, liquidityAmount1);
    await test2Token.contract.approve(router2Address, dex2Amount2);
    
    await router2.addLiquidity(
        test1Token.address,
        test2Token.address,
        liquidityAmount1,
        dex2Amount2,
        0, // amountAMin
        0, // amountBMin
        deployer.address,
        deadline
    );
    console.log("✅ DEX2 liquidity added: 100K TEST1 : 50K TEST2 (2:1 ratio)");

    // Add TUSDC/TDAI liquidity with different ratios
    console.log("\n💧 Adding TUSDC/TDAI liquidity for additional arbitrage opportunities...");
    
    // TUSDC amounts (6 decimals)
    const tusdcAmount1 = hre.ethers.parseUnits("1000000", 6); // 1M TUSDC
    const tusdcAmount2 = hre.ethers.parseUnits("800000", 6);  // 800K TUSDC
    
    // TDAI amounts (18 decimals) 
    const tdaiAmount1 = hre.ethers.parseEther("1000000"); // 1M TDAI
    const tdaiAmount2 = hre.ethers.parseEther("900000");  // 900K TDAI

    // DEX1: 1:1 ratio (1M TUSDC : 1M TDAI)
    await tusdcToken.contract.approve(router1Address, tusdcAmount1);
    await tdaiToken.contract.approve(router1Address, tdaiAmount1);
    
    await router1.addLiquidity(
        tusdcToken.address,
        tdaiToken.address,
        tusdcAmount1,
        tdaiAmount1,
        0, // amountAMin
        0, // amountBMin
        deployer.address,
        deadline
    );
    console.log("✅ DEX1 TUSDC/TDAI liquidity added: 1M TUSDC : 1M TDAI (1:1 ratio)");

    // DEX2: Different ratio (800K TUSDC : 900K TDAI) - creates arbitrage opportunity
    await tusdcToken.contract.approve(router2Address, tusdcAmount2);
    await tdaiToken.contract.approve(router2Address, tdaiAmount2);
    
    await router2.addLiquidity(
        tusdcToken.address,
        tdaiToken.address,
        tusdcAmount2,
        tdaiAmount2,
        0, // amountAMin
        0, // amountBMin
        deployer.address,
        deadline
    );
    console.log("✅ DEX2 TUSDC/TDAI liquidity added: 800K TUSDC : 900K TDAI (different ratio)");

    // Verify the price difference
    const pair1 = await hre.ethers.getContractAt(UniswapV2PairABI.abi, pair1Address) as any;
    const pair2 = await hre.ethers.getContractAt(UniswapV2PairABI.abi, pair2Address) as any;
    
    const reserves1 = await pair1.getReserves();
    const reserves2 = await pair2.getReserves();
    
    console.log(`📊 DEX1 Reserves: ${hre.ethers.formatEther(reserves1[0])}, ${hre.ethers.formatEther(reserves1[1])}`);
    console.log(`📊 DEX2 Reserves: ${hre.ethers.formatEther(reserves2[0])}, ${hre.ethers.formatEther(reserves2[1])}`);

    // Execute profitable arbitrage operations
    console.log("\n🎯 Executing profitable arbitrage operations...");

    // Function to execute arbitrage
    async function executeArbitrage(
        executor: ERC20FlashLoanExecutor,
        user: any,
        borrowAmount: bigint,
        operationNumber: number
    ) {
        console.log(`\n💼 Operation ${operationNumber}: User ${user.address.slice(0, 8)}... borrowing ${hre.ethers.formatEther(borrowAmount)} TEST2`);
        
        // Calculate expected amounts using router
        const amountOut = await router2.getAmountsOut(borrowAmount, [test2Token.address, test1Token.address]);
        const test1Received = amountOut[1];
        
        const amountOut2 = await router1.getAmountsOut(test1Received, [test1Token.address, test2Token.address]);
        const test2Received = amountOut2[1];
        
        // Calculate flash loan fees
        const DEFAULT_LP_FEE_BPS = 1n; // 0.01%
        const lpFee = (borrowAmount * DEFAULT_LP_FEE_BPS) / 10000n;
        const totalRepayment = borrowAmount + lpFee;
        
        const expectedProfit = test2Received - totalRepayment;
        console.log(`  📈 Expected profit: ${hre.ethers.formatEther(expectedProfit)} TEST2`);
        
        if (expectedProfit <= 0n) {
            console.log(`  ❌ Operation not profitable, skipping...`);
            return;
        }

        // Create operations array
        const ERC20Interface = new hre.ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
            "function transfer(address to, uint256 amount) returns (bool)"
        ]);

        const RouterInterface = new hre.ethers.Interface([
            "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])"
        ]);

        const operations = [
            // Approve TEST2 for router2
            {
                target: test2Token.address,
                data: ERC20Interface.encodeFunctionData("approve", [router2Address, borrowAmount]),
                value: 0
            },
            // Swap TEST2 → TEST1 on DEX2 (buy TEST1 cheap)
            {
                target: router2Address,
                data: RouterInterface.encodeFunctionData("swapExactTokensForTokens", [
                    borrowAmount,
                    0,
                    [test2Token.address, test1Token.address],
                    await executor.getAddress(),
                    deadline
                ]),
                value: 0
            },
            // Approve TEST1 for router1
            {
                target: test1Token.address,
                data: ERC20Interface.encodeFunctionData("approve", [router1Address, test1Received]),
                value: 0
            },
            // Swap TEST1 → TEST2 on DEX1 (sell TEST1 expensive)
            {
                target: router1Address,
                data: RouterInterface.encodeFunctionData("swapExactTokensForTokens", [
                    test1Received,
                    totalRepayment,
                    [test1Token.address, test2Token.address],
                    await executor.getAddress(),
                    deadline
                ]),
                value: 0
            },
            // Repay flash loan
            {
                target: test2Token.address,
                data: ERC20Interface.encodeFunctionData("transfer", [lenderAddress, totalRepayment]),
                value: 0
            }
        ];

        // Execute the flash loan
        const initialBalance = await test2Token.contract.balanceOf(await executor.getAddress());
        
        try {
            const tx = await executor.connect(user).executeFlashLoan(
                test2Token.address,
                borrowAmount,
                operations
            );
            await tx.wait();
            
            const finalBalance = await test2Token.contract.balanceOf(await executor.getAddress());
            const actualProfit = finalBalance - initialBalance;
            
            console.log(`  ✅ Operation successful! Actual profit: ${hre.ethers.formatEther(actualProfit)} TEST2`);
        } catch (error) {
            console.log(`  ❌ Operation failed:`, (error as Error).message);
        }
    }

    // Function to execute USDC/DAI arbitrage
    async function executeArbitrageUSDCDAI(
        executor: ERC20FlashLoanExecutor,
        user: any,
        borrowAmount: bigint,
        operationNumber: number
    ) {
        console.log(`\n💼 Operation ${operationNumber}: User ${user.address.slice(0, 8)}... borrowing ${hre.ethers.formatUnits(borrowAmount, 6)} TUSDC`);
        
        // Calculate expected amounts using router
        const amountOut = await router2.getAmountsOut(borrowAmount, [tusdcToken.address, tdaiToken.address]);
        const tdaiReceived = amountOut[1];
        
        const amountOut2 = await router1.getAmountsOut(tdaiReceived, [tdaiToken.address, tusdcToken.address]);
        const tusdcReceived = amountOut2[1];
        
        // Calculate flash loan fees
        const DEFAULT_LP_FEE_BPS = 1n; // 0.01%
        const lpFee = (borrowAmount * DEFAULT_LP_FEE_BPS) / 10000n;
        const totalRepayment = borrowAmount + lpFee;
        
        const expectedProfit = tusdcReceived - totalRepayment;
        console.log(`  📈 Expected profit: ${hre.ethers.formatUnits(expectedProfit, 6)} TUSDC`);
        
        if (expectedProfit <= 0n) {
            console.log(`  ❌ Operation not profitable, skipping...`);
            return;
        }

        // Create operations array
        const ERC20Interface = new hre.ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
            "function transfer(address to, uint256 amount) returns (bool)"
        ]);

        const RouterInterface = new hre.ethers.Interface([
            "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[])"
        ]);

        const operations = [
            // Approve TUSDC for router2
            {
                target: tusdcToken.address,
                data: ERC20Interface.encodeFunctionData("approve", [router2Address, borrowAmount]),
                value: 0
            },
            // Swap TUSDC → TDAI on DEX2
            {
                target: router2Address,
                data: RouterInterface.encodeFunctionData("swapExactTokensForTokens", [
                    borrowAmount,
                    0,
                    [tusdcToken.address, tdaiToken.address],
                    await executor.getAddress(),
                    deadline
                ]),
                value: 0
            },
            // Approve TDAI for router1
            {
                target: tdaiToken.address,
                data: ERC20Interface.encodeFunctionData("approve", [router1Address, tdaiReceived]),
                value: 0
            },
            // Swap TDAI → TUSDC on DEX1
            {
                target: router1Address,
                data: RouterInterface.encodeFunctionData("swapExactTokensForTokens", [
                    tdaiReceived,
                    totalRepayment,
                    [tdaiToken.address, tusdcToken.address],
                    await executor.getAddress(),
                    deadline
                ]),
                value: 0
            },
            // Repay flash loan
            {
                target: tusdcToken.address,
                data: ERC20Interface.encodeFunctionData("transfer", [lenderAddress, totalRepayment]),
                value: 0
            }
        ];

        // Execute the flash loan
        const initialBalance = await tusdcToken.contract.balanceOf(await executor.getAddress());
        
        try {
            const tx = await executor.connect(user).executeFlashLoan(
                tusdcToken.address,
                borrowAmount,
                operations
            );
            await tx.wait();
            
            const finalBalance = await tusdcToken.contract.balanceOf(await executor.getAddress());
            const actualProfit = finalBalance - initialBalance;
            
            console.log(`  ✅ Operation successful! Actual profit: ${hre.ethers.formatUnits(actualProfit, 6)} TUSDC`);
        } catch (error) {
            console.log(`  ❌ Operation failed:`, (error as Error).message);
        }
    }

    // User1 executes 2 profitable operations
    console.log("\n👤 User1 arbitrage operations:");
    await executeArbitrage(executor1, user1, hre.ethers.parseEther("100"), 1); // Smaller amount
    
    // Use TUSDC/TDAI pair for second operation
    console.log("\n💼 Operation 2: User1 TUSDC/TDAI arbitrage");
    await executeArbitrageUSDCDAI(executor1, user1, hre.ethers.parseUnits("1000", 6), 2); // 1000 TUSDC
    
    // User2 executes 1 profitable operation  
    console.log("\n👤 User2 arbitrage operations:");
    await executeArbitrage(executor2, user2, hre.ethers.parseEther("150"), 3); // Different amount

    // Display development environment summary
    console.log("\n🎉 Development environment setup completed!");
    
    console.log("\n📋 Development Environment Summary:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏦 ERC20FlashLender:", lenderAddress);
    console.log("🏭 UniswapV2 DEX1 Factory:", factory1Address);
    console.log("🏭 UniswapV2 DEX1 Router:", router1Address);
    console.log("🏭 UniswapV2 DEX2 Factory:", factory2Address);
    console.log("🏭 UniswapV2 DEX2 Router:", router2Address);
    console.log("💎 WETH:", wethAddress);
    console.log("⚡ User1 Executor:", executor1Address);
    console.log("⚡ User2 Executor:", executor2Address);
    console.log("\n🪙 Test Tokens:");
    deployedTokens.forEach(token => {
        console.log(`  ${token.symbol.padEnd(8)} : ${token.address}`);
    });
    
    console.log("\n👥 Test Accounts:");
    console.log(`  Deployer : ${deployer.address}`);
    console.log(`  User1    : ${user1.address}`);
    console.log(`  User2    : ${user2.address}`);
    console.log(`  User3    : ${user3.address}`);

    console.log("\n🧪 Development Testing Commands:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("# Run tests:");
    console.log("npx hardhat test");
    console.log("");
    console.log("# Run specific test file:");
    console.log("npx hardhat test test/ERC20FlashLender.test.ts");
    console.log("");
    console.log("# Start Hardhat console:");
    console.log("npx hardhat console --network localhost");
    console.log("");
    console.log("# Check contract size:");
    console.log("npx hardhat size-contracts");
    console.log("");
    console.log("# Run gas report:");
    console.log("REPORT_GAS=true npx hardhat test");

    console.log("\n🔧 Useful Development Snippets:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("// Get contract instance:");
    console.log(`const lender = await ethers.getContractAt("ERC20FlashLender", "${lenderAddress}");`);
    console.log("");
    console.log("// Get test token instances:");
    deployedTokens.forEach(token => {
        console.log(`const ${token.symbol.toLowerCase()} = await ethers.getContractAt("MockERC20", "${token.address}");`);
    });
    console.log("");
    console.log("// Check balances:");
    console.log("await lender.totalLiquidity(tokenAddress); // Contract liquidity");
    console.log("await token.balanceOf(userAddress); // User token balance");
    console.log("await lender.shares(tokenAddress, userAddress); // User shares");

    return {
        lender: lenderAddress,
        tokens: deployedTokens.map(t => ({ symbol: t.symbol, address: t.address, decimals: t.decimals })),
        dex: {
            weth: wethAddress,
            dex1: {
                factory: factory1Address,
                router: router1Address
            },
            dex2: {
                factory: factory2Address,
                router: router2Address
            }
        },
        executors: {
            user1: executor1Address,
            user2: executor2Address
        },
        accounts: {
            deployer: deployer.address,
            user1: user1.address,
            user2: user2.address,
            user3: user3.address
        },
        network: network,
        managementFee: managementFeePercentage
    };
}

// Execute deployment
main()
    .then((result) => {
        console.log("\n💾 Development Deployment Summary:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("Contract Address:", result.lender);
        console.log("Network:", result.network);
        console.log("Management Fee:", result.managementFee / 100, "% of LP fee");
        console.log("Test Tokens:", result.tokens.length);
        console.log("UniswapV2 DEXs: 2 (with arbitrage opportunities)");
        console.log("Flash Loan Executors: 2 (user1, user2)");
        console.log("Test Accounts: 4 (deployer + 3 users)");
        console.log("✅ Arbitrage operations completed successfully!");        
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Development deployment failed:", error);
        process.exit(1);
    });
