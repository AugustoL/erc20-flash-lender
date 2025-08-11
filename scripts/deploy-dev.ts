import hre from "hardhat";
import { ERC20FlashLender, MockERC20 } from "../typechain-types";

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
        { name: "Test USDC", symbol: "TUSDC", decimals: 6, supply: "1000000000" }, // 1B TUSDC
        { name: "Test DAI", symbol: "TDAI", decimals: 18, supply: "1000000000" }, // 1B TDAI
        { name: "Test WETH", symbol: "TWETH", decimals: 18, supply: "100000" },   // 100K TWETH
        { name: "Test WBTC", symbol: "TWBTC", decimals: 8, supply: "21000" },    // 21K TWBTC
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
            hre.ethers.parseUnits(tokenConfig.supply, tokenConfig.decimals), tokenConfig.name, tokenConfig.symbol
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

    // Display development environment summary
    console.log("\n🎉 Development environment setup completed!");
    
    console.log("\n📋 Development Environment Summary:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🏦 ERC20FlashLender:", lenderAddress);
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
        console.log("Test Accounts: 4 (deployer + 3 users)");        
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Development deployment failed:", error);
        process.exit(1);
    });
