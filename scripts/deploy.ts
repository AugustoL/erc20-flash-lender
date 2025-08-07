import hre from "hardhat";
import { ERC20FlashLender } from "../typechain-types";

async function main() {
    console.log("🚀 Starting ERC20FlashLender deployment...");
    
    const [deployer] = await hre.ethers.getSigners();
    const network = hre.network.name;
    
    console.log("📡 Network:", network);
    console.log("👤 Deployer:", deployer.address);
    console.log("💰 Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

    // Get deployment parameters from environment or use defaults
    const managementFeePercentage = process.env.INITIAL_MANAGEMENT_FEE_PERCENTAGE ? 
        parseInt(process.env.INITIAL_MANAGEMENT_FEE_PERCENTAGE) : 100; // 1% of LP fee default

    console.log("⚙️  Management fee:", managementFeePercentage / 100, "% of LP fee");

    // Deploy the contract
    console.log("\\n📦 Deploying ERC20FlashLender...");
    const ERC20FlashLender = await hre.ethers.getContractFactory("ERC20FlashLender");
    
    const lender = await ERC20FlashLender.deploy() as ERC20FlashLender;
    await lender.waitForDeployment();
    
    const lenderAddress = await lender.getAddress();
    console.log("✅ Contract deployed to:", lenderAddress);

    // Initialize the contract
    console.log("\\n🔧 Initializing contract...");
    const initTx = await lender.initialize(managementFeePercentage);
    await initTx.wait();
    console.log("✅ Contract initialized");

    // Verify deployment
    console.log("\\n🔍 Verifying deployment...");
    const deployedManagementFee = await lender.managementFeePercentage();
    const owner = await lender.owner();
    const defaultLpFee = await lender.DEFAULT_LP_FEE_BPS();
    const maxLpFee = await lender.MAX_LP_FEE_BPS();
    const maxMgmtFee = await lender.MAX_MANAGEMENT_FEE_PERCENTAGE();
    const minDeposit = await lender.MINIMUM_DEPOSIT();
    
    console.log("📊 Contract Configuration:");
    console.log("  - Management Fee:", (deployedManagementFee / 100n).toString(), "% of LP fee");
    console.log("  - Default LP Fee:", defaultLpFee.toString(), "bps (0.01%)");
    console.log("  - Max LP Fee:", maxLpFee.toString(), "bps (1%)");
    console.log("  - Max Management Fee:", (maxMgmtFee / 100n).toString(), "% of LP fee");
    console.log("  - Minimum Deposit:", minDeposit.toString(), "tokens");
    console.log("  - Owner:", owner);

    // Estimate gas for basic operations
    console.log("\\n⛽ Gas Estimates:");
    try {
        const dummyToken = "0x" + "1".repeat(40);
        const depositGas = await lender.deposit.estimateGas(dummyToken, minDeposit);
        console.log("  - Deposit:", depositGas.toString(), "gas");
        
        const setFeeGas = await lender.setLPFee.estimateGas(dummyToken, 5);
        console.log("  - Set LP Fee:", setFeeGas.toString(), "gas");
    } catch (error) {
        console.log("  - Could not estimate gas (expected for dummy addresses)");
    }

    // Contract verification instructions
    if (network !== "hardhat" && network !== "localhost") {
        console.log("\\n📋 Contract Verification:");
        console.log(`npx hardhat verify --network ${network} ${lenderAddress} ${managementFeePercentage}`);
    }

    // Transfer ownership if multisig is provided
    if (process.env.MULTISIG_OWNER && process.env.MULTISIG_OWNER !== "0x0000000000000000000000000000000000000000") {
        console.log("\\n👥 Transferring ownership to multisig...");
        const transferTx = await lender.transferOwnership(process.env.MULTISIG_OWNER);
        await transferTx.wait();
        console.log("✅ Ownership transferred to:", process.env.MULTISIG_OWNER);
    }

    console.log("\\n🎉 Deployment completed successfully!");
    
    console.log("\\n📝 Next Steps:");
    console.log("1. 🔍 Verify contract on block explorer");
    console.log("2. 🏦 Fund the contract with initial liquidity");
    console.log("3. 📊 Set up monitoring dashboard");
    console.log("4. 🛡️  Consider additional security measures:");
    console.log("   - Time locks for admin functions");
    console.log("   - Multisig for ownership");
    console.log("   - Emergency pause capabilities");

    return {
        lender: lenderAddress,
        deployer: deployer.address,
        network: network,
        managementFee: managementFeePercentage
    };
}

// Execute deployment
main()
    .then((result) => {
        console.log("\\n💾 Deployment Summary:");
        console.log("Contract Address:", result.lender);
        console.log("Deployer:", result.deployer);
        console.log("Network:", result.network);
        console.log("Management Fee:", result.managementFee / 100, "% of LP fee");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Deployment failed:", error);
        process.exit(1);
    });