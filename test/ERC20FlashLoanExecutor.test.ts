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
    const token = await MockERC20.deploy(initialSupply, "TestToken", "TTK", 18);
    await token.waitForDeployment();

    // Deploy ERC20FlashLender
    const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
    const lender = await ERC20FlashLender.deploy();
    await lender.waitForDeployment();
    await lender.initialize(owner.address); // Only owner, management fee defaults to 0

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

  describe("Two-Step Process: Separate Creation and Execution", function () {
    it("Should create executor via factory and then execute flash loan separately", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      // Step 1: Create executor
      const executorAddress = await factory.connect(user1).createExecutor.staticCall();
      await factory.connect(user1).createExecutor();
      
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      // Verify executor is properly set up
      expect(await executor.owner()).to.equal(user1.address);
      expect(await executor.getFlashLender()).to.equal(await lender.getAddress());
      
      // Step 2: Prepare flash loan
      const loanAmount = ethers.parseEther("150");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Pre-fund the simpleTarget for repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      // Step 3: Execute flash loan using the created executor
      await executor.connect(user1).executeFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );
    });

    it("Should allow multiple flash loans with the same executor", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      // Create executor once
      const executorAddress = await factory.connect(user1).createExecutor.staticCall();
      await factory.connect(user1).createExecutor();
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      // First flash loan
      const loanAmount1 = ethers.parseEther("100");
      const { totalFee: totalFee1 } = calculateFlashLoanFees(loanAmount1);
      const totalNeeded1 = loanAmount1 + totalFee1;
      
      await token.transfer(await simpleTarget.getAddress(), totalNeeded1);
      
      const operations1 = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [111]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded1
          ]),
          value: 0
        }
      ];
      
      await executor.connect(user1).executeFlashLoan(
        await token.getAddress(),
        loanAmount1,
        operations1
      );
      
      expect(await simpleTarget.value()).to.equal(111);
      
      // Second flash loan with different amount
      const loanAmount2 = ethers.parseEther("250");
      const { totalFee: totalFee2 } = calculateFlashLoanFees(loanAmount2);
      const totalNeeded2 = loanAmount2 + totalFee2;
      
      await token.transfer(await simpleTarget.getAddress(), totalNeeded2);
      
      const operations2 = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [222]),
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
            await lender.getAddress(),
            totalNeeded2
          ]),
          value: 0
        }
      ];
      
      await executor.connect(user1).executeFlashLoan(
        await token.getAddress(),
        loanAmount2,
        operations2
      );
      
      // Should be 222 + 1 = 223
      expect(await simpleTarget.value()).to.equal(223);
    });

    it("Should reject flash loan execution from non-owner", async function () {
      const { factory, lender, token, simpleTarget, user1, user2 } = await loadFixture(deployFactoryFixture);
      
      // Create executor owned by user1
      const executorAddress = await factory.connect(user1).createExecutor.staticCall();
      await factory.connect(user1).createExecutor();
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      const loanAmount = ethers.parseEther("100");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [999]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      // user2 should not be able to execute flash loan on user1's executor
      await expect(executor.connect(user2).executeFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      )).to.be.revertedWithCustomError(executor, "OwnableUnauthorizedAccount");
    });

    it("Should handle complex multi-step operations in separate executor", async function () {
      const { factory, lender, token, simpleTarget, user1 } = await loadFixture(deployFactoryFixture);
      
      // Create executor
      const executorAddress = await factory.connect(user1).createExecutor.staticCall();
      await factory.connect(user1).createExecutor();
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      const loanAmount = ethers.parseEther("500");
      const { totalFee } = calculateFlashLoanFees(loanAmount);
      const totalNeeded = loanAmount + totalFee;
      
      // Fund for repayment
      await token.transfer(await simpleTarget.getAddress(), totalNeeded);
      
      // Complex operations: set value, multiple increments, then repay
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [1000]),
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
          data: simpleTarget.interface.encodeFunctionData("increment"),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded
          ]),
          value: 0
        }
      ];
      
      await executor.connect(user1).executeFlashLoan(
        await token.getAddress(),
        loanAmount,
        operations
      );
      
      // Should be 1000 + 3 = 1003
      expect(await simpleTarget.value()).to.equal(1003);
      
      // Executor should still be functional for post-execution operations
      await executor.connect(user1).executeCall(
        await simpleTarget.getAddress(),
        simpleTarget.interface.encodeFunctionData("setValue", [2000]),
        0
      );
      
      expect(await simpleTarget.value()).to.equal(2000);
    });

    it("Should verify executor state and configuration", async function () {
      const { factory, lender, user1 } = await loadFixture(deployFactoryFixture);
      
      const executorAddress = await factory.connect(user1).createExecutor.staticCall();
      await factory.connect(user1).createExecutor();
      const executor = await ethers.getContractAt("ERC20FlashLoanExecutor", executorAddress);
      
      // Verify executor configuration
      expect(await executor.owner()).to.equal(user1.address);
      expect(await executor.getFlashLender()).to.equal(await lender.getAddress());
      
      // Verify interface support
      const flashLoanReceiverInterfaceId = ethers.keccak256(ethers.toUtf8Bytes("executeOperation(address,uint256,uint256,bytes)")).slice(0, 10);
      expect(await executor.supportsInterface(flashLoanReceiverInterfaceId)).to.be.true;
      
      const erc165InterfaceId = "0x01ffc9a7";
      expect(await executor.supportsInterface(erc165InterfaceId)).to.be.true;
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

  describe("Multi-Token Flash Loans", function () {
    // Helper function for multi-token fixtures
    async function deployMultiTokenFixture() {
      const fixture = await deployFactoryFixture();
      
      // Deploy a second token for multi-token testing
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token2 = await MockERC20.deploy(ethers.parseEther("1000000"), "TestToken2", "TTK2", 18);
      await token2.waitForDeployment();
      
      // Setup second token balances and liquidity
      const initialBalance = ethers.parseEther("10000");
      await token2.transfer(fixture.user1.address, initialBalance);
      await token2.transfer(fixture.user2.address, initialBalance);
      
      // Add liquidity for second token
      const liquidityAmount = ethers.parseEther("1000");
      await token2.approve(await fixture.lender.getAddress(), liquidityAmount);
      await fixture.lender.deposit(await token2.getAddress(), liquidityAmount);
      
      return { ...fixture, token2 };
    }

    it("Should execute multi-token flash loan successfully", async function () {
      const { factory, lender, token, token2, simpleTarget, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const loanAmount1 = ethers.parseEther("100");
      const loanAmount2 = ethers.parseEther("50");
      
      // Calculate fees for both tokens
      const { totalFee: totalFee1 } = calculateFlashLoanFees(loanAmount1);
      const { totalFee: totalFee2 } = calculateFlashLoanFees(loanAmount2);
      const totalNeeded1 = loanAmount1 + totalFee1;
      const totalNeeded2 = loanAmount2 + totalFee2;
      
      // Pre-fund the simpleTarget for both tokens
      await token.transfer(await simpleTarget.getAddress(), totalNeeded1);
      await token2.transfer(await simpleTarget.getAddress(), totalNeeded2);
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [loanAmount1, loanAmount2];
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [123]),
          value: 0
        },
        // Repay first token
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded1
          ]),
          value: 0
        },
        // Repay second token
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token2.getAddress(),
            await lender.getAddress(),
            totalNeeded2
          ]),
          value: 0
        }
      ];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.not.be.reverted;
      
      // Verify the operation was executed
      expect(await simpleTarget.value()).to.equal(123);
    });

    it("Should handle different amounts for different tokens", async function () {
      const { factory, lender, token, token2, simpleTarget, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const loanAmount1 = ethers.parseEther("200");
      const loanAmount2 = ethers.parseEther("75");
      
      const { totalFee: totalFee1 } = calculateFlashLoanFees(loanAmount1);
      const { totalFee: totalFee2 } = calculateFlashLoanFees(loanAmount2);
      const totalNeeded1 = loanAmount1 + totalFee1;
      const totalNeeded2 = loanAmount2 + totalFee2;
      
      // Pre-fund the simpleTarget
      await token.transfer(await simpleTarget.getAddress(), totalNeeded1);
      await token2.transfer(await simpleTarget.getAddress(), totalNeeded2);
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [loanAmount1, loanAmount2];
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [456]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded1
          ]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token2.getAddress(),
            await lender.getAddress(),
            totalNeeded2
          ]),
          value: 0
        }
      ];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.not.be.reverted;
      
      expect(await simpleTarget.value()).to.equal(456);
    });

    it("Should reject multi-token flash loan with mismatched array lengths", async function () {
      const { factory, token, token2, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [ethers.parseEther("100")]; // Mismatched length
      const operations: { target: string; data: string; value: number; }[] = [];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.be.revertedWith("Arrays length mismatch");
    });

    it("Should reject multi-token flash loan with duplicate tokens", async function () {
      const { factory, token, simpleTarget, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const tokens = [await token.getAddress(), await token.getAddress()]; // Duplicate
      const amounts = [ethers.parseEther("100"), ethers.parseEther("50")];
      const operations: { target: string; data: string; value: number; }[] = [];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.be.revertedWith("Duplicate token");
    });

    it("Should reject multi-token flash loan with insufficient liquidity for one token", async function () {
      const { factory, lender, token, token2, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [ethers.parseEther("100"), ethers.parseEther("2000")]; // Second amount too large
      const operations: { target: string; data: string; value: number; }[] = [];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.be.revertedWith("Not enough liquidity");
    });

    it("Should reject multi-token flash loan if repayment fails for any token", async function () {
      const { factory, lender, token, token2, simpleTarget, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const loanAmount1 = ethers.parseEther("100");
      const loanAmount2 = ethers.parseEther("50");
      
      const { totalFee: totalFee1 } = calculateFlashLoanFees(loanAmount1);
      const { totalFee: totalFee2 } = calculateFlashLoanFees(loanAmount2);
      const totalNeeded1 = loanAmount1 + totalFee1;
      const totalNeeded2 = loanAmount2 + totalFee2;
      
      // Only fund for first token, not second
      await token.transfer(await simpleTarget.getAddress(), totalNeeded1);
      // Deliberately don't fund second token
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [loanAmount1, loanAmount2];
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded1
          ]),
          value: 0
        }
        // Note: No repayment for second token
      ];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.be.revertedWith("Flash loan not repaid");
    });

    it("Should reject multi-token flash loan with too many tokens", async function () {
      const { factory, token, user1 } = await loadFixture(deployMultiTokenFixture);
      
      // Create array with 21 tokens (exceeds limit of 20)
      const tokens = new Array(21).fill(await token.getAddress());
      const amounts = new Array(21).fill(ethers.parseEther("1"));
      const operations: { target: string; data: string; value: number; }[] = [];
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.be.revertedWith("Too many tokens");
    });

    it("Should execute complex multi-token arbitrage scenario", async function () {
      const { factory, lender, token, token2, simpleTarget, user1 } = await loadFixture(deployMultiTokenFixture);
      
      const loanAmount1 = ethers.parseEther("300");
      const loanAmount2 = ethers.parseEther("150");
      
      const { totalFee: totalFee1 } = calculateFlashLoanFees(loanAmount1);
      const { totalFee: totalFee2 } = calculateFlashLoanFees(loanAmount2);
      const totalNeeded1 = loanAmount1 + totalFee1;
      const totalNeeded2 = loanAmount2 + totalFee2;
      
      // Simulate profitable trades - provide extra tokens as "profit"
      const profit1 = ethers.parseEther("10");
      const profit2 = ethers.parseEther("5");
      await token.transfer(await simpleTarget.getAddress(), totalNeeded1 + profit1);
      await token2.transfer(await simpleTarget.getAddress(), totalNeeded2 + profit2);
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [loanAmount1, loanAmount2];
      
      const operations = [
        // Simulate arbitrage operations
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("setValue", [999]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("increment"),
          value: 0
        },
        // Repay loans
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            totalNeeded1
          ]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token2.getAddress(),
            await lender.getAddress(),
            totalNeeded2
          ]),
          value: 0
        },
        // Keep profits
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            user1.address,
            profit1
          ]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token2.getAddress(),
            user1.address,
            profit2
          ]),
          value: 0
        }
      ];
      
      const user1Token1BalanceBefore = await token.balanceOf(user1.address);
      const user1Token2BalanceBefore = await token2.balanceOf(user1.address);
      
      await expect(factory.connect(user1).createAndExecuteMultiFlashLoan(
        tokens,
        amounts,
        operations
      )).to.not.be.reverted;
      
      // Verify operations executed
      expect(await simpleTarget.value()).to.equal(1000); // 999 + 1 increment
      
      // Verify profits were transferred
      expect(await token.balanceOf(user1.address)).to.equal(user1Token1BalanceBefore + profit1);
      expect(await token2.balanceOf(user1.address)).to.equal(user1Token2BalanceBefore + profit2);
    });

    it("Should properly handle fees for multi-token flash loans", async function () {
      const { factory, lender, token, token2, simpleTarget, user1, owner } = await loadFixture(deployMultiTokenFixture);
      
      await lender.setManagementFee(100); // 1% management fee

      const loanAmount1 = ethers.parseEther("1000");
      const loanAmount2 = ethers.parseEther("500");
      
      const { lpFee: lpFee1, mgmtFee: mgmtFee1, totalFee: totalFee1 } = calculateFlashLoanFees(loanAmount1);
      const { lpFee: lpFee2, mgmtFee: mgmtFee2, totalFee: totalFee2 } = calculateFlashLoanFees(loanAmount2);
      
      // Pre-fund for repayment
      await token.transfer(await simpleTarget.getAddress(), loanAmount1 + totalFee1);
      await token2.transfer(await simpleTarget.getAddress(), loanAmount2 + totalFee2);
      
      // Record balances before
      const token1LiquidityBefore = await lender.totalLiquidity(await token.getAddress());
      const token2LiquidityBefore = await lender.totalLiquidity(await token2.getAddress());
      const token1MgmtFeesBefore = await lender.collectedManagementFees(await token.getAddress());
      const token2MgmtFeesBefore = await lender.collectedManagementFees(await token2.getAddress());
      
      const tokens = [await token.getAddress(), await token2.getAddress()];
      const amounts = [loanAmount1, loanAmount2];
      
      const operations = [
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token.getAddress(),
            await lender.getAddress(),
            loanAmount1 + totalFee1
          ]),
          value: 0
        },
        {
          target: await simpleTarget.getAddress(),
          data: simpleTarget.interface.encodeFunctionData("sendTokensTo", [
            await token2.getAddress(),
            await lender.getAddress(),
            loanAmount2 + totalFee2
          ]),
          value: 0
        }
      ];
      
      await factory.connect(user1).createAndExecuteMultiFlashLoan(tokens, amounts, operations);
      
      // Verify fees were collected correctly for both tokens
      expect(await lender.totalLiquidity(await token.getAddress())).to.equal(token1LiquidityBefore + lpFee1);
      expect(await lender.totalLiquidity(await token2.getAddress())).to.equal(token2LiquidityBefore + lpFee2);
      expect(await lender.collectedManagementFees(await token.getAddress())).to.equal(token1MgmtFeesBefore + mgmtFee1);
      expect(await lender.collectedManagementFees(await token2.getAddress())).to.equal(token2MgmtFeesBefore + mgmtFee2);
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
