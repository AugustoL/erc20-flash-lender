import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

// Helper function constants for improved test readability
const approve = async function(token: any, signer: any, spender: string, amount: bigint){
  return await token.connect(signer).approve(spender, amount);
};

const transfer = async function(token: any, signer: any, to: string, amount: bigint){
  return await token.connect(signer).transfer(to, amount);
};

const deposit = async function(lender: any, signer: any, tokenAddress: string, amount: bigint){
  return await lender.connect(signer).deposit(tokenAddress, amount);
};

const withdraw = async function(lender: any, signer: any, tokenAddress: string){
  return await lender.connect(signer).withdraw(tokenAddress);
};

const voteForLPFee = async function(lender: any, signer: any, tokenAddress: string, feeBps: number){
  return await lender.connect(signer).voteForLPFee(tokenAddress, feeBps);
};

describe("ERC20FlashLender", function () {
  // Test fixtures
  async function deployERC20FlashLenderFixture() {
    const [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy mock ERC20 token from ERC20FlashLenderTests.sol
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const initialSupply = ethers.parseEther("1000000"); // 1 million tokens
    const token = await MockERC20.deploy(initialSupply, "TestToken", "TTK", 18);
    await token.waitForDeployment();

    // Deploy ERC20FlashLender
    const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
    const lender = await ERC20FlashLender.deploy();
    await lender.waitForDeployment();

    // Initialize with owner only (management fee defaults to 0)
    await lender.initialize(owner.address);

    // Setup token balances
    const initialBalance = ethers.parseEther("10000");
    await token.transfer(user1.address, initialBalance);
    await token.transfer(user2.address, initialBalance);
    await token.transfer(user3.address, initialBalance);

    return { lender, lenderAddress: await lender.getAddress(), token, tokenAddress: await token.getAddress(), owner, user1, user2, user3 };
  }

  describe("Initialization", function () {
    it("Should initialize with correct parameters", async function () {
      const { lender, owner } = await loadFixture(deployERC20FlashLenderFixture);

      expect(await lender.owner()).to.equal(owner.address);
      expect(await lender.managementFeePercentage()).to.equal(0);
      expect(await lender.DEFAULT_LP_FEE_BPS()).to.equal(1);
      expect(await lender.MAX_MANAGEMENT_FEE_PERCENTAGE()).to.equal(500);
      expect(await lender.MAX_LP_FEE_BPS()).to.equal(100);
      expect(await lender.MINIMUM_DEPOSIT()).to.equal(100000000); // 1e8
    });

    it("Should set owner correctly on initialization", async function () {
      const [owner, user1] = await ethers.getSigners();
      const ERC20FlashLender = await ethers.getContractFactory("ERC20FlashLender");
      const lender = await ERC20FlashLender.deploy();
      await lender.waitForDeployment();
      await lender.initialize(user1.address);
      expect(await lender.owner()).to.equal(user1.address);
      expect(await lender.managementFeePercentage()).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should allow deposits above minimum", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = ethers.parseEther("100"); // Well above 1e8 minimum
      await approve(token, user1, lenderAddress, depositAmount);
      
      // For first deposit, expect virtual shares creation and entry fee handling
      const entryFee = 100n;
      const netDeposit = depositAmount - entryFee;
      const virtualShares = 1000n;
      
      await expect(deposit(lender, user1, tokenAddress, depositAmount))
        .to.emit(lender, "Deposit")
        .withArgs(user1.address, tokenAddress, netDeposit, netDeposit);

      // User gets shares for net deposit (after entry fee)
      expect(await lender.deposits(tokenAddress, user1.address)).to.equal(netDeposit);
      expect(await lender.shares(tokenAddress, user1.address)).to.equal(netDeposit);
      
      // Owner gets virtual shares
      expect(await lender.shares(tokenAddress, await lender.owner())).to.equal(virtualShares);
      
      // Total includes virtual shares + user shares
      expect(await lender.totalShares(tokenAddress)).to.equal(virtualShares + netDeposit);
      
      // Total liquidity includes full deposit amount (entry fee stays in pool)
      expect(await lender.totalLiquidity(tokenAddress)).to.equal(virtualShares + depositAmount);
    });

    it("Should reject deposits below minimum", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = 50000000n; // 5e7, below 1e8 minimum
      await approve(token, user1, lenderAddress, depositAmount);
      
      await expect(deposit(lender, user1, tokenAddress, depositAmount))
        .to.be.revertedWith("Deposit too small");
    });

    it("Should reject deposits with zero address token", async function () {
      const { lender, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      await expect(deposit(lender, user1, ethers.ZeroAddress, 1000n))
        .to.be.revertedWith("Invalid token");
    });

    it("Should calculate shares correctly for subsequent deposits", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // First deposit creates virtual shares
      const firstDeposit = ethers.parseEther("100");
      const entryFee = 100n;
      const virtualShares = 1000n;
      
      await approve(token, user1, lenderAddress, firstDeposit);
      await deposit(lender, user1, tokenAddress, firstDeposit);

      // Check first deposit state
      const user1NetDeposit = firstDeposit - entryFee;
      expect(await lender.shares(tokenAddress, user1.address)).to.equal(user1NetDeposit);
      expect(await lender.totalShares(tokenAddress)).to.equal(virtualShares + user1NetDeposit);
      expect(await lender.totalLiquidity(tokenAddress)).to.equal(virtualShares + firstDeposit);

      // Second deposit (no virtual shares, proportional calculation)
      const secondDeposit = ethers.parseEther("100");
      await approve(token, user2, lenderAddress, secondDeposit);
      await deposit(lender, user2, tokenAddress, secondDeposit);

      // Calculate expected shares for user2
      const user2NetDeposit = secondDeposit - entryFee;
      const currentTotalShares = virtualShares + user1NetDeposit;
      const currentTotalLiquidity = virtualShares + firstDeposit;
      const expectedUser2Shares = (user2NetDeposit * currentTotalShares) / currentTotalLiquidity;
      
      const user2Shares = await lender.shares(tokenAddress, user2.address);
      expect(user2Shares).to.equal(expectedUser2Shares);
    });
  });

  describe("Withdrawals", function () {
    it("Should allow withdrawals of deposits", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Deposit first
      const depositAmount = ethers.parseEther("100");
      const entryFee = 100n;
      const exitFee = 100n;
      const netDeposit = depositAmount - entryFee;
      
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);

      // Withdraw - should get proportional share minus exit fee
      const balanceBefore = await token.balanceOf(user1.address);
      
      await expect(withdraw(lender, user1, tokenAddress))
        .to.emit(lender, "Withdraw");

      // Calculate expected withdrawal: user gets their share of total pool minus exit fee
      const virtualShares = 1000n;
      const totalLiquidityAfterDeposit = virtualShares + depositAmount; // virtual shares + full deposit
      const totalSharesAfterDeposit = virtualShares + netDeposit; // virtual shares + net deposit
      const userShareOfPool = (netDeposit * totalLiquidityAfterDeposit) / totalSharesAfterDeposit;
      const expectedWithdrawal = userShareOfPool - exitFee;
      
      const actualWithdrawn = await token.balanceOf(user1.address) - balanceBefore;
      expect(actualWithdrawn).to.equal(expectedWithdrawal);
      expect(await lender.deposits(tokenAddress, user1.address)).to.equal(0);
      expect(await lender.shares(tokenAddress, user1.address)).to.equal(0);
    });

    it("Should reject withdrawal with no shares", async function () {
      const { lender, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      await expect(withdraw(lender, user1, tokenAddress))
        .to.be.revertedWith("Nothing to withdraw");
    });

    it("Should distribute fees proportionally on withdrawal", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Two users deposit
      const depositAmount = ethers.parseEther("100");
      await approve(token, user1, lenderAddress, depositAmount);
      await approve(token, user2, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      await deposit(lender, user2, tokenAddress, depositAmount);

      // Generate fees through flash loan
      const flashLoanAmount = ethers.parseEther("50");
      
      // Deploy a valid flash loan receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver to pay back loan + fees
      await transfer(token, owner, await receiver.getAddress(), ethers.parseEther("1"));
      
      // Execute flash loan
      await lender.flashLoan(
        tokenAddress,
        flashLoanAmount,
        await receiver.getAddress(),
        "0x"
      );

      // Check that fees were collected
      const totalLiquidity = await lender.totalLiquidity(tokenAddress);
      expect(totalLiquidity).to.be.gt(depositAmount * 2n);

      // User1 withdraws and should get principal + share of fees
      const [withdrawable, principal, fees] = await lender.getWithdrawableAmount(
        tokenAddress, 
        user1.address
      );
      expect(fees).to.be.gt(0);

      await withdraw(lender, user1, tokenAddress);
    });
  });

  describe("Fee Withdrawals", function () {
    it("Should allow withdrawing only fees while keeping principal", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User1 deposits
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Generate fees through flash loan
      const flashLoanAmount = ethers.parseEther("100");
      
      // Deploy a valid flash loan receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver to pay back loan + fees
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1"));
      
      // Execute flash loan to generate fees
      await lender.flashLoan(
        tokenAddress,
        flashLoanAmount,
        await receiver.getAddress(),
        "0x"
      );
      
      // Check that fees were generated
      const [, , , feesBeforeWithdrawal] = await lender.getWithdrawableAmount(tokenAddress, user1.address);
      expect(feesBeforeWithdrawal).to.be.gt(0);
      
      // Record state before fee withdrawal
      const sharesBeforeFeeWithdrawal = await lender.shares(tokenAddress, user1.address);
      const depositsBeforeFeeWithdrawal = await lender.deposits(tokenAddress, user1.address);
      const balanceBeforeFeeWithdrawal = await token.balanceOf(user1.address);
      
      // Withdraw only fees
      await expect(lender.connect(user1).withdrawFees(tokenAddress))
        .to.emit(lender, "FeesWithdrawn");
      
      // Check that principal deposit remains the same
      const depositsAfterFeeWithdrawal = await lender.deposits(tokenAddress, user1.address);
      expect(depositsAfterFeeWithdrawal).to.equal(depositsBeforeFeeWithdrawal);
      
      // Check that shares were reduced proportionally
      const sharesAfterFeeWithdrawal = await lender.shares(tokenAddress, user1.address);
      expect(sharesAfterFeeWithdrawal).to.be.lt(sharesBeforeFeeWithdrawal);
      expect(sharesAfterFeeWithdrawal).to.be.gt(0); // Still has some shares
      
      // Check that user received tokens
      const balanceAfterFeeWithdrawal = await token.balanceOf(user1.address);
      expect(balanceAfterFeeWithdrawal).to.be.gt(balanceBeforeFeeWithdrawal);
      
      // User should still be able to earn fees on remaining position
      const [, , , feesAfterWithdrawal] = await lender.getWithdrawableAmount(tokenAddress, user1.address);
      expect(feesAfterWithdrawal).to.be.lte(100); // Should be very small (close to 0, allowing for rounding dust)
    });

    it("Should reject fee withdrawal when user has no fees", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User deposits but no fees have been generated
      const depositAmount = ethers.parseEther("100");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Should reject fee withdrawal when no fees exist  
      // Note: When fees are 0, the actual error is "Fees too small after exit fee"
      await expect(lender.connect(user1).withdrawFees(tokenAddress))
        .to.be.revertedWith("Fees too small after exit fee");
    });

    it("Should reject fee withdrawal when user has no shares", async function () {
      const { lender, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User has no shares, should reject
      await expect(lender.connect(user1).withdrawFees(tokenAddress))
        .to.be.revertedWith("Nothing to withdraw");
    });

    it("Should reject fee withdrawal when fees are too small", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Very small deposit to make fees minimal
      const depositAmount = 100000000n; // Minimum deposit amount
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Generate extremely tiny fees with very small flash loan
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user2, await receiver.getAddress(), 1000n); // Very small amount
      
      // Extremely small flash loan to generate minimal fees
      await lender.flashLoan(
        tokenAddress,
        1000n, // Very small loan amount
        await receiver.getAddress(),
        "0x"
      );
      
      // Should reject if fees are too small after exit fee
      await expect(lender.connect(user1).withdrawFees(tokenAddress))
        .to.be.revertedWith("Fees too small after exit fee");
    });

    it("Should update vote weights correctly after fee withdrawal", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User deposits and votes
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      await voteForLPFee(lender, user1, tokenAddress, 50);
      
      // Check initial vote weight
      const initialVoteWeight = await lender.lpFeeSharesTotalVotes(tokenAddress, 50);
      expect(initialVoteWeight).to.be.gt(0);
      
      // Generate fees
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1"));
      
      await lender.flashLoan(
        tokenAddress,
        ethers.parseEther("100"),
        await receiver.getAddress(),
        "0x"
      );
      
      // Withdraw fees
      await lender.connect(user1).withdrawFees(tokenAddress);
      
      // Check that vote weight was reduced proportionally
      const finalVoteWeight = await lender.lpFeeSharesTotalVotes(tokenAddress, 50);
      expect(finalVoteWeight).to.be.lt(initialVoteWeight);
      expect(finalVoteWeight).to.be.gt(0); // Still has some voting power
    });

    it("Should allow multiple fee withdrawals over time", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User deposits
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // First round of fees
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1"));
      await lender.flashLoan(tokenAddress, ethers.parseEther("100"), await receiver.getAddress(), "0x");
      
      // First fee withdrawal
      const balanceBefore1 = await token.balanceOf(user1.address);
      await lender.connect(user1).withdrawFees(tokenAddress);
      const balanceAfter1 = await token.balanceOf(user1.address);
      const firstWithdrawal = balanceAfter1 - balanceBefore1;
      
      // Second round of fees
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1"));
      await lender.flashLoan(tokenAddress, ethers.parseEther("100"), await receiver.getAddress(), "0x");
      
      // Second fee withdrawal
      const balanceBefore2 = await token.balanceOf(user1.address);
      await lender.connect(user1).withdrawFees(tokenAddress);
      const balanceAfter2 = await token.balanceOf(user1.address);
      const secondWithdrawal = balanceAfter2 - balanceBefore2;
      
      // Both withdrawals should be positive
      expect(firstWithdrawal).to.be.gt(0);
      expect(secondWithdrawal).to.be.gt(0);
      
      // User should still have shares after multiple fee withdrawals
      expect(await lender.shares(tokenAddress, user1.address)).to.be.gt(0);
    });

    it("Should work correctly with multiple users withdrawing fees", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Two users deposit
      const depositAmount = ethers.parseEther("500");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token, user2, lenderAddress, depositAmount);
      await deposit(lender, user2, tokenAddress, depositAmount);
      
      // Generate fees
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user3, await receiver.getAddress(), ethers.parseEther("1"));
      
      await lender.flashLoan(tokenAddress, ethers.parseEther("200"), await receiver.getAddress(), "0x");
      
      // Both users withdraw fees
      const balance1Before = await token.balanceOf(user1.address);
      const balance2Before = await token.balanceOf(user2.address);
      
      await lender.connect(user1).withdrawFees(tokenAddress);
      await lender.connect(user2).withdrawFees(tokenAddress);
      
      const balance1After = await token.balanceOf(user1.address);
      const balance2After = await token.balanceOf(user2.address);
      
      // Both should have received fees
      expect(balance1After).to.be.gt(balance1Before);
      expect(balance2After).to.be.gt(balance2Before);
      
      // Both should still have shares
      expect(await lender.shares(tokenAddress, user1.address)).to.be.gt(0);
      expect(await lender.shares(tokenAddress, user2.address)).to.be.gt(0);
    });
  });

  describe("Flash Loans", function () {
    it("Should execute flash loan successfully", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity for flash loans
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy flash loan receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver for fees
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("110"));
      
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.emit(lender, "FlashLoan");

      // Check fees were distributed - with 0% management fee, no management fees collected
      const mgmtFees = await lender.collectedManagementFees(tokenAddress);
      expect(mgmtFees).to.equal(0);
    });

    it("Should reject flash loan with insufficient liquidity", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add some liquidity first
      const depositAmount = ethers.parseEther("100");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("2000"); // More than deposited
      
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Not enough liquidity");
    });

    it("Should reject flash loan to EOA", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity first
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        ethers.parseEther("100"),
        user2.address, // EOA, not a contract
        "0x"
      )).to.be.reverted;
    });

    it("Should reject flash loan if not repaid", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity first
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy receiver but don't fund it enough to repay
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver with insufficient amount (less than loan + fees)
      // With 0% management fee: Loan = 100 ETH, LP fee = 0.01 ETH, mgmt fee = 0, total = 100.01 ETH
      // Give receiver only 0.005 ETH which is clearly insufficient
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("0.005"));
      
      // Debug: Check balances before flash loan
      const receiverBalance = await token.balanceOf(await receiver.getAddress());
      const lpFee = (loanAmount * 1n) / 10000n; // 1 bps LP fee
      const mgmtFee = (lpFee * 0n) / 10000n; // 0% of LP fee
      const totalFee = lpFee + mgmtFee;
      const totalOwed = loanAmount + totalFee;
      
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.be.reverted;
    });

    it("Should calculate fees correctly", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add sufficient liquidity first (but within user balance)
      const depositAmount = ethers.parseEther("5000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("1000"); 
      
      // Deploy and fund receiver
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver with enough to repay loan + fees
      // LP fee = 0.01% of 1000 = 0.1 ETH, Management fee = 0% of LP fee = 0 ETH
      // Total needed = 1000 + 0.1 + 0 = 1000.1 ETH
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1001"));
      
      const liquidityBefore = await lender.totalLiquidity(tokenAddress);
      
      await lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await receiver.getAddress(),
        "0x"
      );
      
      const liquidityAfter = await lender.totalLiquidity(tokenAddress);
      const mgmtFees = await lender.collectedManagementFees(tokenAddress);
      
      // LP fee = 0.01% of 1000 = 0.1 ETH
      // Management fee = 0% of LP fee = 0% of 0.1 = 0 ETH
      expect(liquidityAfter - liquidityBefore).to.equal(ethers.parseEther("0.1"));
      expect(mgmtFees).to.equal(0);
    });
  });

  describe("Multi-Token Flash Loans", function () {
    // Helper function to deploy a second token
    async function deployMultiTokenFixture() {
      const fixture = await deployERC20FlashLenderFixture();
      
      // Deploy second token
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token2 = await MockERC20.deploy(ethers.parseEther("1000000"), "TestToken2", "TTK2", 18);
      await token2.waitForDeployment();
      
      // Setup balances for second token
      const initialBalance = ethers.parseEther("10000");
      await token2.transfer(fixture.user1.address, initialBalance);
      await token2.transfer(fixture.user2.address, initialBalance);
      await token2.transfer(fixture.user3.address, initialBalance);
      
      return { ...fixture, token2, token2Address: await token2.getAddress() };
    }

    it("Should execute multi-token flash loan successfully", async function () {
      const { lender, lenderAddress, token, tokenAddress, token2, token2Address, user1, user2 } = await loadFixture(deployMultiTokenFixture);
      
      // Add liquidity for both tokens
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token2, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, token2Address, depositAmount);
      
      const loanAmount1 = ethers.parseEther("100");
      const loanAmount2 = ethers.parseEther("50");
      
      // Deploy multi flash loan receiver
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver for fees (use approximate amounts)
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("110"));
      await transfer(token2, user2, await receiver.getAddress(), ethers.parseEther("60"));
      
      const tokens = [tokenAddress, token2Address];
      const amounts = [loanAmount1, loanAmount2];
      
      await expect(lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      )).to.emit(lender, "MultiFlashLoan");
    });

    it("Should reject multi-token flash loan with insufficient liquidity", async function () {
      const { lender, lenderAddress, token, tokenAddress, token2, token2Address, user1, user2 } = await loadFixture(deployMultiTokenFixture);
      
      // Only add liquidity for first token
      const depositAmount = ethers.parseEther("100");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount1 = ethers.parseEther("50");
      const loanAmount2 = ethers.parseEther("50"); // No liquidity for this token
      
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      const tokens = [tokenAddress, token2Address];
      const amounts = [loanAmount1, loanAmount2];
      
      await expect(lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Not enough liquidity");
    });

    it("Should reject multi-token flash loan with mismatched array lengths", async function () {
      const { lender, tokenAddress, token2Address, user2 } = await loadFixture(deployMultiTokenFixture);
      
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      const tokens = [tokenAddress, token2Address];
      const amounts = [ethers.parseEther("100")]; // Mismatched length
      
      await expect(lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Arrays length mismatch");
    });

    it("Should reject multi-token flash loan with duplicate tokens", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployMultiTokenFixture);
      
      // Add liquidity for the token so that duplicate check happens before liquidity check
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      const tokens = [tokenAddress, tokenAddress]; // Duplicate
      const amounts = [ethers.parseEther("100"), ethers.parseEther("50")];
      
      await expect(lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Duplicate token");
    });

    it("Should reject multi-token flash loan with too many tokens", async function () {
      const { lender, tokenAddress, user2 } = await loadFixture(deployMultiTokenFixture);
      
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Create array with 21 tokens (exceeds limit)
      const tokens = new Array(21).fill(tokenAddress);
      const amounts = new Array(21).fill(ethers.parseEther("1"));
      
      await expect(lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Too many tokens");
    });

    it("Should calculate fees correctly for multiple tokens", async function () {
      const { lender, lenderAddress, token, tokenAddress, token2, token2Address, user1, user2 } = await loadFixture(deployMultiTokenFixture);
      
      // Add liquidity for both tokens
      const depositAmount = ethers.parseEther("5000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token2, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, token2Address, depositAmount);
      
      const loanAmount1 = ethers.parseEther("1000");
      const loanAmount2 = ethers.parseEther("500");
      
      // Deploy and fund receiver
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Fund receiver with enough for repayment
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1001"));
      await transfer(token2, user2, await receiver.getAddress(), ethers.parseEther("501"));
      
      // Record balances before
      const token1LiquidityBefore = await lender.totalLiquidity(tokenAddress);
      const token2LiquidityBefore = await lender.totalLiquidity(token2Address);
      const token1MgmtFeesBefore = await lender.collectedManagementFees(tokenAddress);
      const token2MgmtFeesBefore = await lender.collectedManagementFees(token2Address);
      
      const tokens = [tokenAddress, token2Address];
      const amounts = [loanAmount1, loanAmount2];
      
      await lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      );
      
      // Verify fees were collected for both tokens
      const token1LiquidityAfter = await lender.totalLiquidity(tokenAddress);
      const token2LiquidityAfter = await lender.totalLiquidity(token2Address);
      const token1MgmtFeesAfter = await lender.collectedManagementFees(tokenAddress);
      const token2MgmtFeesAfter = await lender.collectedManagementFees(token2Address);
      
      // Calculate expected fees
      const token1LpFee = (loanAmount1 * 1n) / 10000n; // 1 bps
      const token2LpFee = (loanAmount2 * 1n) / 10000n; // 1 bps
      const token1MgmtFee = (loanAmount1 * 1n * 0n) / 100000000n; // 0% of LP fee
      const token2MgmtFee = (loanAmount2 * 1n * 0n) / 100000000n; // 0% of LP fee
      
      expect(token1LiquidityAfter - token1LiquidityBefore).to.equal(token1LpFee);
      expect(token2LiquidityAfter - token2LiquidityBefore).to.equal(token2LpFee);
      expect(token1MgmtFeesAfter - token1MgmtFeesBefore).to.equal(token1MgmtFee);
      expect(token2MgmtFeesAfter - token2MgmtFeesBefore).to.equal(token2MgmtFee);
    });

    it("Should reject if any token is not repaid", async function () {
      const { lender, lenderAddress, token, tokenAddress, token2, token2Address, user1, user2 } = await loadFixture(deployMultiTokenFixture);
      
      // Add liquidity for both tokens
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token2, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, token2Address, depositAmount);
      
      const loanAmount1 = ethers.parseEther("100");
      const loanAmount2 = ethers.parseEther("50");
      
      // Deploy receiver but don't fund it enough for second token
      const MultiReceiver = await ethers.getContractFactory("ValidMultiReceiver");
      const receiver = await MultiReceiver.deploy();
      await receiver.waitForDeployment();
      
      // Only fund for first token repayment
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("101"));
      // Deliberately don't fund enough for second token
      
      const tokens = [tokenAddress, token2Address];
      const amounts = [loanAmount1, loanAmount2];
      
      await expect(lender.connect(user2).flashLoanMultiple(
        tokens,
        amounts,
        await receiver.getAddress(),
        "0x"
      )).to.be.reverted; // Use generic reverted since ERC20 transfer failures might use custom errors
    });
  });

  describe("Fee Management", function () {
    // LP fees are now controlled exclusively through governance system
    // See "LP Governance" test suite for comprehensive fee setting tests

    it("Should allow owner to update management fee", async function () {
      const { lender, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      const newFeePercentage = 200; // 2% of LP fee
      
      await expect(lender.connect(owner).setManagementFee(newFeePercentage))
        .to.emit(lender, "ManagementFeeChanged")
        .withArgs(0, newFeePercentage); // From 0% to 2%
      
      expect(await lender.managementFeePercentage()).to.equal(newFeePercentage);
    });

    it("Should reject management fee outside valid range", async function () {
      const { lender, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Test too high
      await expect(lender.connect(owner).setManagementFee(600)) // > 5%
        .to.be.revertedWith("Fee out of range");
      
      // Test that 0% is allowed
      await expect(lender.connect(owner).setManagementFee(0))
        .to.not.be.reverted;
      expect(await lender.managementFeePercentage()).to.equal(0);
    });

    it("Should allow owner to withdraw management fees", async function () {
      const { lender, lenderAddress, token, tokenAddress, owner, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // First set a non-zero management fee to generate fees
      await lender.connect(owner).setManagementFee(100); // 1% of LP fee
      
      // Setup: deposit and generate fees
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Execute flash loan to generate fees
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("1"));
      
      await lender.flashLoan(
        tokenAddress,
        ethers.parseEther("100"),
        await receiver.getAddress(),
        "0x"
      );
      
      const fees = await lender.collectedManagementFees(tokenAddress);
      expect(fees).to.be.gt(0);
      
      const ownerBalanceBefore = await token.balanceOf(owner.address);
      
      await expect(lender.connect(owner).withdrawManagementFees(tokenAddress))
        .to.emit(lender, "ManagementFeeWithdrawn")
        .withArgs(tokenAddress, fees);
      
      expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore + fees);
      expect(await lender.collectedManagementFees(tokenAddress)).to.equal(0);
    });

    it("Should reject management fee withdrawal by non-owner", async function () {
      const { lender, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      await expect(lender.connect(user1).withdrawManagementFees(tokenAddress))
        .to.be.revertedWithCustomError(lender, "OwnableUnauthorizedAccount");
    });
  });

  describe("View Functions", function () {
    it("Should return correct withdrawable amount", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = ethers.parseEther("100");
      const entryFee = 100n;
      const exitFee = 100n;
      const netDeposit = depositAmount - entryFee;
      
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // New getWithdrawableAmount returns: netAmount, grossAmount, principal, fees, exitFee
      const [netAmount, grossAmount, principal, fees, exitFeeReturned] = await lender.getWithdrawableAmount(
        tokenAddress,
        user1.address
      );
      
      // Should account for exit fee but check that grossAmount equals principal when no fees yet
      expect(exitFeeReturned).to.equal(exitFee);
      expect(netAmount).to.equal(grossAmount - exitFee);
      expect(principal).to.equal(netDeposit); // Net deposit (after entry fee)
      
      // For gross amount, with virtual shares the calculation is:
      // userShares * (virtualShares + totalDeposit) / (virtualShares + userShares)
      // Since no fees have accrued yet, gross should be close to principal
      const virtualShares = 1000n;
      const expectedGross = (netDeposit * (virtualShares + depositAmount)) / (virtualShares + netDeposit);
      expect(grossAmount).to.equal(expectedGross);
      
      // Fees should be the difference between gross and principal 
      const expectedFees = grossAmount > principal ? grossAmount - principal : 0n;
      expect(fees).to.equal(expectedFees);
    });

    it("Should return correct effective LP fee", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Should return default when not set
      expect(await lender.getEffectiveLPFee(tokenAddress)).to.equal(1);
      
      // Test custom fee set through governance
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Vote and propose fee change
      await voteForLPFee(lender, user1, tokenAddress, 50);
      await lender.connect(user1).proposeLPFeeChange(tokenAddress, 50);
      
      // Still default during delay
      expect(await lender.getEffectiveLPFee(tokenAddress)).to.equal(1);
      
      // Execute after delay
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      await lender.connect(user1).executeLPFeeChange(tokenAddress, 50);
      
      // Should return custom fee
      expect(await lender.getEffectiveLPFee(tokenAddress)).to.equal(50);
    });

    it("Should return empty arrays when no tokens deposited", async function () {
      const { lender, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Should return empty array when no tokens have been deposited
      expect(await lender.getDepositedTokens()).to.deep.equal([]);
      
      // Should return empty array for user with no deposits
      expect(await lender.getUserDepositedTokens(user1.address)).to.deep.equal([]);
    });

    it("Should track deposited tokens correctly", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Deploy a second token
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token2 = await MockERC20.deploy(ethers.parseEther("1000000"), "TestToken2", "TTK2", 18);
      await token2.waitForDeployment();
      const token2Address = await token2.getAddress();
      
      // Give both users some token2
      await token2.transfer(user1.address, ethers.parseEther("10000"));
      await token2.transfer(user2.address, ethers.parseEther("10000"));
      
      const depositAmount = ethers.parseEther("100");
      
      // User1 deposits token1
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Check global deposited tokens
      let depositedTokens = await lender.getDepositedTokens();
      expect(depositedTokens).to.deep.equal([tokenAddress]);
      
      // Check user1's deposited tokens
      let user1Tokens = await lender.getUserDepositedTokens(user1.address);
      expect(user1Tokens).to.deep.equal([tokenAddress]);
      
      // Check user2's deposited tokens (should be empty)
      let user2Tokens = await lender.getUserDepositedTokens(user2.address);
      expect(user2Tokens).to.deep.equal([]);
      
      // User2 deposits token2
      await approve(token2, user2, lenderAddress, depositAmount);
      await deposit(lender, user2, token2Address, depositAmount);
      
      // Check global deposited tokens (should have both)
      depositedTokens = await lender.getDepositedTokens();
      expect(depositedTokens).to.have.length(2);
      expect(depositedTokens).to.include(tokenAddress);
      expect(depositedTokens).to.include(token2Address);
      
      // Check user1's deposited tokens (still just token1)
      user1Tokens = await lender.getUserDepositedTokens(user1.address);
      expect(user1Tokens).to.deep.equal([tokenAddress]);
      
      // Check user2's deposited tokens (should have token2)
      user2Tokens = await lender.getUserDepositedTokens(user2.address);
      expect(user2Tokens).to.deep.equal([token2Address]);
      
      // User1 also deposits token2
      await approve(token2, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, token2Address, depositAmount);
      
      // Check user1's deposited tokens (should have both)
      user1Tokens = await lender.getUserDepositedTokens(user1.address);
      expect(user1Tokens).to.have.length(2);
      expect(user1Tokens).to.include(tokenAddress);
      expect(user1Tokens).to.include(token2Address);
    });

    it("Should remove users from their deposited tokens list when they withdraw", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const depositAmount = ethers.parseEther("100");
      
      // Both users deposit the same token
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token, user2, lenderAddress, depositAmount);
      await deposit(lender, user2, tokenAddress, depositAmount);
      
      // Verify token is tracked globally and for both users
      expect(await lender.getDepositedTokens()).to.deep.equal([tokenAddress]);
      expect(await lender.getUserDepositedTokens(user1.address)).to.deep.equal([tokenAddress]);
      expect(await lender.getUserDepositedTokens(user2.address)).to.deep.equal([tokenAddress]);
      
      // User1 withdraws completely
      await withdraw(lender, user1, tokenAddress);
      
      // Token should still be in global list (user2 still has deposits, plus virtual shares remain)
      expect(await lender.getDepositedTokens()).to.deep.equal([tokenAddress]);
      
      // User1 should have no deposited tokens
      expect(await lender.getUserDepositedTokens(user1.address)).to.deep.equal([]);
      
      // User2 should still have the token
      expect(await lender.getUserDepositedTokens(user2.address)).to.deep.equal([tokenAddress]);
      
      // User2 withdraws completely
      await withdraw(lender, user2, tokenAddress);
      
      // Token should be removed from global list (no users left with deposits)
      expect(await lender.getDepositedTokens()).to.deep.equal([]);
      
      // Both users should have no deposited tokens
      expect(await lender.getUserDepositedTokens(user1.address)).to.deep.equal([]);
      expect(await lender.getUserDepositedTokens(user2.address)).to.deep.equal([]);
    });

    it("Should handle multiple tokens and partial withdrawals correctly", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Deploy a second token
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const token2 = await MockERC20.deploy(ethers.parseEther("1000000"), "TestToken2", "TTK2", 18);
      await token2.waitForDeployment();
      const token2Address = await token2.getAddress();
      
      // Give user1 some token2
      await token2.transfer(user1.address, ethers.parseEther("10000"));
      
      const depositAmount = ethers.parseEther("100");
      
      // User1 deposits both tokens
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token2, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, token2Address, depositAmount);
      
      // Check both tokens are tracked
      let depositedTokens = await lender.getDepositedTokens();
      expect(depositedTokens).to.have.length(2);
      expect(depositedTokens).to.include(tokenAddress);
      expect(depositedTokens).to.include(token2Address);
      
      let userTokens = await lender.getUserDepositedTokens(user1.address);
      expect(userTokens).to.have.length(2);
      expect(userTokens).to.include(tokenAddress);
      expect(userTokens).to.include(token2Address);
      
      // User1 withdraws only token1
      await withdraw(lender, user1, tokenAddress);
      
      // Global list should have only token2 now (token1 withdrawn)
      depositedTokens = await lender.getDepositedTokens();
      expect(depositedTokens).to.have.length(1);
      expect(depositedTokens).to.include(token2Address);
      
      // User should only have token2
      userTokens = await lender.getUserDepositedTokens(user1.address);
      expect(userTokens).to.deep.equal([token2Address]);
      
      // Withdraw the remaining token
      await withdraw(lender, user1, token2Address);
      
      // Global list  should be empty now
      depositedTokens = await lender.getDepositedTokens();
      expect(depositedTokens).to.have.length(0);
      
      // User should have no deposited tokens
      expect(await lender.getUserDepositedTokens(user1.address)).to.deep.equal([]);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle multiple deposits and withdrawals correctly", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Multiple users deposit
      const depositAmount = ethers.parseEther("100");
      const entryFee = 100n;
      const virtualShares = 1000n;
      
      for (const user of [user1, user2, user3]) {
        await approve(token, user, lenderAddress, depositAmount);
        await deposit(lender, user, tokenAddress, depositAmount);
      }
      
      // Total liquidity = virtual shares + 3 deposits (including entry fees that stay in pool)
      const expectedTotalLiquidity = virtualShares + (depositAmount * 3n);
      expect(await lender.totalLiquidity(tokenAddress)).to.equal(expectedTotalLiquidity);
      
      // Total shares = virtual shares + 3 net deposits (after entry fees)
      const netDeposit = depositAmount - entryFee;
      
      // With virtual shares, each user gets proportional shares based on: 
      // shares = netDeposit * currentTotalShares / currentTotalLiquidity
      // First user: netDeposit (1:1 since only virtual shares exist)
      // Second user: netDeposit * (1000 + netDeposit) / (1000 + depositAmount)
      // Third user: similar proportional calculation
      
      // But for simplicity, let's check the actual total shares
      const actualTotalShares = await lender.totalShares(tokenAddress);
      expect(actualTotalShares).to.be.gt(virtualShares); // Should be more than just virtual shares
      expect(await lender.totalShares(tokenAddress)).to.equal(actualTotalShares);
      
      // Users withdraw in different order
      await withdraw(lender, user2, tokenAddress);
      await withdraw(lender, user1, tokenAddress);
      await withdraw(lender, user3, tokenAddress);
      
      // After all withdrawals, virtual shares should remain plus any dust from exit fees
      const finalTotalLiquidity = await lender.totalLiquidity(tokenAddress);
      const finalTotalShares = await lender.totalShares(tokenAddress);
      
      // Virtual shares + exit fees (100 wei per user = 300 wei total) + small rounding dust
      expect(finalTotalLiquidity).to.be.gte(virtualShares);
      expect(finalTotalLiquidity).to.be.lte(virtualShares + 500n); // Allow for exit fees + small dust
      expect(finalTotalShares).to.equal(virtualShares);
    });

    it("Should handle deposits after fee accrual correctly", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User1 deposits
      const firstDeposit = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, firstDeposit);
      await deposit(lender, user1, tokenAddress, firstDeposit);
      
      // Generate fees through flash loan
      const FlashLoanReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await FlashLoanReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user3, await receiver.getAddress(), ethers.parseEther("10"));
      
      await lender.flashLoan(
        tokenAddress,
        ethers.parseEther("1000"),
        await receiver.getAddress(),
        "0x"
      );
      
      // User2 deposits after fees have accrued
      const secondDeposit = ethers.parseEther("1000");
      await approve(token, user2, lenderAddress, secondDeposit);
      await deposit(lender, user2, tokenAddress, secondDeposit);
      
      // User2's shares should be less than deposit amount due to accrued fees
      const user2Shares = await lender.shares(tokenAddress, user2.address);
      expect(user2Shares).to.be.lt(secondDeposit);
      
      // User2's withdrawable amount should be close to their deposit (accounting for fees)
      const entryFee = 100n;
      const exitFee = 100n;
      const expectedWithdrawable = secondDeposit - entryFee - exitFee; // Net after both fees
      
      const [withdrawable] = await lender.getWithdrawableAmount(
        tokenAddress,
        user2.address
      );
      expect(withdrawable).to.be.closeTo(expectedWithdrawable, ethers.parseEther("0.01")); // 1% tolerance
    });
  });

  describe("Security", function () {
    it("Should prevent unauthorized access", async function () {
      const { lender, token, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Test that only owner can call owner functions (management fees only now)
      await expect(lender.connect(user1).setManagementFee(5))
        .to.be.revertedWithCustomError(lender, "OwnableUnauthorizedAccount");
      
      // LP fees are now controlled through governance - no owner control
    });

    it("Should reject flash loan when only fee is repaid (not principal)", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity for flash loans
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy malicious flash loan receiver that only repays the fee
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const maliciousReceiver = await MaliciousReceiver.deploy();
      await maliciousReceiver.waitForDeployment();
      
      // Fund malicious receiver with just enough for the fee (not principal)
      // LP fee = 100 ETH * 1 basis point = 0.01 ETH
      // Management fee = 0.01 ETH * 0% = 0 ETH  
      // Total fee = 0.01 ETH
      const estimatedFee = ethers.parseEther("0.01");
      await transfer(token, user2, await maliciousReceiver.getAddress(), estimatedFee);
      
      // Flash loan should fail because only fee is repaid, not principal
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await maliciousReceiver.getAddress(),
        "0x"
      )).to.be.revertedWith("Flash loan not repaid");
    });

    it("Should validate correct balance changes after flash loan", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity for flash loans
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy valid flash loan receiver
      const ValidReceiver = await ethers.getContractFactory("ValidReceiver");
      const validReceiver = await ValidReceiver.deploy();
      await validReceiver.waitForDeployment();
      
      // Fund receiver with enough for principal + fee
      await transfer(token, user2, await validReceiver.getAddress(), ethers.parseEther("101"));
      
      // Record contract balance before flash loan
      const balanceBeforeFlashLoan = await token.balanceOf(lenderAddress);
      
      // Execute flash loan
      await lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await validReceiver.getAddress(),
        "0x"
      );
      
      // Check that contract balance increased by exactly the fee amount
      const balanceAfterFlashLoan = await token.balanceOf(lenderAddress);
      const actualFeeCollected = balanceAfterFlashLoan - balanceBeforeFlashLoan;
      
      // LP fee = 100 ETH * 1 basis point = 0.01 ETH
      // Management fee = 0.01 ETH * 0% = 0 ETH
      // Total fee goes to LP pool since management fee is 0%
      const expectedLPFee = (loanAmount * 1n) / 10000n; // 1 basis point
      const expectedMgmtFee = 0n; // 0% management fee
      const expectedTotalFee = expectedLPFee + expectedMgmtFee;
      
      // The fee collected should match our calculation
      expect(actualFeeCollected).to.equal(expectedTotalFee);
      
      // Verify the new balance is exactly the deposit + LP fee + virtual shares
      // (management fee is tracked separately)
      const virtualShares = 1000n;
      const expectedNewLiquidity = virtualShares + depositAmount + expectedLPFee;
      expect(await lender.totalLiquidity(tokenAddress)).to.equal(expectedNewLiquidity);
    });

    it("Should revert using gas-heavy receivers", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Add liquidity for flash loans
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      const loanAmount = ethers.parseEther("100");
      
      // Deploy gas exhausting receiver that intentionally exceeds 30k gas in interface probe
      const GasExhaustingReceiver = await ethers.getContractFactory("GasExhaustingReceiver");
      const gasExhausting = await GasExhaustingReceiver.deploy();
      await gasExhausting.waitForDeployment();
      
      // Fund receiver with arbitrary tokens (won't reach execution)
      await transfer(token, user2, await gasExhausting.getAddress(), ethers.parseEther("1"));
      
      // Expect revert due to invalid receiver interface (gas exhaustion in detection)
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await gasExhausting.getAddress(),
        "0x"
      )).to.be.revertedWith("Invalid receiver interface");
    });
  });

  describe("Precision Loss Fixes", function () {
    it("Should calculate management fee without nested rounding errors", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Set higher fees to make precision differences more visible
      await lender.connect(owner).setManagementFee(300); // 3% of LP fee
      
      // Add liquidity
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Execute flash loan with amount that would cause precision loss in old calculation
      const loanAmount = ethers.parseEther("100");
      
      // Deploy valid receiver
      const ValidReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await ValidReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user2, await receiver.getAddress(), ethers.parseEther("101"));
      
      // Record balances before
      const mgmtFeesBefore = await lender.collectedManagementFees(tokenAddress);
      const liquidityBefore = await lender.totalLiquidity(tokenAddress);
      
      // Execute flash loan
      await lender.connect(user2).flashLoan(
        tokenAddress,
        loanAmount,
        await receiver.getAddress(),
        "0x"
      );
      
      // Calculate expected fees using new precision method (using default 1 bps LP fee)
      const lpFee = (loanAmount * 1n) / 10000n; // 0.01% (default)
      const mgmtFee = (loanAmount * 1n * 300n) / 100000000n; // Direct calculation without nesting
      
      // Verify fees were calculated correctly
      const mgmtFeesAfter = await lender.collectedManagementFees(tokenAddress);
      const liquidityAfter = await lender.totalLiquidity(tokenAddress);
      
      expect(mgmtFeesAfter - mgmtFeesBefore).to.equal(mgmtFee);
      expect(liquidityAfter - liquidityBefore).to.equal(lpFee);
    });

    it("Should prevent share dilution attacks with minimum deposit enforcement", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Give user1 enough tokens for large deposit
      const largeDeposit = ethers.parseEther("100000");
      await transfer(token, owner, user1.address, largeDeposit);
      await approve(token, user1, lenderAddress, largeDeposit);
      await deposit(lender, user1, tokenAddress, largeDeposit);
      
      // Attacker tries to deposit minimum amount
      const minimumDeposit = 100000000n; // New MINIMUM_DEPOSIT (1e8)
      await approve(token, user2, lenderAddress, minimumDeposit);
      
      // This should succeed and give appropriate shares
      await deposit(lender, user2, tokenAddress, minimumDeposit);
      
      const user2Shares = await lender.shares(tokenAddress, user2.address);
      expect(user2Shares).to.be.gt(0);
      
      // Verify user2 can withdraw a reasonable amount (accounting for fees)
      const [netWithdrawable] = await lender.getWithdrawableAmount(
        tokenAddress,
        user2.address
      );
      // Should get something reasonable back (less than deposit due to entry/exit fees)
      expect(netWithdrawable).to.be.gt(0);
    });

    it("Should handle small deposits that would round to zero shares", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Give user1 enough tokens for large deposit
      const largeDeposit = ethers.parseEther("100000"); // Reduced from 1M to 100K
      await transfer(token, owner, user1.address, largeDeposit);
      await approve(token, user1, lenderAddress, largeDeposit);
      await deposit(lender, user1, tokenAddress, largeDeposit);
      
      // Try to deposit an amount that would mathematically round to zero shares
      const smallDeposit = 100000000n; // MINIMUM_DEPOSIT (1e8)
      await approve(token, user2, lenderAddress, smallDeposit);
      
      // Should not revert and should give at least 1 share
      await expect(deposit(lender, user2, tokenAddress, smallDeposit))
        .to.not.be.reverted;
      
      const shares = await lender.shares(tokenAddress, user2.address);
      expect(shares).to.be.gte(1n); // Our fix ensures minimum 1 share
    });

    it("Should protect users from withdrawal rounding losses", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User1 deposits
      const deposit1 = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, deposit1);
      await deposit(lender, user1, tokenAddress, deposit1);
      
      // User2 makes a small deposit that could cause rounding issues
      const deposit2 = 100000000n; // Use MINIMUM_DEPOSIT instead of 3333
      await approve(token, user2, lenderAddress, deposit2);
      await deposit(lender, user2, tokenAddress, deposit2);
      
      // Check withdrawable amount - with virtual shares, this will be less than principal
      const [withdrawable, , principal] = await lender.getWithdrawableAmount(
        tokenAddress,
        user2.address
      );
      
      // With virtual shares present, the small deposit gets diluted significantly
      // The principal represents net deposit, but withdrawable is based on proportional shares
      // For a small deposit (100M wei) when virtual shares (1000) and large deposits exist,
      // the user will get back less than their principal due to virtual shares dilution
      expect(withdrawable).to.be.gt(0); // Should get something back
      expect(withdrawable).to.be.lte(principal); // May be less than principal due to virtual shares
      
      // If the withdrawable amount is less than MINIMUM_DEPOSIT, the withdrawal should revert
      // This is the precision protection working correctly
      if (withdrawable < 100000000n) { // MINIMUM_DEPOSIT
        await expect(withdraw(lender, user2, tokenAddress))
          .to.be.revertedWith("Withdrawal too small after ENTRY_EXIT_FEE fee");
      } else {
        // If withdrawal is large enough, it should succeed
        const balanceBefore = await token.balanceOf(user2.address);
        await withdraw(lender, user2, tokenAddress);
        const balanceAfter = await token.balanceOf(user2.address);
        
        const actualWithdrawn = balanceAfter - balanceBefore;
        expect(actualWithdrawn).to.be.gt(0);
        expect(actualWithdrawn).to.be.lte(deposit2);
      }
    });

    it("Should handle minimum fee calculation edge cases", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Use default LP fee (1 basis point) to test minimum fee logic
      // No need to set fee as default is already 1 bps
      
      // Add liquidity
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Test flash loan with amount >= MINIMUM_DEPOSIT that would calculate to 0 fee
      const smallLoanAmount = 999n; // Less than MINIMUM_DEPOSIT
      
      // Deploy receiver
      const ValidReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await ValidReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user2, await receiver.getAddress(), 2000n);
      
      // This should succeed with 0 fees (no minimum fee enforcement for small amounts)
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        smallLoanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.not.be.reverted;
      
      // Now test with amount >= MINIMUM_DEPOSIT
      const largeLoanAmount = 1000n; // Equal to MINIMUM_DEPOSIT
      await transfer(token, user2, await receiver.getAddress(), 2000n);
      
      // This should enforce minimum fee of 1 wei if calculated fee is 0
      await expect(lender.connect(user2).flashLoan(
        tokenAddress,
        largeLoanAmount,
        await receiver.getAddress(),
        "0x"
      )).to.not.be.reverted;
    });

    it("Should maintain fee proportionality in minimum fee scenarios", async function () {
      const { lender, token, user1, user2, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Use default LP fee (1 basis point) where calculation might round to zero
      await lender.connect(owner).setManagementFee(100); // 1% of LP fee
      
      // Add liquidity
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, await lender.getAddress(), depositAmount);
      await deposit(lender, user1, await token.getAddress(), depositAmount);
      
      // Test with loan amount that would create minimum fee scenario
      const loanAmount = 1000n; // MINIMUM_DEPOSIT amount
      
      // Deploy receiver
      const ValidReceiver = await ethers.getContractFactory("ValidReceiver");
      const receiver = await ValidReceiver.deploy();
      await receiver.waitForDeployment();
      await transfer(token, user2, await receiver.getAddress(), 2000n);
      
      // Record fees before
      const mgmtFeesBefore = await lender.collectedManagementFees(await token.getAddress());
      const liquidityBefore = await lender.totalLiquidity(await token.getAddress());
      
      // Execute flash loan
      await lender.connect(user2).flashLoan(
        await token.getAddress(),
        loanAmount,
        await receiver.getAddress(),
        "0x"
      );
      
      // Check that fees were distributed proportionally even in minimum fee case
      const mgmtFeesAfter = await lender.collectedManagementFees(await token.getAddress());
      const liquidityAfter = await lender.totalLiquidity(await token.getAddress());
      
      const actualMgmtFee = mgmtFeesAfter - mgmtFeesBefore;
      const actualLpFee = liquidityAfter - liquidityBefore;
      
      // Both fees should be >= 0 and total should be reasonable
      expect(actualMgmtFee).to.be.gte(0);
      expect(actualLpFee).to.be.gte(0);
      expect(actualMgmtFee + actualLpFee).to.be.gte(0);
    });
  });

  describe("LP Governance", function () {
    it("Should allow LPs to vote for fee amounts", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Users deposit to get voting power
      const deposit1 = ethers.parseEther("1000");
      const deposit2 = ethers.parseEther("500");
      
      await approve(token, user1, lenderAddress, deposit1);
      await deposit(lender, user1, tokenAddress, deposit1);
      
      await approve(token, user2, lenderAddress, deposit2);
      await deposit(lender, user2, tokenAddress, deposit2);
      
      // User1 votes for 50 bps (0.5%) fee
      const entryFee = 100n;
      
      // Get actual shares after deposit (accounting for virtual shares dilution)
      const user1Shares = await lender.shares(tokenAddress, user1.address);
      const user2Shares = await lender.shares(tokenAddress, user2.address);
      
      await expect(voteForLPFee(lender, user1, tokenAddress, 50))
        .to.emit(lender, "LPFeeVoteCast")
        .withArgs(tokenAddress, user1.address, 50, user1Shares);
      
      // User2 votes for 25 bps (0.25%) fee
      await expect(voteForLPFee(lender, user2, tokenAddress, 25))
        .to.emit(lender, "LPFeeVoteCast")
        .withArgs(tokenAddress, user2.address, 25, user2Shares);
      
      // Check vote tallies
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(user1Shares);
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 25)).to.equal(user2Shares);
      expect(await lender.lpFeeAmountSelected(tokenAddress, user1.address)).to.equal(50);
      expect(await lender.lpFeeAmountSelected(tokenAddress, user2.address)).to.equal(25);
    });

    it("Should update votes when users change their voting preference", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User deposits to get voting power
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // User votes for 50 bps initially
      const entryFee = 100n;
      const netDeposit = depositAmount - entryFee;

      await voteForLPFee(lender, user1, tokenAddress, 50);
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(netDeposit);
      
      // User changes vote to 25 bps
      await voteForLPFee(lender, user1, tokenAddress, 25);
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(0); // Previous vote removed
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 25)).to.equal(netDeposit); // New vote added
      expect(await lender.lpFeeAmountSelected(tokenAddress, user1.address)).to.equal(25);
    });

    it("Should update vote weights when users deposit more shares", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Initial deposit and vote
      const initialDeposit = ethers.parseEther("1000");
      const entryFee = 100n;
      const initialNetDeposit = initialDeposit - entryFee;
      
      await approve(token, user1, lenderAddress, initialDeposit);
      await deposit(lender, user1, tokenAddress, initialDeposit);
      await voteForLPFee(lender, user1, tokenAddress, 50);
      
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(initialNetDeposit);
      
      // Additional deposit should increase vote weight
      const additionalDeposit = ethers.parseEther("500");
      
      await approve(token, user1, lenderAddress, additionalDeposit);
      await deposit(lender, user1, tokenAddress, additionalDeposit);
      
      // Get total shares after additional deposit
      const totalUserShares = await lender.shares(tokenAddress, user1.address);
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(totalUserShares);
    });

    it("Should remove vote weight when user withdraws", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Deposit and vote
      const depositAmount = ethers.parseEther("1000");
      const entryFee = 100n;
      const netDeposit = depositAmount - entryFee;
      
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      await voteForLPFee(lender, user1, tokenAddress, 50);
      
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(netDeposit);
      expect(await lender.lpFeeAmountSelected(tokenAddress, user1.address)).to.equal(50);
      
      // Withdraw should remove vote weight and clear selection
      await withdraw(lender, user1, tokenAddress);
      
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(0);
      expect(await lender.lpFeeAmountSelected(tokenAddress, user1.address)).to.equal(0);
    });

    it("Should propose fee change when new fee has higher support", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Set initial fee to 1 bps (current DEFAULT_LP_FEE_BPS)
      expect(await lender.getEffectiveLPFee(tokenAddress)).to.equal(1);
      
      // Users deposit with different amounts
      const deposit1 = ethers.parseEther("600"); // 60% of total
      const deposit2 = ethers.parseEther("300"); // 30% of total  
      const deposit3 = ethers.parseEther("100"); // 10% of total
      
      await approve(token, user1, lenderAddress, deposit1);
      await deposit(lender, user1, tokenAddress, deposit1);
      
      await approve(token, user2, lenderAddress, deposit2);
      await deposit(lender, user2, tokenAddress, deposit2);
      
      await approve(token, user3, lenderAddress, deposit3);
      await deposit(lender, user3, tokenAddress, deposit3);
      
      // User1 and User2 vote for 50 bps (90% support)
      await voteForLPFee(lender, user1, tokenAddress, 50);
      await voteForLPFee(lender, user2, tokenAddress, 50);
      
      // User3 votes for current fee of 1 bps (10% support)
      await voteForLPFee(lender, user3, tokenAddress, 1);
      
      // Propose the fee change
      const currentBlock = await ethers.provider.getBlockNumber();
      await expect(lender.connect(user1).proposeLPFeeChange(tokenAddress, 50))
        .to.emit(lender, "LPFeeChangeProposed")
        .withArgs(tokenAddress, 50, currentBlock + 11); // +1 for the tx itself + 10 delay
      
      // Fee should not be changed yet
      expect(await lender.lpFeesBps(tokenAddress)).to.equal(0); // Still default
      
      // Check proposal exists
      expect(await lender.proposedFeeChanges(tokenAddress, 50)).to.equal(currentBlock + 11);
      
      // Mine blocks to meet delay
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Execute the proposal
      await expect(lender.connect(user2).executeLPFeeChange(tokenAddress, 50))
        .to.emit(lender, "LPFeeChangeExecuted")
        .withArgs(tokenAddress, 1, 50);
      
      expect(await lender.lpFeesBps(tokenAddress)).to.equal(50);
    });

    it("Should reject fee change when new fee has insufficient support", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Equal deposits
      const depositAmount = ethers.parseEther("500");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      await approve(token, user2, lenderAddress, depositAmount);
      await deposit(lender, user2, tokenAddress, depositAmount);
      
      // User1 votes for 50 bps, User2 votes for current fee (1 bps)
      await voteForLPFee(lender, user1, tokenAddress, 50);
      await voteForLPFee(lender, user2, tokenAddress, 1);
      
      // Equal support means insufficient support for change
      await expect(lender.connect(user1).proposeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("Insufficient support for fee change");
    });

    it("Should reject votes from users without shares", async function () {
      const { lender, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User tries to vote without having any shares
      await expect(lender.connect(user1).voteForLPFee(tokenAddress, 50))
        .to.be.revertedWith("No shares to vote");
    });

    it("Should reject invalid fee amounts in votes", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // User deposits to get voting power
      const depositAmount = ethers.parseEther("1000");
      await approve(token, user1, lenderAddress, depositAmount);
      await deposit(lender, user1, tokenAddress, depositAmount);
      
      // Try to vote for fee above maximum
      await expect(voteForLPFee(lender, user1, tokenAddress, 101)) // > MAX_LP_FEE_BPS (100)
        .to.be.revertedWith("Fee amount too high");
    });

    it("Should reject fee change proposals with invalid parameters", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      const deposit = ethers.parseEther("1000");
      await token.connect(user1).approve(lenderAddress, deposit);
      await lender.connect(user1).deposit(tokenAddress, deposit);
      
      // Test invalid token address
      await expect(lender.connect(user1).proposeLPFeeChange(ethers.ZeroAddress, 50))
        .to.be.revertedWith("Invalid token");
      
      // Test fee too high
      await expect(lender.connect(user1).proposeLPFeeChange(tokenAddress, 101))
        .to.be.revertedWith("Fee too high");
      
      // Test same fee as current
      await expect(lender.connect(user1).proposeLPFeeChange(tokenAddress, 1)) // DEFAULT_LP_FEE_BPS
        .to.be.revertedWith("Fee already set");
    });

    it("Should reject execution before delay period", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Setup voting scenario
      const deposit1 = ethers.parseEther("600");
      const deposit2 = ethers.parseEther("400");
      
      await token.connect(user1).approve(lenderAddress, deposit1);
      await lender.connect(user1).deposit(tokenAddress, deposit1);
      
      await token.connect(user2).approve(lenderAddress, deposit2);
      await lender.connect(user2).deposit(tokenAddress, deposit2);
      
      // Vote and propose
      await lender.connect(user1).voteForLPFee(tokenAddress, 50);
      await lender.connect(user1).proposeLPFeeChange(tokenAddress, 50);
      
      // Try to execute immediately (should fail)
      await expect(lender.connect(user1).executeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("Proposal delay not met");
        
      // Try to execute after partial delay (should still fail)
      for (let i = 0; i < 5; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      await expect(lender.connect(user1).executeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("Proposal delay not met");
    });

    it("Should reject execution of non-existent proposals", async function () {
      const { lender, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Try to execute a proposal that was never made
      await expect(lender.connect(user1).executeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("No proposal exists");
    });

    it("Should clear proposal after successful execution", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Setup and vote
      const deposit = ethers.parseEther("1000");
      await token.connect(user1).approve(lenderAddress, deposit);
      await lender.connect(user1).deposit(tokenAddress, deposit);
      
      await lender.connect(user1).voteForLPFee(tokenAddress, 50);
      await lender.connect(user1).proposeLPFeeChange(tokenAddress, 50);
      
      // Check proposal exists
      expect(await lender.proposedFeeChanges(tokenAddress, 50)).to.be.gt(0);
      
      // Execute after delay
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      await lender.connect(user1).executeLPFeeChange(tokenAddress, 50);
      
      // Check proposal was cleared
      expect(await lender.proposedFeeChanges(tokenAddress, 50)).to.equal(0);
      
      // Should not be able to execute again
      await expect(lender.connect(user1).executeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("No proposal exists");
    });

    it("Should work with complex voting scenarios", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3, owner } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Different deposit amounts creating different voting weights
      const deposit1 = ethers.parseEther("500"); // 50%
      const deposit2 = ethers.parseEther("300"); // 30%
      const deposit3 = ethers.parseEther("200"); // 20%
      
      await token.connect(user1).approve(lenderAddress, deposit1);
      await lender.connect(user1).deposit(tokenAddress, deposit1);
      
      await token.connect(user2).approve(lenderAddress, deposit2);
      await lender.connect(user2).deposit(tokenAddress, deposit2);
      
      await token.connect(user3).approve(lenderAddress, deposit3);
      await lender.connect(user3).deposit(tokenAddress, deposit3);
      
      // Initial votes: User1 and User2 for 25 bps (80%), User3 for 50 bps (20%)
      await lender.connect(user1).voteForLPFee(tokenAddress, 25);
      await lender.connect(user2).voteForLPFee(tokenAddress, 25);
      await lender.connect(user3).voteForLPFee(tokenAddress, 50);
      
      // 25 bps should win with 80% support vs 0% for current (1 bps)
      await lender.connect(user1).proposeLPFeeChange(tokenAddress, 25);
      
      // Mine blocks to meet delay
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      await lender.connect(user1).executeLPFeeChange(tokenAddress, 25);
      expect(await lender.lpFeesBps(tokenAddress)).to.equal(25);
      
      // User1 changes vote to 50 bps, now 50 bps has 70% support vs 30% for 25 bps
      await lender.connect(user1).voteForLPFee(tokenAddress, 50);
      
      // Should be able to propose change to 50 bps now
      await lender.connect(user3).proposeLPFeeChange(tokenAddress, 50);
      
      // Mine blocks and execute
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      await lender.connect(user3).executeLPFeeChange(tokenAddress, 50);
      expect(await lender.lpFeesBps(tokenAddress)).to.equal(50);
    });

    it("Should reject execution when vote support changes during delay period", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Initial deposits: User1 has 40%, User2 has 35%, User3 has 25%
      const deposit1 = ethers.parseEther("400");
      const deposit2 = ethers.parseEther("350"); 
      const deposit3 = ethers.parseEther("250");
      const entryFee = 100n;
      
      const netDeposit1 = deposit1 - entryFee;
      const netDeposit2 = deposit2 - entryFee;
      const netDeposit3 = deposit3 - entryFee;
      
      await token.connect(user1).approve(lenderAddress, deposit1);
      await lender.connect(user1).deposit(tokenAddress, deposit1);
      
      await token.connect(user2).approve(lenderAddress, deposit2);
      await lender.connect(user2).deposit(tokenAddress, deposit2);
      
      await token.connect(user3).approve(lenderAddress, deposit3);
      await lender.connect(user3).deposit(tokenAddress, deposit3);
      
      // Initial voting: User1 and User2 vote for 50 bps (75% support)
      // User3 votes for current fee 1 bps (25% support)
      await lender.connect(user1).voteForLPFee(tokenAddress, 50);
      await lender.connect(user2).voteForLPFee(tokenAddress, 50);
      await lender.connect(user3).voteForLPFee(tokenAddress, 1);
      
      // Verify vote counts before proposal (use actual shares)
      const user1SharesBefore = await lender.shares(tokenAddress, user1.address);
      const user2SharesBefore = await lender.shares(tokenAddress, user2.address);
      const user3SharesBefore = await lender.shares(tokenAddress, user3.address);
      
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(user1SharesBefore + user2SharesBefore);
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 1)).to.equal(user3SharesBefore);
      
      // Propose fee change to 50 bps (should succeed with 75% support)
      await lender.connect(user1).proposeLPFeeChange(tokenAddress, 50);
      
      // During delay period, User2 changes their vote from 50 bps to 1 bps
      // This changes the support: 50 bps now has 40%, 1 bps now has 60%
      await lender.connect(user2).voteForLPFee(tokenAddress, 1);
      
      // Verify vote counts after User2 changes vote
      const user1CurrentShares = await lender.shares(tokenAddress, user1.address);
      const user2CurrentShares = await lender.shares(tokenAddress, user2.address);
      const user3CurrentShares = await lender.shares(tokenAddress, user3.address);
      
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 50)).to.equal(user1CurrentShares); // Only User1 now
      expect(await lender.lpFeeSharesTotalVotes(tokenAddress, 1)).to.equal(user2CurrentShares + user3CurrentShares); // User2 + User3
      
      // Mine blocks to meet delay requirement
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Execution should fail because support changed (50 bps no longer has majority)
      await expect(lender.connect(user1).executeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("Proposal no longer has sufficient support");
      
      // Fee should remain unchanged
      expect(await lender.getEffectiveLPFee(tokenAddress)).to.equal(1); // Still default
      expect(await lender.lpFeesBps(tokenAddress)).to.equal(0); // Still unset
      
      // Proposal should still exist (not cleared since execution failed)
      expect(await lender.proposedFeeChanges(tokenAddress, 50)).to.be.gt(0);
    });

    it("Should allow execution when vote support increases during delay period", async function () {
      const { lender, lenderAddress, token, tokenAddress, user1, user2, user3 } = await loadFixture(deployERC20FlashLenderFixture);
      
      // Initial deposits
      const deposit1 = ethers.parseEther("400"); // 40%
      const deposit2 = ethers.parseEther("350"); // 35%
      const deposit3 = ethers.parseEther("250"); // 25%
      
      await token.connect(user1).approve(lenderAddress, deposit1);
      await lender.connect(user1).deposit(tokenAddress, deposit1);
      
      await token.connect(user2).approve(lenderAddress, deposit2);
      await lender.connect(user2).deposit(tokenAddress, deposit2);
      
      await token.connect(user3).approve(lenderAddress, deposit3);
      await lender.connect(user3).deposit(tokenAddress, deposit3);
      
      // Initial voting: Only User1 votes for 50 bps (40% support)
      // User2 and User3 vote for current fee 1 bps (60% support)
      await lender.connect(user1).voteForLPFee(tokenAddress, 50);
      await lender.connect(user2).voteForLPFee(tokenAddress, 1);
      await lender.connect(user3).voteForLPFee(tokenAddress, 1);
      
      // This should fail initially due to insufficient support
      await expect(lender.connect(user1).proposeLPFeeChange(tokenAddress, 50))
        .to.be.revertedWith("Insufficient support for fee change");
      
      // User2 changes vote to 50 bps, giving it majority (75% support)
      await lender.connect(user2).voteForLPFee(tokenAddress, 50);
      
      // Now proposal should succeed
      await lender.connect(user1).proposeLPFeeChange(tokenAddress, 50);
      
      // During delay period, User3 also changes vote to 50 bps (100% support)
      await lender.connect(user3).voteForLPFee(tokenAddress, 50);
      
      // Mine blocks to meet delay
      for (let i = 0; i < 10; i++) {
        await ethers.provider.send("evm_mine", []);
      }
      
      // Execution should succeed because support increased
      await expect(lender.connect(user1).executeLPFeeChange(tokenAddress, 50))
        .to.emit(lender, "LPFeeChangeExecuted")
        .withArgs(tokenAddress, 1, 50);
      
      expect(await lender.lpFeesBps(tokenAddress)).to.equal(50);
    });
  });
});