// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.28;

/**
 * ⚠️ WARNING: THIS CONTRACT HAS NOT BEEN PROFESSIONALLY AUDITED
 * 
 * DO NOT USE WITH REAL FUNDS ON MAINNET WITHOUT A COMPREHENSIVE SECURITY AUDIT
 * 
 * This is a personal/educational project that has been:
 * - ✅ AI-reviewed for security best practices
 * - ✅ Built using OpenZeppelin's audited contracts
 * - ✅ Tested with comprehensive test suite
 * - ❌ NOT professionally audited by security experts
 * 
 * @title ERC20FlashLender - Flash Loan Service for ERC20 Tokens
 * @author AugustoL
 * @notice A flash loan protocol that enables instant, uncollateralized loans
 *         for MEV operations, arbitrage, and liquidations
 * @dev This contract uses a share-based system to distribute LP fees proportionally
 *      and implements comprehensive security measures against common DeFi attacks
 * 
 * Key Features:
 * - Flash loans for any deposited ERC20 token
 * - Proportional fee sharing among liquidity providers
 * - Upgradeable architecture with proper access controls
 * - Protection against reentrancy, share dilution, and arithmetic errors
 * - Minimum deposit requirements to prevent manipulation
 * - SafeERC20 integration for broad token compatibility
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice Interface that flash loan receivers must implement
 * @dev Contracts receiving flash loans must implement this interface
 */
interface IFlashLoanReceiver {
    /**
     * @notice Called by the flash loan contract after transferring funds
     * @param token Address of the borrowed token
     * @param amount Amount of tokens borrowed
     * @param totalOwed Total amount that must be repaid (principal + fees)
     * @param data Arbitrary data passed from the flash loan initiator
     */
    function executeOperation(address token, uint256 amount, uint256 totalOwed, bytes calldata data) external returns (bool);
}

/**
 * @notice Interface that multi-token flash loan receivers must implement
 * @dev Contracts receiving multi-token flash loans must implement this interface
 */
interface IMultiFlashLoanReceiver {
    /**
     * @notice Called by the flash loan contract after transferring multiple tokens
     * @param tokens Array of addresses of the borrowed tokens
     * @param amounts Array of amounts of tokens borrowed (matches tokens array)
     * @param totalOwed Array of total amounts that must be repaid (principal + fees for each token)
     * @param data Arbitrary data passed from the flash loan initiator
     */
    function executeMultiOperation(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata totalOwed, bytes calldata data) external returns (bool);
}

contract ERC20FlashLender is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // ===================== STATE VARIABLES =====================

    /// @notice LP fee rate in basis points for each token (e.g., 50 = 0.5%)
    mapping(address => uint256) public lpFeesBps;

    /// @notice Total shares voting for each fee amount for each token
    // @dev token => feeAmount => sharesVotes
    mapping(address => mapping(uint256 => uint256)) public lpFeeSharesTotalVotes;

    /// @notice LP's selected fee amount for each token
    /// @dev token => user => lpFeeAmount selected
    mapping(address => mapping(address => uint256)) public lpFeeAmountSelected;
    
    /// @notice Proposed fee changes: token => feeAmount => executionBlock
    mapping(address => mapping(uint256 => uint256)) public proposedFeeChanges;
    
    /// @notice Amount of tokens deposited by each user for each token
    /// @dev token => user => deposit amount
    mapping(address => mapping(address => uint256)) public deposits;
    
    /// @notice Total liquidity available for flash loans for each token
    /// @dev Includes both deposits and accumulated LP fees
    mapping(address => uint256) public totalLiquidity;
    
    /// @notice Total shares issued for each token pool
    /// @dev Used for proportional fee distribution calculation
    mapping(address => uint256) public totalShares;
    
    /// @notice Number of shares owned by each user for each token
    /// @dev token => user => share amount. Shares determine fee distribution
    mapping(address => mapping(address => uint256)) public shares;
    
    /// @notice Management fee as percentage of LP fee (e.g., 100 = 1% of LP fee)
    /// @dev Applied to all flash loans regardless of token
    uint256 public managementFeePercentage;
    
    /// @notice Accumulated management fees for each token, withdrawable by owner
    mapping(address => uint256) public collectedManagementFees;

    // ===================== STORAGE GAP =====================
    
    /// @notice Storage gap for future upgrades
    /// @dev This gap allows adding new state variables in future upgrades without storage collisions
    ///      We reserve 50 slots, but since we have 11 state variables above, we use 39 slots
    ///      (50 - 11 = 39) to maintain exactly 50 storage slots for this contract
    uint256[39] private __gap;

    // ===================== CONSTANTS =====================
    
    /// @notice Default LP fee rate applied to new tokens (0.01% = 1 basis point)
    uint256 public constant DEFAULT_LP_FEE_BPS = 1;
    
    /// @notice Maximum management fee percentage that can be set (500 = 5% of LP fee)
    /// @dev Prevents owner from setting excessive management fees
    uint256 public constant MAX_MANAGEMENT_FEE_PERCENTAGE = 500;
    
    /// @notice Maximum LP fee that can be set (100 = 1%)
    /// @dev Management fee is calculated as percentage of LP fee, so no separate total limit needed
    uint256 public constant MAX_LP_FEE_BPS = 100;
    
    /// @notice Minimum deposit amount required to prevent share manipulation attacks
    /// @dev Prevents attackers from inflating share prices with tiny deposits
    uint256 public constant MINIMUM_DEPOSIT = 1e8; // 100M wei minimum
    
    /// @notice Virtual shares sent to owner on first deposit to prevent manipulation
    /// @dev Creates initial share dilution making precision attacks uneconomical
    uint256 public constant VIRTUAL_SHARES = 1000;
    
    /// @notice Entry/exit fee as fixed amount (100 wei) to cover dust attacks
    /// @dev Applied to deposits and withdrawals to neutralize rounding dust
    uint256 public constant ENTRY_EXIT_FEE = 100;
    
    /// @notice Delay in blocks before proposed fee change can be executed
    uint256 public constant PROPOSAL_DELAY = 10;
    // ===================== EVENTS =====================
    
    /// @notice Emitted when a user deposits tokens into a liquidity pool
    event Deposit(address indexed user, address indexed token, uint256 amount, uint256 shares);
    
    /// @notice Emitted when a user withdraws their deposit plus accumulated fees
    event Withdraw(address indexed user, address indexed token, uint256 principal, uint256 fees);
    
    /// @notice Emitted when a flash loan is executed
    event FlashLoan(address indexed borrower, address indexed token, uint256 amount, uint256 fee);
    
    /// @notice Emitted when a multi-token flash loan is executed
    event MultiFlashLoan(address indexed borrower, address[] tokens, uint256[] amounts, uint256[] fees);
    
    /// @notice Emitted when the owner withdraws accumulated management fees
    event ManagementFeeWithdrawn(address indexed token, uint256 amount);
    
    /// @notice Emitted when the management fee rate is changed
    event ManagementFeeChanged(uint256 oldFee, uint256 newFee);
    
    /// @notice Emitted when an LP votes for a fee amount
    event LPFeeVoteCast(address indexed token, address indexed voter, uint256 feeAmount, uint256 voterShares);
    
    /// @notice Emitted when a fee change is proposed
    event LPFeeChangeProposed(address indexed token, uint256 newFeeBps, uint256 executionBlock);
    
    /// @notice Emitted when a proposed fee change is executed
    event LPFeeChangeExecuted(address indexed token, uint256 oldFee, uint256 newFee);

    // ===================== INITIALIZATION =====================
    
    /**
     * @notice Initializes the contract (replaces constructor for upgradeable contracts)
     * @param _mgmtFeePercentage Management fee as percentage of LP fee (0 = 0%, default is 0%)
     * @dev Can only be called once. Sets up OpenZeppelin components and initial fee
     */
    function initialize(uint256 _mgmtFeePercentage) public initializer {
        require(_mgmtFeePercentage <= MAX_MANAGEMENT_FEE_PERCENTAGE, "Mgmt fee out of range");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        managementFeePercentage = _mgmtFeePercentage;
    }

    // ===================== OWNER FUNCTIONS =====================
    
    /**
     * @notice Updates the management fee rate (owner only)
     * @param percentage New management fee as percentage of LP fee (0 = 0%, max 5%)
     * @dev Management fee is applied to all flash loans across all tokens
     */
    function setManagementFee(uint256 percentage) external onlyOwner {
        require(percentage <= MAX_MANAGEMENT_FEE_PERCENTAGE, "Fee out of range");
        uint256 oldFee = managementFeePercentage;
        managementFeePercentage = percentage;
        emit ManagementFeeChanged(oldFee, percentage);
    }


    // ===================== LP GOVERNANCE FUNCTIONS =====================
    
    /**
     * @notice Cast a vote for the LP fee amount for a specific token
     * @param token Address of the ERC20 token
     * @param feeAmountBps Desired LP fee in basis points (e.g., 1 = 0.01%, max 100 = 1%)
     * @dev LP votes are weighted by their share holdings. Previous vote is replaced if exists.
     *      Only LPs with shares can vote.
     */
    function voteForLPFee(address token, uint256 feeAmountBps) external {
        require(token != address(0), "Invalid token");
        require(feeAmountBps <= MAX_LP_FEE_BPS, "Fee amount too high");
        
        uint256 voterShares = shares[token][msg.sender];
        require(voterShares > 0, "No shares to vote");
        
        // Remove previous vote if exists
        uint256 previousVote = lpFeeAmountSelected[token][msg.sender];
        if (previousVote > 0) {
            lpFeeSharesTotalVotes[token][previousVote] -= voterShares;
        }
        
        // Record new vote
        lpFeeAmountSelected[token][msg.sender] = feeAmountBps;
        lpFeeSharesTotalVotes[token][feeAmountBps] += voterShares;
        
        emit LPFeeVoteCast(token, msg.sender, feeAmountBps, voterShares);
    }
    
    /**
     * @notice Propose a change to LP fee based on governance votes
     * @param token Address of the ERC20 token
     * @param newFeeBps Proposed new LP fee in basis points
     * @dev Creates proposal if new fee has higher share support than current fee.
     *      Proposal can be executed after PROPOSAL_DELAY blocks.
     */
    function proposeLPFeeChange(address token, uint256 newFeeBps) external {
        require(token != address(0), "Invalid token");
        require(newFeeBps <= MAX_LP_FEE_BPS, "Fee too high");
        
        uint256 currentFee = lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
        require(newFeeBps != currentFee, "Fee already set");
        require(totalShares[token] > 0, "No shares in pool");
        
        require(_newFeeHasEnoughSupport(token, newFeeBps), "Insufficient support for fee change");
        
        // Create proposal with execution delay
        uint256 executionBlock = block.number + PROPOSAL_DELAY;
        proposedFeeChanges[token][newFeeBps] = executionBlock;
        
        emit LPFeeChangeProposed(token, newFeeBps, executionBlock);
    }
    
    /**
     * @notice Execute a previously proposed fee change
     * @param token Address of the ERC20 token
     * @param newFeeBps The proposed new LP fee in basis points
     * @dev Can only be executed after the proposal delay has passed and if support is still sufficient
     */
    function executeLPFeeChange(address token, uint256 newFeeBps) external {
        require(token != address(0), "Invalid token");
        
        uint256 executionBlock = proposedFeeChanges[token][newFeeBps];
        require(executionBlock > 0, "No proposal exists");
        require(block.number >= executionBlock, "Proposal delay not met");
        
        // Re-validate that the proposal still has sufficient support
        require(_newFeeHasEnoughSupport(token, newFeeBps), "Proposal no longer has sufficient support");
        
        // Clear the proposal
        proposedFeeChanges[token][newFeeBps] = 0;
        
        // Update the LP fee
        uint256 oldFee = lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
        lpFeesBps[token] = newFeeBps;
        
        emit LPFeeChangeExecuted(token, oldFee, newFeeBps);
    }
    
    /**
     * @notice Internal function to check if a proposed fee has sufficient support
     * @param token Address of the ERC20 token
     * @param newFeeBps Proposed new LP fee in basis points
     * @return bool True if the new fee has more support than the current fee
     * @dev Calculates vote support percentages and compares them
     */
    function _newFeeHasEnoughSupport(address token, uint256 newFeeBps) internal view returns (bool) {
        uint256 currentFee = lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
        uint256 totalSharesInPool = totalShares[token];
        
        if (totalSharesInPool == 0) {
            return false;
        }
        
        // Get vote counts for both current and proposed fee
        uint256 currentFeeVotes = lpFeeSharesTotalVotes[token][currentFee];
        uint256 newFeeVotes = lpFeeSharesTotalVotes[token][newFeeBps];
        
        // Calculate support percentages (in basis points for precision)
        uint256 currentFeeSupport = (currentFeeVotes * 10000) / totalSharesInPool;
        uint256 newFeeSupport = (newFeeVotes * 10000) / totalSharesInPool;
        
        return newFeeSupport > currentFeeSupport;
    }

    /**
     * @notice Internal function to update vote weight when user's shares change
     * @param token Address of the ERC20 token
     * @param user Address of the user whose shares changed
     * @param shareChange Amount of shares that changed
     * @param isIncrease True if shares increased (deposit), false if decreased (withdraw)
     * @dev Updates the vote count for the user's selected fee amount
     */
    function _updateVoteWeight(address token, address user, uint256 shareChange, bool isIncrease) internal {
        uint256 selectedFee = lpFeeAmountSelected[token][user];
        if (selectedFee > 0) {  // User has voted
            if (isIncrease) {
                lpFeeSharesTotalVotes[token][selectedFee] += shareChange;
            } else {
                lpFeeSharesTotalVotes[token][selectedFee] -= shareChange;
                // Clear user's vote selection when they withdraw all shares
                if (shares[token][user] == 0) {
                    lpFeeAmountSelected[token][user] = 0;
                }
            }
        }
    }

    // ===================== LIQUIDITY PROVIDER FUNCTIONS =====================
    
    /**
     * @notice Deposit tokens into the liquidity pool to earn fees from flash loans
     * @param token Address of the ERC20 token to deposit
     * @param amount Number of tokens to deposit (must be >= MINIMUM_DEPOSIT)
     * @dev Mints shares proportional to the deposit's value relative to existing pool
     *      First depositor triggers virtual share creation to prevent manipulation
     *      Entry fee is applied to discourage dust attacks
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        // Checks
        require(token != address(0), "Invalid token");
        require(amount >= MINIMUM_DEPOSIT, "Deposit too small");
        
        // Apply entry fee to cover dust attacks (fixed amount)
        uint256 netAmount = amount - ENTRY_EXIT_FEE;
        require(netAmount > 0, "Amount too small after ENTRY_EXIT_FEE fee");
        
        // Calculate shares based on current pool state
        uint256 newShares;
        bool isFirstDeposit = totalShares[token] == 0;
        
        if (isFirstDeposit) {
            // First deposit: create virtual shares for owner to prevent manipulation
            // User gets shares for net amount, owner gets virtual shares
            newShares = netAmount;
            
            // Mint virtual shares to owner (contract owner)
            shares[token][owner()] = VIRTUAL_SHARES;
            totalShares[token] = VIRTUAL_SHARES;
            
            // Add virtual liquidity equivalent (no actual tokens, just accounting)
            totalLiquidity[token] = VIRTUAL_SHARES;
        } else {
            // Subsequent deposits: maintain proportional value
            require(totalLiquidity[token] > 0, "Invalid liquidity state");
            
            // Calculate shares with precision protection
            uint256 numerator = netAmount * totalShares[token];
            newShares = numerator / totalLiquidity[token];
            
            // Require meaningful share allocation (no forced 1 share)
            require(newShares > 0, "Deposit too small for current pool size");
        }
        
        // Update state - track deposits, shares, and total pool size
        deposits[token][msg.sender] += netAmount; // Track net deposit (after fee)
        shares[token][msg.sender] += newShares;
        totalShares[token] += newShares;
        totalLiquidity[token] += amount; // Add full amount to liquidity (entry fee stays in pool)
        
        // Update governance vote weight if user has voted
        _updateVoteWeight(token, msg.sender, newShares, true);
        
        // Emit event with net shares (after fee impact)
        emit Deposit(msg.sender, token, netAmount, newShares);
        
        // External call happens last - transfer full amount (including fee)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Withdraw all deposited tokens plus accumulated fees from flash loans
     * @param token Address of the ERC20 token to withdraw
     * @dev Calculates user's share of the pool and transfers principal and fees minus exit fee
     *      User's payout = (user_shares / total_shares) * total_liquidity - exit_fee
     *      Exit fee discourages dust attacks and precision manipulation
     */
    function withdraw(address token) external nonReentrant {
        require(token != address(0), "Invalid token");
        uint256 userShares = shares[token][msg.sender];
        require(userShares > 0, "Nothing to withdraw");
        require(totalShares[token] > 0, "Invalid shares state");
        
        // Calculate total amount including accumulated fees (without rounding up)
        // Formula: user_payout = (user_shares / total_shares) * total_pool_value
        uint256 numerator = userShares * totalLiquidity[token];
        uint256 grossAmount = numerator / totalShares[token];
        // No rounding up - use exact division to prevent favorable rounding exploitation
        
        // Apply exit fee to cover dust attacks (fixed amount)
        uint256 netAmount = grossAmount - ENTRY_EXIT_FEE;
        
        // Ensure minimum withdrawal amount after fees
        require(netAmount >= MINIMUM_DEPOSIT, "Withdrawal too small after ENTRY_EXIT_FEE fee");

        // Cap withdrawal at available liquidity to prevent pool drain
        if (grossAmount > totalLiquidity[token]) {
            grossAmount = totalLiquidity[token];
            netAmount = grossAmount - ENTRY_EXIT_FEE;
        }
        
        uint256 principal = deposits[token][msg.sender];
        uint256 fees = grossAmount > principal ? grossAmount - principal : 0;
        
        // Update state before external interactions
        deposits[token][msg.sender] = 0;
        shares[token][msg.sender] = 0;
        totalShares[token] -= userShares;
        totalLiquidity[token] -= netAmount; // Remove only net amount (exit fee stays in pool as dust)
        
        // Update governance vote weight after resetting shares (user now has 0 shares)
        _updateVoteWeight(token, msg.sender, userShares, false);
        
        // Emit event before external interaction (showing net amounts)
        emit Withdraw(msg.sender, token, principal, fees);
        
        // Transfer net amount to user (gross amount minus exit fee)
        IERC20(token).safeTransfer(msg.sender, netAmount);
    }

    /**
     * @notice Allows owner to withdraw accumulated management fees
     * @param token Address of the ERC20 token to withdraw fees for
     * @dev Transfers all accumulated management fees for the specified token
     */
    function withdrawManagementFees(address token) external onlyOwner nonReentrant {
        require(token != address(0), "Invalid token");
        uint256 fees = collectedManagementFees[token];
        require(fees > 0, "No fees");
        collectedManagementFees[token] = 0;
        emit ManagementFeeWithdrawn(token, fees);
        IERC20(token).safeTransfer(owner(), fees);
    }

    // ===================== FLASH LOAN FUNCTION =====================
    
    /**
     * @notice Execute a flash loan - borrow tokens with no collateral, repay in same transaction
     * @param token Address of the ERC20 token to borrow
     * @param amount Number of tokens to borrow
     * @param receiver Address of contract that will receive tokens and execute logic
     * @param data Arbitrary data to pass to the receiver's executeOperation function
     * @dev The receiver must:
     *      1. Implement IFlashLoanReceiver interface
     *      2. Have enough tokens to repay loan + fees after executeOperation
     *      3. Approve this contract to pull the repayment
     */
    function flashLoan(
        address token,
        uint256 amount,
        address receiver,
        bytes calldata data
    ) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(receiver != address(0), "Invalid receiver");
        require(amount > 0, "Invalid amount");
        require(amount <= totalLiquidity[token], "Not enough liquidity");
        
        // Verify receiver implements the required interface
        require(_supportsInterface(receiver), "Invalid receiver interface");

        // Calculate fees: LP fee goes to liquidity providers, management fee is % of LP fee
        // Use default LP fee if none set for this token
        uint256 currentLpFee = lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
        
        // Fix precision loss: calculate both fees from original amount to avoid nested rounding
        // LP fee: (amount * currentLpFee) / 10000
        // Management fee: (amount * currentLpFee * managementFeePercentage) / (10000 * 10000)
        uint256 lpFee = (amount * currentLpFee) / 10000;
        uint256 mgmtFee = (amount * currentLpFee * managementFeePercentage) / 100000000; // 10000 * 10000
        uint256 totalFee = lpFee + mgmtFee;
        
        // Ensure minimum fee to prevent manipulation while maintaining precision
        // For amounts >= MINIMUM_DEPOSIT, require minimum fee of 1 wei
        // For smaller amounts, allow zero fees to prevent precision manipulation
        if (totalFee == 0 && amount >= MINIMUM_DEPOSIT) {
            // Distribute minimum fee proportionally based on fee rates
            uint256 totalFeeBps = currentLpFee + (currentLpFee * managementFeePercentage) / 10000;
            if (totalFeeBps > 0) {
                if (managementFeePercentage > 0) {
                    lpFee = currentLpFee * 1 / totalFeeBps;
                    mgmtFee = 1 - lpFee;
                } else {
                    // If management fee is 0%, give all minimum fee to LP
                    lpFee = 1;
                    mgmtFee = 0;
                }
            } else {
                lpFee = 1;
                mgmtFee = 0;
            }
            totalFee = 1;
        }
        uint256 totalRepayment = amount + totalFee;

        // Record balance before loan to verify repayment
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));

        // Transfer borrowed tokens to receiver
        IERC20(token).safeTransfer(receiver, amount);

        // Execute receiver's custom logic (arbitrage, liquidation, etc.)
        IFlashLoanReceiver(receiver).executeOperation(token, amount, totalRepayment, data);

        // Verify loan + fees were repaid
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));

        require(balanceAfter >= balanceBefore + totalFee, "Flash loan not repaid");

        // Distribute fees: management fee to owner, LP fee increases pool value
        collectedManagementFees[token] += mgmtFee;
        totalLiquidity[token] += lpFee; // LP fees compound into pool, benefiting all LPs
        
        emit FlashLoan(msg.sender, token, amount, totalFee);
    }
    
    /**
     * @notice Execute a multi-token flash loan - borrow multiple tokens with no collateral, repay in same transaction
     * @param tokens Array of addresses of the ERC20 tokens to borrow
     * @param amounts Array of amounts to borrow (must match tokens array length)
     * @param receiver Address of contract that will receive tokens and execute logic
     * @param data Arbitrary data to pass to the receiver's executeMultiOperation function
     * @dev The receiver must:
     *      1. Implement IMultiFlashLoanReceiver interface
     *      2. Have enough of each token to repay loans + fees after executeMultiOperation
     *      3. Approve this contract to pull the repayments for all tokens
     */
    function flashLoanMultiple(
        address[] calldata tokens,
        uint256[] calldata amounts,
        address receiver,
        bytes calldata data
    ) external nonReentrant {
        require(receiver != address(0), "Invalid receiver");
        require(tokens.length > 0, "No tokens specified");
        require(tokens.length == amounts.length, "Arrays length mismatch");
        require(tokens.length <= 20, "Too many tokens"); // Prevent gas limit issues
        
        // Verify receiver implements the required interface
        require(_supportsMultiInterface(receiver), "Invalid receiver interface");
        
        // Arrays to store calculated fees and repayment amounts
        uint256[] memory totalFees = new uint256[](tokens.length);
        uint256[] memory totalRepayments = new uint256[](tokens.length);
        uint256[] memory balancesBefore = new uint256[](tokens.length);
        
        // Validate all tokens and amounts first
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            
            require(token != address(0), "Invalid token");
            require(amount > 0, "Invalid amount");
            require(amount <= totalLiquidity[token], "Not enough liquidity");
            
            // Check for duplicate tokens
            for (uint256 j = i + 1; j < tokens.length; j++) {
                require(tokens[i] != tokens[j], "Duplicate token");
            }
            
            // Calculate fees for this token
            uint256 currentLpFee = lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
            
            uint256 lpFee = (amount * currentLpFee) / 10000;
            uint256 mgmtFee = (amount * currentLpFee * managementFeePercentage) / 100000000;
            uint256 totalFee = lpFee + mgmtFee;
            
            // Apply minimum fee logic for larger amounts
            if (totalFee == 0 && amount >= MINIMUM_DEPOSIT) {
                uint256 totalFeeBps = currentLpFee + (currentLpFee * managementFeePercentage) / 10000;
                if (totalFeeBps > 0) {
                    if (managementFeePercentage > 0) {
                        lpFee = currentLpFee * 1 / totalFeeBps;
                        mgmtFee = 1 - lpFee;
                    } else {
                        // If management fee is 0%, give all minimum fee to LP
                        lpFee = 1;
                        mgmtFee = 0;
                    }
                } else {
                    lpFee = 1;
                    mgmtFee = 0;
                }
                totalFee = 1;
            }
            
            totalFees[i] = totalFee;
            totalRepayments[i] = amount + totalFee;
            
            // Record balance before transfer
            balancesBefore[i] = IERC20(token).balanceOf(address(this));

            IERC20(tokens[i]).safeTransfer(receiver, amounts[i]);
        }
        
        // Execute receiver's custom logic for all tokens
        IMultiFlashLoanReceiver(receiver).executeMultiOperation(tokens, amounts, totalRepayments, data);
        
        // Verify all loans + fees were repaid and distribute fees
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            uint256 totalFee = totalFees[i];
            
            uint256 balanceAfter = IERC20(token).balanceOf(address(this));
            require(balanceAfter >= balancesBefore[i] + totalFee, "Flash loan not repaid");

            // Calculate individual fees for distribution
            uint256 currentLpFee = lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
            uint256 lpFee = (amount * currentLpFee) / 10000;
            uint256 mgmtFee = totalFee - lpFee;
            
            // Handle minimum fee distribution
            if (totalFee == 1 && (amount * currentLpFee) / 10000 == 0) {
                uint256 totalFeeBps = currentLpFee + (currentLpFee * managementFeePercentage) / 10000;
                if (totalFeeBps > 0) {
                    if (managementFeePercentage > 0) {
                        lpFee = currentLpFee * 1 / totalFeeBps;
                        mgmtFee = 1 - lpFee;
                    } else {
                        // If management fee is 0%, give all minimum fee to LP
                        lpFee = 1;
                        mgmtFee = 0;
                    }
                } else {
                    lpFee = 1;
                    mgmtFee = 0;
                }
            }
            
            // Distribute fees
            collectedManagementFees[token] += mgmtFee;
            totalLiquidity[token] += lpFee;
        }
        
        emit MultiFlashLoan(msg.sender, tokens, amounts, totalFees);
    }
    
    // ===================== VIEW FUNCTIONS =====================
    
    /**
     * @notice Preview how much a user can withdraw (principal + accumulated fees - exit fee)
     * @param token Address of the ERC20 token
     * @param user Address of the liquidity provider
     * @return netAmount Net withdrawable amount after exit fee
     * @return grossAmount Gross amount before exit fee
     * @return principal Original deposit amount
     * @return fees Accumulated fees earned from flash loans
     * @return exitFee Exit fee that will be charged
     * @dev Useful for frontend interfaces to show expected returns accounting for exit fees
     */
    function getWithdrawableAmount(address token, address user) external view returns (uint256 netAmount, uint256 grossAmount, uint256 principal, uint256 fees, uint256 exitFee) {
        uint256 userShares = shares[token][user];
        if (userShares == 0 || totalShares[token] == 0) {
            return (0, 0, 0, 0, 0);
        }
        
        // Calculate user's proportional share of total pool (without rounding up)
        uint256 numerator = userShares * totalLiquidity[token];
        grossAmount = numerator / totalShares[token];
        
        // Cap at available liquidity
        if (grossAmount > totalLiquidity[token]) {
            grossAmount = totalLiquidity[token];
        }
        
        // Calculate exit fee and net amount
        exitFee = ENTRY_EXIT_FEE;
        netAmount = grossAmount - exitFee;
        
        principal = deposits[token][user];
        fees = grossAmount > principal ? grossAmount - principal : 0;
    }
    
    /**
     * @notice Get the effective LP fee rate for a token
     * @param token Address of the ERC20 token
     * @return uint256 LP fee in basis points (uses default if not explicitly set)
     * @dev Returns DEFAULT_LP_FEE_BPS if no custom fee is set for the token
     */
    function getEffectiveLPFee(address token) external view returns (uint256) {
        return lpFeesBps[token] == 0 ? DEFAULT_LP_FEE_BPS : lpFeesBps[token];
    }
    
    // ===================== INTERNAL FUNCTIONS =====================
    
    /**
     * @notice Check if a contract implements the IFlashLoanReceiver interface
     * @param receiver Address of the potential flash loan receiver
     * @return bool True if receiver supports the required interface
     * @dev Uses ERC165 standard first, falls back to function existence check
     *      This prevents flash loans to contracts that can't handle them properly
     */
    function _supportsInterface(address receiver) private returns (bool) {
        // Calculate interface ID manually for better compatibility
        bytes4 interfaceId = bytes4(keccak256("executeOperation(address,uint256,uint256,bytes)"));
        try IERC165(receiver).supportsInterface(interfaceId) returns (bool supported) {
            return supported;
        } catch {
            // Fallback: test if the contract has executeOperation function
            // Use EIP-165 compliant gas limit of 30,000 gas to prevent gas starvation attacks
            try IFlashLoanReceiver(receiver).executeOperation{gas: 30000}(address(0), 0, 0, "") {
                return true; 
            } catch {
                return false;
            }
        }
    }
    
    /**
     * @notice Check if a contract implements the IMultiFlashLoanReceiver interface
     * @param receiver Address of the potential multi flash loan receiver
     * @return bool True if receiver supports the required interface
     * @dev Uses ERC165 standard first, falls back to function existence check
     *      This prevents flash loans to contracts that can't handle them properly
     */
    function _supportsMultiInterface(address receiver) private returns (bool) {
        // Calculate interface ID manually for better compatibility
        bytes4 interfaceId = bytes4(keccak256("executeMultiOperation(address[],uint256[],uint256[],bytes)"));
        try IERC165(receiver).supportsInterface(interfaceId) returns (bool supported) {
            return supported;
        } catch {
            // Fallback: test if the contract has executeMultiOperation function
            // Use EIP-165 compliant gas limit of 30,000 gas to prevent gas starvation attacks
            address[] memory emptyTokens = new address[](0);
            uint256[] memory emptyAmounts = new uint256[](0);
            uint256[] memory emptyOwed = new uint256[](0);
            try IMultiFlashLoanReceiver(receiver).executeMultiOperation{gas: 30000}(emptyTokens, emptyAmounts, emptyOwed, "") {
                return true; 
            } catch {
                return false;
            }
        }
    }
}