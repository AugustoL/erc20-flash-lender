import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ERC20FlashLoanExecutor", function () {
  // Helper function to calculate correct fees matching the lender contract
  function calculateFlashLoanFees(amount: bigint): { lpFee: bigint, mgmtFee: bigint, totalFee: bigint } {
    const DEFAULT_LP_FEE_BPS = 1n;
    const managementFeePercentage = 100n; // 1% of LP fee
    
    const lpFee = (amount * DEFAULT_LP_FEE_BPS) / 10000n;
    const mgmtFee = (amount * DEFAULT_LP_FEE_BPS * managementFeePercentage) / 100000000n; // 10000 * 10000
    const totalFee = lpFee + mgmtFee;
    
    return { lpFee, mgmtFee, totalFee };
  }

  // Test fixtures
  async function deployFactoryFixture() {
    const [owner, user1, user2, attacker] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const initialSupply = ethers.parseEther("1000000");
    const token = await MockERC20.deploy(initialSupply);
    await token.waitForDeployment();

    // Deploy ERC20FlashLender
    const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
    const lender = await ERC20FlashLender.deploy();
    await lender.waitForDeployment();
    await lender.initialize(100); // 1% management fee

    // Deploy the factory
    const ERC20FlashLoanExecutorFactory = await ethers.getContractFactory("ERC20FlashLoanExecutorFactory");
    const factory = await ERC20FlashLoanExecutorFactory.deploy(await lender.getAddress());
    await factory.waitForDeployment();

    // Setup token balances and initial liquidity
    const initialBalance = ethers.parseEther("10000");
    await token.transfer(user1.address, initialBalance);
    await token.transfer(user2.address, initialBalance);
    
    // Add liquidity to the lender for flash loans
    const liquidityAmount = ethers.parseEther("1000");
    await token.approve(await lender.getAddress(), liquidityAmount);
    await lender.deposit(await token.getAddress(), liquidityAmount);

    // Deploy a simple target contract for testing operations
    const SimpleTarget = await ethers.getContractFactory("SimpleTarget");
    const simpleTarget = await SimpleTarget.deploy();
    await simpleTarget.waitForDeployment();

    // Fund the SimpleTarget with some tokens to repay flash loans
    await token.transfer(await simpleTarget.getAddress(), ethers.parseEther("10"));

    return { 
      factory, 
      lender, 
      token, 
      simpleTarget,
      owner, 
      user1, 
      user2, 
      attacker 
    };
  }

  describe("Factory Deployment", function () {
    it("Should deploy with correct flash lender", async function () {
      const { factory, lender } = await loadFixture(deployFactoryFixture);
      
      expect(await factory.flashLender()).to.equal(await lender.getAddress());
    });

    it("Should reject deployment with zero address", async function () {
      const ERC20FlashLoanExecutorFactory = await ethers.getContractFactory("ERC20FlashLoanExecutorFactory");
      
      await expect(ERC20FlashLoanExecutorFactory.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid flash lender");
    });
  });

  describe("Executor Creation and Flash Loan Execution", function () {
    it("Should create executor and execute flash loan with direct repayment", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      const loanAmount = ethers.parseEther("100");
      
      // Calculate the total amount needed using correct fee calculation
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;

      // Pre-fund the simpleTarget so it can pay directly to the lender
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);

      // Create operations array that will:
      // 1. Set a value in SimpleTarget (test operation)
      // 2. Have SimpleTarget send repayment directly to the lender for gas efficiency
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [42]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(), // Send directly to lender for gas optimization
            totalNeeded // Send enough to repay the loan + fee
          ]),
          value: 0
        }
      ];
      
      // This should work with gas-optimized direct repayment
      await expect(factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      )).to.not.be.reverted;

      // Verify the operation was executed
      expect(await simpleTarget.value()).to.equal(42);
    });

    it("Should handle multiple operations in single flash loan", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      const loanAmount = ethers.parseEther("200");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Pre-fund the simpleTarget for direct lender repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [100]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("increment"),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("increment"),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(), // Direct repayment to lender
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      await factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );

      // Should execute all operations: set to 100, then increment twice = 102
      expect(await simpleTarget.value()).to.equal(102);
    });
  });

  describe("Post-Execution Operations", function () {
    let factory: any, token: any, simpleTarget: any, user1: any, user2: any;
    let executorAddress: string;
    
    beforeEach(async function () {
      const fixture = await loadFixture(deployFactoryFixture);
      factory = fixture.factory;
      const lender = fixture.lender;
      token = fixture.token;
      simpleTarget = fixture.simpleTarget;
      user1 = fixture.user1;
      user2 = fixture.user2;
      
      const loanAmount = ethers.parseEther("200");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Pre-fund the simpleTarget for direct lender repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(), // Direct repayment to lender
            totalNeeded
          ]),
          value: 0
        }
      ];

      // Get the executor address by simulating the call
      executorAddress = await factory.connect(user1).createAndExecuteFlashLoan.staticCall(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      await factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );      
    });

    it("Should allow owner to execute arbitrary calls", async function () {
      // Get the executor contract instance
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);

      // Execute arbitrary call to change the value again
      await executor.connect(user1).executeCall(
        await simpleTarget.getAddress(),
        simpleTarget.interface.encodeFunctionData("setValue", [75]),
        0
      );
      
      expect(await simpleTarget.value()).to.equal(75);
    });

    it("Should reject non-owner attempts to execute calls", async function () {
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);

      await expect(executor.connect(user2).executeCall(
        await simpleTarget.getAddress(),
        simpleTarget.interface.encodeFunctionData("setValue", [123]),
        0
      )).to.be.revertedWithCustomError(executor, "OwnableUnauthorizedAccount");
    });

    it("Should receive ETH via receive function", async function () {
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      const ethAmount = ethers.parseEther("0.5");
      await user1.sendTransaction({
        to: await executor.getAddress(),
        value: ethAmount
      });
      
      expect(await ethers.provider.getBalance(await executor.getAddress())).to.equal(ethAmount);
    });
  });

  describe("Interface Support", function () {
    it("Should support IFlashLoanReceiver interface", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      const loanAmount = ethers.parseEther("50");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Pre-fund the simpleTarget for direct lender repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [1]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(), // Direct repayment to lender
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      const executorAddress = await factory.connect(user1).createAndExecuteFlashLoan.staticCall(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      await factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      // Get the interface ID for IFlashLoanReceiver
      // This should be calculated from the function selector: executeOperation(address,uint256,uint256,bytes)
      const interfaceId = ethers.keccak256(ethers.toUtf8Bytes("executeOperation(address,uint256,uint256,bytes)")).slice(0, 10);

      expect(await executor.supportsInterface(interfaceId)).to.be.true;
    });

    it("Should support ERC165 interface", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      const loanAmount = ethers.parseEther("50");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Pre-fund the simpleTarget for direct lender repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(), // Direct repayment to lender
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      const executorAddress = await factory.connect(user1).createAndExecuteFlashLoan.staticCall(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      await factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      // ERC165 interface ID
      const erc165InterfaceId = "0x01ffc9a7";
      
      expect(await executor.supportsInterface(erc165InterfaceId)).to.be.true;
    });

    it("Should not support invalid interface", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      const loanAmount = ethers.parseEther("50");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Pre-fund the simpleTarget for direct lender repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(), // Direct repayment to lender
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      const executorAddress = await factory.connect(user1).createAndExecuteFlashLoan.staticCall(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      await factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      // Invalid interface ID
      const invalidInterfaceId = "0x12345678";
      
      expect(await executor.supportsInterface(invalidInterfaceId)).to.be.false;
    });
  });

  describe("Error Handling", function () {
    it("Should handle empty operations array (should fail without funding)", async function () {
      const { factory, token, user1 } = await loadFixture(deployFactoryFixture);
      
      const loanAmount = ethers.parseEther("100");
      
      // Empty operations array - should just borrow and immediately repay but fail due to no funding
      const operations: any[] = [];
      
      await expect(factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      )).to.be.reverted;
    });

    it("Should handle failed operations gracefully", async function () {
      const { factory, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      // Create operation that will fail
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: "0x12345678", // Invalid function selector
          value: 0
        }
      ];

      const loanAmount = ethers.parseEther("100");
      const fee = loanAmount * 1n / 10000n;
      await token.transfer(user1.address, fee);
      
      await expect(factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      )).to.be.reverted;
    });

    it("Should handle insufficient repayment balance", async function () {
      const { factory, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      // Create operation that doesn't provide repayment funds
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [1]),
          value: 0
        }
      ];

      const loanAmount = ethers.parseEther("100");
      // Don't provide enough tokens for repayment
      
      await expect(factory.connect(user1).createAndExecuteFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      )).to.be.reverted;
    });

    it("Should reject invalid constructor parameters", async function () {
      const { lender } = await loadFixture(deployFactoryFixture);
      
      const ERC20FlashLoanExecutorFactory = await ethers.getContractFactory("ERC20FlashLoanExecutorFactory");
      
      // Invalid flash lender address
      await expect(ERC20FlashLoanExecutorFactory.deploy(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid flash lender");
    });
  });
});
