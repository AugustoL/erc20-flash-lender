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

contract ERC20FlashLender is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    // ===================== STATE VARIABLES =====================

    /// @notice LP fee rate in basis points for each token (e.g., 50 = 0.5%)
    mapping(address => uint256) public lpFeesBps;
    
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

    // ===================== CONSTANTS =====================
    
    /// @notice Default LP fee rate applied to new tokens (0.01% = 1 basis point)
    /// @dev Owner can override this on a per-token basis using setLPFee()
    uint256 public constant DEFAULT_LP_FEE_BPS = 1;
    
    /// @notice Maximum management fee percentage that can be set (500 = 5% of LP fee)
    /// @dev Prevents owner from setting excessive management fees
    uint256 public constant MAX_MANAGEMENT_FEE_PERCENTAGE = 500;
    
    /// @notice Minimum management fee percentage that can be set (100 = 1% of LP fee)
    /// @dev Ensures minimum protocol revenue
    uint256 public constant MIN_MANAGEMENT_FEE_PERCENTAGE = 100;
    
    /// @notice Default management fee percentage (100 = 1% of LP fee)
    /// @dev Used during initialization
    uint256 public constant DEFAULT_MANAGEMENT_FEE_PERCENTAGE = 100;
    
    /// @notice Maximum LP fee that can be set (100 = 1%)
    /// @dev Management fee is calculated as percentage of LP fee, so no separate total limit needed
    uint256 public constant MAX_LP_FEE_BPS = 100;
    
    /// @notice Minimum deposit amount required to prevent share manipulation attacks
    /// @dev Prevents attackers from inflating share prices with tiny deposits
    uint256 public constant MINIMUM_DEPOSIT = 1000;
    // ===================== EVENTS =====================
    
    /// @notice Emitted when a user deposits tokens into a liquidity pool
    event Deposit(address indexed user, address indexed token, uint256 amount, uint256 shares);
    
    /// @notice Emitted when a user withdraws their deposit plus accumulated fees
    event Withdraw(address indexed user, address indexed token, uint256 principal, uint256 fees);
    
    /// @notice Emitted when a flash loan is executed
    event FlashLoan(address indexed borrower, address indexed token, uint256 amount, uint256 fee);
    
    /// @notice Emitted when the owner withdraws accumulated management fees
    event ManagementFeeWithdrawn(address indexed token, uint256 amount);
    
    /// @notice Emitted when the management fee rate is changed
    event ManagementFeeChanged(uint256 oldFee, uint256 newFee);
    
    /// @notice Emitted when the LP fee rate for a token is changed
    event LPFeeChanged(address indexed token, uint256 oldFee, uint256 newFee);

    // ===================== INITIALIZATION =====================
    
    /**
     * @notice Initializes the contract (replaces constructor for upgradeable contracts)
     * @param _mgmtFeePercentage Management fee as percentage of LP fee (100 = 1%, 0 = use default)
     * @dev Can only be called once. Sets up OpenZeppelin components and initial fee
     */
    function initialize(uint256 _mgmtFeePercentage) public initializer {
        // If 0 is passed, use default management fee percentage
        uint256 mgmtFee = _mgmtFeePercentage == 0 ? DEFAULT_MANAGEMENT_FEE_PERCENTAGE : _mgmtFeePercentage;
        require(mgmtFee >= MIN_MANAGEMENT_FEE_PERCENTAGE && mgmtFee <= MAX_MANAGEMENT_FEE_PERCENTAGE, "Mgmt fee out of range");
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        managementFeePercentage = mgmtFee;
    }

    // ===================== OWNER FUNCTIONS =====================
    
    /**
     * @notice Updates the management fee rate (owner only)
     * @param percentage New management fee as percentage of LP fee (100 = 1%, min 1%, max 5%)
     * @dev Management fee is applied to all flash loans across all tokens
     */
    function setManagementFee(uint256 percentage) external onlyOwner {
        require(percentage >= MIN_MANAGEMENT_FEE_PERCENTAGE && percentage <= MAX_MANAGEMENT_FEE_PERCENTAGE, "Fee out of range");
        uint256 oldFee = managementFeePercentage;
        managementFeePercentage = percentage;
        emit ManagementFeeChanged(oldFee, percentage);
    }

    /**
     * @notice Sets the LP fee rate for a specific token (owner only)
     * @param token Address of the ERC20 token
     * @param lpFeeBps LP fee in basis points (e.g., 1 = 0.01%, max 100 = 1%)
     * @dev Management fee is calculated as percentage of LP fee
     */
    function setLPFee(address token, uint256 lpFeeBps) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(lpFeeBps <= MAX_LP_FEE_BPS, "LP fee too high");
        uint256 oldFee = lpFeesBps[token];
        lpFeesBps[token] = lpFeeBps;
        emit LPFeeChanged(token, oldFee, lpFeeBps);
    }

    // ===================== LIQUIDITY PROVIDER FUNCTIONS =====================
    
    /**
     * @notice Deposit tokens into the liquidity pool to earn fees from flash loans
     * @param token Address of the ERC20 token to deposit
     * @param amount Number of tokens to deposit (must be >= MINIMUM_DEPOSIT)
     * @dev Mints shares proportional to the deposit's value relative to existing pool
     *      First depositor gets 1:1 share ratio, subsequent depositors maintain pool value
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        require(token != address(0), "Invalid token");
        require(amount >= MINIMUM_DEPOSIT, "Deposit too small");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // Calculate shares based on current pool state
        uint256 newShares;
        if (totalShares[token] == 0) {
            // First deposit: 1:1 ratio (shares = tokens)
            newShares = amount;
        } else {
            // Subsequent deposits: maintain proportional value
            // newShares = (deposit_amount * existing_shares) / existing_liquidity
            require(totalLiquidity[token] > 0, "Invalid liquidity state");
            
            // Add precision check: ensure calculation doesn't result in zero shares for valid deposits
            uint256 numerator = amount * totalShares[token];
            newShares = numerator / totalLiquidity[token];
            
            // Prevent share dilution attacks: ensure minimum shares for minimum deposits
            if (newShares == 0 && amount >= MINIMUM_DEPOSIT) {
                newShares = 1; // Minimum 1 share for valid deposits
            }
            
            require(newShares > 0, "Deposit too small for current pool size");
        }
        
        // Update state: track deposits, shares, and total pool size
        deposits[token][msg.sender] += amount;
        shares[token][msg.sender] += newShares;
        totalShares[token] += newShares;
        totalLiquidity[token] += amount;
        
        emit Deposit(msg.sender, token, amount, newShares);
    }

    /**
     * @notice Withdraw all deposited tokens plus accumulated fees from flash loans
     * @param token Address of the ERC20 token to withdraw
     * @dev Calculates user's share of the pool and transfers both principal and earned fees
     *      User's payout = (user_shares / total_shares) * total_liquidity
     */
    function withdraw(address token) external nonReentrant {
        require(token != address(0), "Invalid token");
        uint256 userShares = shares[token][msg.sender];
        require(userShares > 0, "Nothing to withdraw");
        require(totalShares[token] > 0, "Invalid shares state");
        
        // Calculate total amount including accumulated fees
        // Formula: user_payout = (user_shares / total_shares) * total_pool_value
        // Add precision check to prevent rounding to zero
        uint256 numerator = userShares * totalLiquidity[token];
        uint256 totalAmount = numerator / totalShares[token];
        
        // Ensure user doesn't lose value due to rounding down
        // If there's a remainder, round up to protect user funds
        if (numerator % totalShares[token] > 0) {
            totalAmount += 1;
        }
        
        // Cap withdrawal at available liquidity to prevent pool drain
        if (totalAmount > totalLiquidity[token]) {
            totalAmount = totalLiquidity[token];
        }
        uint256 principal = deposits[token][msg.sender];
        uint256 fees = totalAmount > principal ? totalAmount - principal : 0;
        
        // Reset user's position to zero
        deposits[token][msg.sender] = 0;
        shares[token][msg.sender] = 0;
        totalShares[token] -= userShares;
        totalLiquidity[token] -= totalAmount;
        
        // Transfer principal + fees to user
        IERC20(token).safeTransfer(msg.sender, totalAmount);
        emit Withdraw(msg.sender, token, principal, fees);
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
        IERC20(token).safeTransfer(owner(), fees);
        emit ManagementFeeWithdrawn(token, fees);
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
                lpFee = currentLpFee * 1 / totalFeeBps;
                mgmtFee = 1 - lpFee;
            } else {
                lpFee = 1;
                mgmtFee = 0;
            }
            totalFee = 1;
        }
        uint256 totalRepayment = amount + totalFee;

        // Transfer borrowed tokens to receiver
        IERC20(token).safeTransfer(receiver, amount);
        
        // Record balance before loan to verify repayment
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));

        // Execute receiver's custom logic (arbitrage, liquidation, etc.)
        IFlashLoanReceiver(receiver).executeOperation(token, amount, totalRepayment, data);

        // Verify loan + fees were repaid
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));

        require(balanceAfter >= balanceBefore + amount + totalFee, "Flash loan not repaid");

        // Distribute fees: management fee to owner, LP fee increases pool value
        collectedManagementFees[token] += mgmtFee;
        totalLiquidity[token] += lpFee; // LP fees compound into pool, benefiting all LPs
        
        emit FlashLoan(msg.sender, token, amount, totalFee);
    }
    
    // ===================== VIEW FUNCTIONS =====================
    
    /**
     * @notice Preview how much a user can withdraw (principal + accumulated fees)
     * @param token Address of the ERC20 token
     * @param user Address of the liquidity provider
     * @return totalAmount Total withdrawable amount (principal + fees)
     * @return principal Original deposit amount
     * @return fees Accumulated fees earned from flash loans
     * @dev Useful for frontend interfaces to show expected returns
     */
    function getWithdrawableAmount(address token, address user) external view returns (uint256 totalAmount, uint256 principal, uint256 fees) {
        uint256 userShares = shares[token][user];
        if (userShares == 0 || totalShares[token] == 0) {
            return (0, 0, 0);
        }
        
        // Calculate user's proportional share of total pool with precision protection
        uint256 numerator = userShares * totalLiquidity[token];
        totalAmount = numerator / totalShares[token];
        
        // Round up if there's a remainder to match withdrawal logic
        if (numerator % totalShares[token] > 0) {
            totalAmount += 1;
        }
        
        // Cap at available liquidity
        if (totalAmount > totalLiquidity[token]) {
            totalAmount = totalLiquidity[token];
        }
        principal = deposits[token][user];
        fees = totalAmount > principal ? totalAmount - principal : 0;
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
}