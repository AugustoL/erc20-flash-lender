import { ethers } from 'ethers';
import { UserPosition } from '../types';

/**
 * Represents an allowed action for a user
 */
export interface AllowedAction {
  type: 'approve' | 'deposit' | 'withdraw';
  amount: string; // Formatted amount (not wei)
  maxAmount: string; // Maximum allowed amount for this action
  description: string;
}

/**
 * Result of analyzing user position for allowed actions
 */
export interface UserActionAnalysis {
  allowedActions: AllowedAction[];
  hasTokenBalance: boolean;
  hasApprovedBalance: boolean;
  hasDeposits: boolean;
  tokenBalance: string;
  approvedBalance: string;
  depositedBalance: string;
}

/**
 * Analyzes a user position and returns allowed actions with amounts
 * 
 * @param userPosition - The user's position data (can be null/undefined)
 * @param decimals - Token decimals for formatting (default: 18)
 * @returns Analysis of allowed actions
 */
export function analyzeUserActions(
  userBalance: bigint | null,
  userAllowance: bigint | null,
  userDeposits: bigint | null,
  decimals: number = 18
): UserActionAnalysis {
  const result: UserActionAnalysis = {
    allowedActions: [],
    hasTokenBalance: false,
    hasApprovedBalance: false,
    hasDeposits: false,
    tokenBalance: '0',
    approvedBalance: '0',
    depositedBalance: '0'
  };

  // Extract and format balances
  const tokenBalance = userBalance || BigInt(0);
  const approvedBalance = userAllowance || BigInt(0);
  const depositedBalance = userDeposits || BigInt(0);

  // Format balances for display - handle large numbers safely
  result.tokenBalance = formatBalanceSafely(tokenBalance, decimals);
  result.approvedBalance = formatApprovedAmount(approvedBalance, decimals);
  result.depositedBalance = formatBalanceSafely(depositedBalance, decimals);

  // Set flags
  result.hasTokenBalance = tokenBalance > BigInt(0);
  result.hasApprovedBalance = approvedBalance > BigInt(0);
  result.hasDeposits = depositedBalance > BigInt(0);

  // Analyze allowed actions
  
  // 1. Approve action: User has token balance but insufficient approval
  // Skip if user already has unlimited approval (MaxUint256)
  if (result.hasTokenBalance && approvedBalance !== ethers.MaxUint256 && (approvedBalance < tokenBalance)) {
    const unapprovedAmount = tokenBalance - approvedBalance;
    const maxApproveAmount = formatBalanceSafely(tokenBalance, decimals);
    const unapprovedAmountFormatted = formatBalanceSafely(unapprovedAmount, decimals);
    
    result.allowedActions.push({
      type: 'approve',
      amount: unapprovedAmountFormatted,
      maxAmount: maxApproveAmount,
      description: `Approve ${unapprovedAmountFormatted} tokens for deposit`
    });
  }

  // 2. Deposit action: User has approved balance and token balance
  if (result.hasApprovedBalance && result.hasTokenBalance) {
    // For unlimited approval, user can deposit their entire token balance
    // Otherwise, user can deposit up to the minimum of their token balance or approved amount
    const maxDepositAmount = approvedBalance === ethers.MaxUint256 
      ? tokenBalance 
      : (tokenBalance < approvedBalance ? tokenBalance : approvedBalance);
    
    const maxDepositFormatted = formatBalanceSafely(maxDepositAmount, decimals);
    
    // Only add if there's actually an amount to deposit
    if (maxDepositAmount > BigInt(0)) {
      result.allowedActions.push({
        type: 'deposit',
        amount: maxDepositFormatted,
        maxAmount: maxDepositFormatted,
        description: `Deposit up to ${maxDepositFormatted} tokens`
      });
    }
  }

  // 3. Withdraw action: User has deposits
  if (result.hasDeposits) {
    // Calculate withdrawable amount (net amount after fees)
    const withdrawableAmount = depositedBalance || BigInt(0);
    const withdrawableFormatted = formatBalanceSafely(withdrawableAmount, decimals);
    
    if (withdrawableAmount > BigInt(0)) {
      result.allowedActions.push({
        type: 'withdraw',
        amount: withdrawableFormatted,
        maxAmount: withdrawableFormatted,
        description: `Withdraw ${withdrawableFormatted} tokens`
      });
    }
  }

  return result;
}

/**
 * Helper function to format approved amounts, handling MaxUint256
 */
function formatApprovedAmount(approvedBalance: bigint, decimals: number): string {
  // Check if it's MaxUint256 (infinite approval)
  if (approvedBalance === ethers.MaxUint256) {
    return 'Unlimited';
  }
  
  return formatBalanceSafely(approvedBalance, decimals);
}

/**
 * Safely format balance amounts, handling very large numbers that could cause overflow
 */
function formatBalanceSafely(balance: bigint, decimals: number): string {
  try {
    // Check if the number is too large to format safely
    // ethers.js has issues with numbers larger than Number.MAX_SAFE_INTEGER when formatted
    const maxSafeValue = BigInt(Number.MAX_SAFE_INTEGER);
    
    if (balance > maxSafeValue) {
      // For very large numbers, show a simplified representation
      const balanceStr = balance.toString();
      const length = balanceStr.length;
      
      if (length > 15) {
        // Show as scientific notation-like format
        const significant = balanceStr.slice(0, 3);
        const exponent = length - 1;
        return `${significant[0]}.${significant.slice(1)}e+${exponent}`;
      }
    }
    
    return ethers.formatUnits(balance, decimals);
  } catch (error) {
    console.warn('Error formatting balance:', error);
    // Fallback to raw string representation
    return balance.toString();
  }
}

/**
 * Checks if a specific action is allowed for the given amount
 */
export function isActionAllowed(
  analysis: UserActionAnalysis,
  actionType: 'approve' | 'deposit' | 'withdraw',
  amount: string
): boolean {
  const action = analysis.allowedActions.find(a => a.type === actionType);
  console.log('Checking action:', actionType, 'with amount:', amount, 'Found action:', action);
  if (!action) {
    return false;
  }

  try {
    const requestedAmount = parseFloat(amount);
    const maxAmount = parseFloat(action.maxAmount);
    
    return requestedAmount <= maxAmount;
  } catch {
    return false;
  }
}
