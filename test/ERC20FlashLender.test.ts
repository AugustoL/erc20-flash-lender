import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("ERC20FlashLender", function () {
  // Test fixtures
  async function deployERC20FlashLenderFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock ERC20 token from ERC20FlashLenderTests.sol
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const initialSupply = ethers.parseEther("1000000"); // 1 million tokens
    const token = await MockERC20.deploy(initialSupply);
    await token.waitForDeployment();

    // Deploy ERC20FlashLender
    const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
    const lender = await ERC20FlashLender.deploy();
    await lender.waitForDeployment();

    // Initialize with 1% management fee (as percentage of LP fee)
    await lender.initialize(100);

    // Setup token balances
    const initialBalance = ethers.parseEther("10000");
    await token.transfer(user1.address, initialBalance);
    await token.transfer(user2.address, initialBalance);
    await token.transfer(user3.address, initialBalance);

    return { lender, token, owner, user1, user2, user3 };
  }

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const { lender, owner } = await loadFixture(deployERC20FlashLenderFixture);

      expect(await lender.owner()).to.equal(owner.address);
      expect(await lender.managementFeePercentage()).to.equal(100);
      expect(await lender.DEFAULT_LP_FEE_BPS()).to.equal(1);
      expect(await lender.MIN_MANAGEMENT_FEE_PERCENTAGE()).to.equal(100);
      expect(await lender.MAX_MANAGEMENT_FEE_PERCENTAGE()).to.equal(500);
      expect(await lender.MAX_LP_FEE_BPS()).to.equal(100);
      expect(await lender.MINIMUM_DEPOSIT()).to.equal(1000);
    });

    it("Should reject initialization with excessive management fee", async function () {
      const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
      const lender = await ERC20FlashLender.deploy();
      
      await expect(lender.initialize(600)).to.be.revertedWith("Mgmt fee out of range"); // > 5%
    });

    it("Should reject initialization with too low management fee", async function () {
      const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
      const lender = await ERC20FlashLender.deploy();
      
      await expect(lender.initialize(50)).to.be.revertedWith("Mgmt fee out of range"); // < 1%
    });
  });

  describe("Deposits", function () {
    it("Should allow deposits above minimum", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = ethers.parseEther("100");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      
      await expect(lender.connect(user1).deposit(await token.getAddress(), depositAmount))
        .to.emit(lender, "Deposit")
        .withArgs(user1.address, await token.getAddress(), depositAmount, depositAmount);

      expect(await lender.deposits(await token.getAddress(), user1.address)).to.equal(depositAmount);
      expect(await lender.shares(await token.getAddress(), user1.address)).to.equal(depositAmount);
      expect(await lender.totalLiquidity(await token.getAddress())).to.equal(depositAmount);
      expect(await lender.totalShares(await token.getAddress())).to.equal(depositAmount);
    });

    it("Should reject deposits below minimum", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = 999; // Below MINIMUM_DEPOSIT
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      
      await expect(lender.connect(user1).deposit(await token.getAddress(), depositAmount))
        .to.be.revertedWith("Deposit too small");
    });

    it("Should reject deposits with zero address token", async function () {
      const { lender, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      await expect(lender.connect(user1).deposit(ethers.ZeroAddress, 1000))
        .to.be.revertedWith("Invalid token");
    });

    it("Should calculate shares correctly for subsequent deposits", async function () {
      const { lender, token, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // First deposit
      const firstDeposit = ethers.parseEther("100");
      await token.connect(user1).approve(await lender.getAddress(), firstDeposit);
      await lender.connect(user1).deposit(await token.getAddress(), firstDeposit);

      // Simulate LP fees by transferring tokens to the contract
      const lpFees = ethers.parseEther("10");
      await token.transfer(await lender.getAddress(), lpFees);
      
      // Update total liquidity to include the fees
      const currentLiquidity = await lender.totalLiquidity(await token.getAddress());
      // Note: In real scenario, this would be updated via flash loans
      
      // Second deposit
      const secondDeposit = ethers.parseEther("100");
      await token.connect(user2).approve(await lender.getAddress(), secondDeposit);
      await lender.connect(user2).deposit(await token.getAddress(), secondDeposit);

      // User2 should get proportional shares
      const user2Shares = await lender.shares(await token.getAddress(), user2.address);
      expect(user2Shares).to.equal(secondDeposit); // Since totalLiquidity = totalShares still
    });
  });

  describe("Withdrawals", function () {
    it("Should allow withdrawals of deposits", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Deposit first
      const depositAmount = ethers.parseEther("100");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);

      // Withdraw
      const balanceBefore = await token.balanceOf(user1.address);
      
      await expect(lender.connect(user1).withdraw(await token.getAddress()))
        .to.emit(lender, "Withdraw")
        .withArgs(user1.address, await token.getAddress(), depositAmount, 0);

      expect(await token.balanceOf(user1.address)).to.equal(balanceBefore + depositAmount);
      expect(await lender.deposits(await token.getAddress(), user1.address)).to.equal(0);
      expect(await lender.shares(await token.getAddress(), user1.address)).to.equal(0);
    });

    it("Should reject withdrawal with no shares", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      await expect(lender.connect(user1).withdraw(await token.getAddress()))
        .to.be.revertedWith("Nothing to withdraw");
    });

    it("Should distribute fees proportionally on withdrawal", async function () {
      const { lender, token, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Two users deposit
      const depositAmount = ethers.parseEther("100");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await token.connect(user2).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      await lender.connect(user2).deposit(await token.getAddress(), depositAmount);

      // Generate fees through flash loan
      const flashLoanAmount = ethers.parseEther("50");
      
      // Deploy a valid flash loan receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver to pay back loan + fees
      await token.transfer(await receiver.getAddress(), ethers.parseEther("1"));
      
      // Execute flash loan
      await lender.flashLoan(
        await token.getAddress(),
        flashLoanAmount,
        await receiver.getAddress(),
        "0x"
      );

      // Check that fees were collected
      const totalLiquidity = await lender.totalLiquidity(await token.getAddress());
      expect(totalLiquidity).to.be.gt(depositAmount * 2n);

      // User1 withdraws and should get principal + share of fees
      const [withdrawable, principal, fees] = await lender.getWithdrawableAmount(
        await token.getAddress(), 
        user1.address
      );
      expect(fees).to.be.gt(0);

      await lender.connect(user1).withdraw(await token.getAddress());
    });
  });

  describe("Flash Loans", function () {
    it("Should execute flash loan successfully", async function () {
      const { lender, token, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity for flash loans
      const depositAmount = ethers.parseEther("1000");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy flash loan receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver for fees
      await token.connect(user2).transfer(await receiver.getAddress(), ethers.parseEther("110"));
      
      await expect(lender.connect(user2).flashLoan(
        await token.getAddress(),
        loanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.emit(lender, "FlashLoan");

      // Check fees were distributed
      const mgmtFees = await lender.collectedManagementFees(await token.getAddress());
      expect(mgmtFees).to.be.gt(0);
    });

    it("Should reject flash loan with insufficient liquidity", async function () {
      const { lender, token, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add some liquidity first
      const depositAmount = ethers.parseEther("100");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      const loanAmount = ethers.parseEther("2000"); // More than deposited
      
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      await expect(lender.connect(user2).flashLoan(
        await token.getAddress(),
        loanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Not enough liquidity");
    });

    it("Should reject flash loan to EOA", async function () {
      const { lender, token, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity first
      const depositAmount = ethers.parseEther("1000");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      await expect(lender.connect(user2).flashLoan(
        await token.getAddress(),
        ethers.parseEther("100"),
        user2.address, // EOA, not a contract
        "0x"
      )).to.be.reverted;
    });

    it("Should reject flash loan if not repaid", async function () {
      const { lender, token, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity first
      const depositAmount = ethers.parseEther("1000");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy receiver but don't fund it enough to repay
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver with insufficient amount (less than loan + fees)
      // Loan = 100, fees = ~0.02
      await token.connect(user2).transfer(await receiver.getAddress(), ethers.parseEther("0.01"));
      
      // Debug: Check balances before flash loan
      const receiverBalance = await token.balanceOf(await receiver.getAddress());
      const lpFee = (loanAmount * 1n) / 10000n; // 1 bps LP fee
      const mgmtFee = (lpFee * 100n) / 10000n; // 1% of LP fee
      const totalFee = lpFee + mgmtFee;
      const totalOwed = loanAmount + totalFee;
      
      console.log("Receiver balance:", ethers.formatEther(receiverBalance));
      console.log("Loan amount:", ethers.formatEther(loanAmount));
      console.log("Total fee:", ethers.formatEther(totalFee));
      console.log("Total owed:", ethers.formatEther(totalOwed));
      console.log("Has enough?", receiverBalance >= totalOwed);
      
      await expect(lender.connect(user2).flashLoan(
        await token.getAddress(),
        loanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.be.reverted;
    });

    it("Should calculate fees correctly", async function () {
      const { lender, token, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add sufficient liquidity first (but within user balance)
      const depositAmount = ethers.parseEther("5000");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      const loanAmount = ethers.parseEther("1000"); 
      
      // Deploy and fund receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver with enough to repay loan + fees
      // LP fee = 0.01% of 1000 = 0.1 ETH, Management fee = 1% of LP fee = 0.001 ETH
      // Total needed = 1000 + 0.1 + 0.001 = 1000.101 ETH
      await token.connect(user2).transfer(await receiver.getAddress(), ethers.parseEther("1001"));
      
      const liquidityBefore = await lender.totalLiquidity(await token.getAddress());
      
      await lender.connect(user2).flashLoan(
        await token.getAddress(),
        loanAmount,
        await receiver.getAddress(),
        "0x"
      );
      
      const liquidityAfter = await lender.totalLiquidity(await token.getAddress());
      const mgmtFees = await lender.collectedManagementFees(await token.getAddress());
      
      // LP fee = 0.01% of 1000 = 0.1 ETH
      // Management fee = 1% of LP fee = 1% of 0.1 = 0.001 ETH
      expect(liquidityAfter - liquidityBefore).to.equal(ethers.parseEther("0.1"));
      expect(mgmtFees).to.equal(ethers.parseEther("0.001"));
    });
  });

  describe("Fee Management", function () {
    it("Should allow owner to set LP fees", async function () {
      const { lender, token, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      const newFeeBps = 50; // 0.5%
      
      await expect(lender.connect(owner).setLPFee(await token.getAddress(), newFeeBps))
        .to.emit(lender, "LPFeeChanged")
        .withArgs(await token.getAddress(), 0, newFeeBps);
      
      expect(await lender.lpFeesBps(await token.getAddress())).to.equal(newFeeBps);
    });

    it("Should reject excessive LP fees", async function () {
      const { lender, token, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      const excessiveFee = 101; // > MAX_LP_FEE_BPS
      
      await expect(lender.connect(owner).setLPFee(await token.getAddress(), excessiveFee))
        .to.be.revertedWith("LP fee too high");
    });

    it("Should allow owner to update management fee", async function () {
      const { lender, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      const newFeePercentage = 200; // 2% of LP fee
      
      await expect(lender.connect(owner).setManagementFee(newFeePercentage))
        .to.emit(lender, "ManagementFeeChanged")
        .withArgs(100, newFeePercentage); // From 1% to 2%
      
      expect(await lender.managementFeePercentage()).to.equal(newFeePercentage);
    });

    it("Should reject management fee outside valid range", async function () {
      const { lender, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Test too high
      await expect(lender.connect(owner).setManagementFee(600)) // > 5%
        .to.be.revertedWith("Fee out of range");
      
      // Test too low  
      await expect(lender.connect(owner).setManagementFee(50)) // < 1%
        .to.be.revertedWith("Fee out of range");
    });

    it("Should allow owner to withdraw management fees", async function () {
      const { lender, token, owner, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Setup: deposit and generate fees
      const depositAmount = ethers.parseEther("1000");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      // Execute flash loan to generate fees
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await token.connect(user2).transfer(await receiver.getAddress(), ethers.parseEther("1"));
      
      await lender.flashLoan(
        await token.getAddress(),
        ethers.parseEther("100"),
        await receiver.getAddress(),
        "0x"
      );
      
      const fees = await lender.collectedManagementFees(await token.getAddress());
      expect(fees).to.be.gt(0);
      
      const ownerBalanceBefore = await token.balanceOf(owner.address);
      
      await expect(lender.connect(owner).withdrawManagementFees(await token.getAddress()))
        .to.emit(lender, "ManagementFeeWithdrawn")
        .withArgs(await token.getAddress(), fees);
      
      expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore + fees);
      expect(await lender.collectedManagementFees(await token.getAddress())).to.equal(0);
    });

    it("Should reject management fee withdrawal by non-owner", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      await expect(lender.connect(user1).withdrawManagementFees(await token.getAddress()))
        .to.be.revertedWithCustomError(lender, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return correct withdrawable amount", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = ethers.parseEther("100");
      await token.connect(user1).approve(await lender.getAddress(), depositAmount);
      await lender.connect(user1).deposit(await token.getAddress(), depositAmount);
      
      const [totalAmount, principal, fees] = await lender.getWithdrawableAmount(
        await token.getAddress(),
        user1.address
      );
      
      expect(totalAmount).to.equal(depositAmount);
      expect(principal).to.equal(depositAmount);
      expect(fees).to.equal(0);
    });

    it("Should return correct effective LP fee", async function () {
      const { lender, token } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Should return default when not set
      expect(await lender.getEffectiveLPFee(await token.getAddress())).to.equal(1);
      
      // Should return custom fee when set
      await lender.setLPFee(await token.getAddress(), 50);
      expect(await lender.getEffectiveLPFee(await token.getAddress())).to.equal(50);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple deposits and withdrawals correctly", async function () {
      const { lender, token, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Multiple users deposit
      const depositAmount = ethers.parseEther("100");
      
      for (const user of [user1, user2, user3]) {
        await token.connect(user).approve(await lender.getAddress(), depositAmount);
        await lender.connect(user).deposit(await token.getAddress(), depositAmount);
      }
      
      expect(await lender.totalLiquidity(await token.getAddress())).to.equal(depositAmount * 3n);
      expect(await lender.totalShares(await token.getAddress())).to.equal(depositAmount * 3n);
      
      // Users withdraw in different order
      await lender.connect(user2).withdraw(await token.getAddress());
      await lender.connect(user1).withdraw(await token.getAddress());
      await lender.connect(user3).withdraw(await token.getAddress());
      
      expect(await lender.totalLiquidity(await token.getAddress())).to.equal(0);
      expect(await lender.totalShares(await token.getAddress())).to.equal(0);
    });

    it("Should handle deposits after fee accrual correctly", async function () {
      const { lender, token, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User1 deposits
      const firstDeposit = ethers.parseEther("1000");
      await token.connect(user1).approve(await lender.getAddress(), firstDeposit);
      await lender.connect(user1).deposit(await token.getAddress(), firstDeposit);
      
      // Generate fees through flash loan
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await token.connect(user3).transfer(await receiver.getAddress(), ethers.parseEther("10"));
      
      await lender.flashLoan(
        await token.getAddress(),
        ethers.parseEther("1000"),
        await receiver.getAddress(),
        "0x"
      );
      
      // User2 deposits after fees have accrued
      const secondDeposit = ethers.parseEther("1000");
      await token.connect(user2).approve(await lender.getAddress(), secondDeposit);
      await lender.connect(user2).deposit(await token.getAddress(), secondDeposit);
      
      // User2's shares should be less than deposit amount due to accrued fees
      const user2Shares = await lender.shares(await token.getAddress(), user2.address);
      expect(user2Shares).to.be.lt(secondDeposit);
      
      // User2's withdrawable amount might be slightly less due to rounding
      // but should be close to their deposit (within 1% tolerance)
      const [withdrawable] = await lender.getWithdrawableAmount(
        await token.getAddress(),
        user2.address
      );
      expect(withdrawable).to.be.closeTo(secondDeposit, 1);
    });
  });

  describe("Security", function () {
    it("Should prevent unauthorized access", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Test that only owner can call owner functions
      await expect(lender.connect(user1).setManagementFee(5))
        .to.be.revertedWithCustomError(lender, "OwnableUnauthorizedAccount");
      
      await expect(lender.connect(user1).setLPFee(await token.getAddress(), 5))
        .to.be.revertedWithCustomError(lender, "OwnableUnauthorizedAccount");
    });
  });
});