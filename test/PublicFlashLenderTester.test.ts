import { expect } from "chai";
import { ethers } from "hardhat";

describe("PublicFlashLenderTester.executeTestFlashLoan", () => {
  const DEPOSIT = ethers.parseEther("100000");
  const BORROW = ethers.parseEther("10");

  async function deployAll() {
    const [deployer] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy(ethers.parseEther("1000000000"), "Test Token", "TEST", 18);
    await token.waitForDeployment();

    // Deploy lender
    const LenderCF = await ethers.getContractFactory("ERC20FlashLender");
    // Constructor in repo takes owner only (see deploy-dev.ts)
    const lender = await LenderCF.deploy(deployer.address);
    await lender.waitForDeployment();

    // Deposit liquidity into lender
    await token.approve(await lender.getAddress(), DEPOSIT);
    await (await lender.deposit(await token.getAddress(), DEPOSIT)).wait();

    // Deploy tester
    const TesterCF = await ethers.getContractFactory("PublicFlashLenderTester");
    const tester = await TesterCF.deploy(await lender.getAddress());
    await tester.waitForDeployment();

    return { deployer, token, lender, tester };
  }

  async function getFeeBps(lender: any, tokenAddr: string): Promise<bigint> {
    // Some versions expose getEffectiveLPFee(token), else DEFAULT_LP_FEE_BPS()
    try {
      return await lender.getEffectiveLPFee(tokenAddr);
    } catch {
      return await lender.DEFAULT_LP_FEE_BPS();
    }
  }

  it("executes a flash loan and repays principal + fee", async () => {
    const { token, lender, tester } = await deployAll();

    const tokenAddr = await token.getAddress();
    const lenderAddr = await lender.getAddress();
    const testerAddr = await tester.getAddress();

    // Compute fee and pre-fund tester with the exact extra needed
    const feeBps = await getFeeBps(lender, tokenAddr);
    const fee = (BORROW * feeBps) / 10000n;

    // Pre-fund tester with fee so it can repay amount + fee
    await (await token.transfer(testerAddr, fee)).wait();

    const lenderBalBefore = await token.balanceOf(lenderAddr);
    const testerBalBefore = await token.balanceOf(testerAddr);

    // Execute flash loan
    const tx = await tester.executeTestFlashLoan(tokenAddr, BORROW);
    await tx.wait();

    const lenderBalAfter = await token.balanceOf(lenderAddr);
    const testerBalAfter = await token.balanceOf(testerAddr);

    // Lender net +fee (principal in/out)
    expect(lenderBalAfter - lenderBalBefore).to.equal(fee);

    // Tester spent exactly the fee
    expect(testerBalBefore - testerBalAfter).to.equal(fee);
  });

  it("reverts if tester has not enough extra tokens for the fee", async () => {
    const { token, lender, tester } = await deployAll();

    const tokenAddr = await token.getAddress();
    const feeBps = await getFeeBps(lender, tokenAddr);
    const fee = (BORROW * feeBps) / 10000n;

    // Fund tester with less than the fee to trigger revert during repayment
    const notEnough = fee === 0n ? 0n : fee - 1n;
    if (notEnough > 0n) {
      await (await token.transfer(await tester.getAddress(), notEnough)).wait();
    }

    await expect(tester.executeTestFlashLoan(tokenAddr, BORROW)).to.be.reverted;
  });
});