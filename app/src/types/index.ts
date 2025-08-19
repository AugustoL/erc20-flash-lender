import { ethers } from 'ethers';
import React from 'react';

// ==================== CORE DOMAIN TYPES ====================

/**
 * Core token interface used across the application
 */
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string; // Optional URL for token logo
}

export interface TokenBalance extends Token {
  userBalance: bigint;
  userAllowance: bigint;
}

/**
 * Raw token pool data from blockchain
 */
export interface TokenPool extends Token {
  totalLiquidity: bigint;
  totalShares: bigint;
  lpFee: number; // in basis points
  managementFee: bigint;
}

/**
 * Raw user position data from blockchain
 */
export interface UserPosition extends TokenPool, TokenBalance {
  deposits: bigint;
  shares: bigint;
  withdrawable: {
    netAmount: bigint;
    grossAmount: bigint;
    principal: bigint;
    fees: bigint;
    exitFee: bigint;
  };
  voteSelection: number;
}

// ==================== FORMATTED UI TYPES ====================

/**
 * Formatted pool data for UI consumption
 */
export interface PoolData extends TokenPool {
  apy?: number;
  formattedLiquidity?: string;
  // User-specific data when user is connected
  userBalance?: string;
  userAllowance?: string;
  formattedUserBalance?: string;
  needsApproval?: boolean; // Helper flag for UI
}

/**
 * Formatted user position for UI consumption
 */
export interface UserPositionData extends UserPosition {
  sharePercentage?: number;
  formattedDeposits?: string;
  formattedWithdrawable?: string;
  // Token data for convenience
  formattedUserBalance?: string;
  needsApproval?: boolean; // Helper flag for UI
}

/**
 * Dashboard table row data
 */
export interface TokenPoolRow extends Token {
  loans: number; // placeholder until on-chain stat exists
  volume: string; // placeholder
  lpFeeBps: string;
  tvl?: string;
  tokenType?: string;
  apy?: number;
  hasUserDeposits?: boolean;
  // Status information
  walletBalance?: string;
  approvedAmount?: string;
  depositedAmount?: string;
}

/**
 * Wallet table row data
 */
export interface WalletTableRow extends Token {
  poolExists?: boolean; // Whether the pool exists on-chain
  tokenType?: string;
  walletBalance?: string;
  approvedAmount?: string;
  depositedAmount?: string;
}

/**
 * Pool statistics data
 */
export interface PoolStatistics {
  totalDeposits: string;
  totalWithdrawals: string;
  totalFlashLoans: string;
  totalFlashLoanVolume: string;
  totalFeesCollected: string;
  uniqueUsers: number;
  uniqueBorrowers: number;
}

/**
 * Fee voting data
 */
export interface FeeVote {
  fee: number;
  votes: bigint;
  percentage: number;
  isActive: boolean;
}

// ==================== ACTION & EVENT TYPES ====================

/**
 * Base user action type
 */
export interface UserAction {
  type: 'deposit' | 'withdraw' | 'flashloan' | 'vote' | 'fee_collection' | 'fee_proposal' | 'fee_execution';
  user: string;
  token: string;
  amount?: string;
  fee?: string;
  blockNumber: number;
  timestamp: number;
  transactionHash: string;
  logIndex: number;
  // Additional fields for specific action types
  borrower?: string;
  executor?: string;
  feeAmount?: string;
  feeSelection?: number;
  votingPower?: string;
  proposedFee?: number;
  executionBlock?: number;
  oldFee?: number;
  newFee?: number;
}

/**
 * Flash loan specific action
 */
export interface FlashLoanAction extends UserAction {
  type: 'flashloan';
  borrower: string;
  executor: string;
  feeAmount: string;
}

/**
 * Vote specific action
 */
export interface VoteAction extends UserAction {
  type: 'vote';
  feeSelection: number;
  votingPower: string;
}

/**
 * Fee proposal specific action
 */
export interface FeeProposalAction extends UserAction {
  type: 'fee_proposal';
  proposedFee: number;
  executionBlock: number;
}

/**
 * Fee execution specific action
 */
export interface FeeExecutionAction extends UserAction {
  type: 'fee_execution';
  oldFee: number;
  newFee: number;
}

// ==================== COMPONENT TYPES ====================

/**
 * Action types for modals and UI interactions
 */
export type ActionType = 'deposit' | 'withdraw' | 'vote' | 'approve' | 'add-token';

/**
 * Withdraw types
 */
export type WithdrawType = 'all' | 'fees';

/**
 * Action modal component props
 */
export interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  action: ActionType;
  tokenSymbol?: string;
  tokenDecimals?: number;
  availableBalance?: string; // For deposit: wallet balance, for withdraw: withdrawable amount
  availableFees?: string; // For withdraw fees only option
  currentVoteFee?: number; // Current user's vote selection for fee
  feeGovernance?: FeeVote[]; // Available fee options for voting
  onConfirm: (amount: string, feePercentage?: number, withdrawType?: WithdrawType) => void;
  isLoading?: boolean;
}

// ==================== CONTEXT TYPES ====================

/**
 * Notification interface
 */
export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error';
  duration?: number; // Auto-dismiss after this many milliseconds (optional)
}

/**
 * Notification context type
 */
export interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: Notification['type'], duration?: number) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

/**
 * Notification provider props
 */
export interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Theme context type
 */
export interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

/**
 * Theme provider props
 */
export interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * App context interface
 */
export interface IAppContext {
  appReady: boolean;
  resourcesLoaded: boolean;
  isHydrated: boolean;
}

/**
 * Token context state interface
 */
export interface TokenContextState {
  tokens: TokenBalance[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Token context type
 */
export interface TokenContextType extends TokenContextState {
  addToken: (token: TokenBalance) => void;
  removeToken: (address: string) => void;
  updateToken: (address: string, updates: Partial<TokenBalance>) => void;
  getToken: (address: string) => TokenBalance | undefined;
  getAllTokens: () => TokenBalance[];
  hasToken: (address: string) => boolean;
  clearAllTokens: () => void;
  loadTokensFromStorage: () => void;
}

/**
 * Token provider props
 */
export interface TokenProviderProps {
  children: React.ReactNode;
}

// ==================== HOOK CONFIGURATION TYPES ====================

/**
 * Configuration for useFlashLender hook
 */
export interface UseFlashLenderConfig {
  provider: ethers.Provider;
  userAddress?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  cacheTimeout?: number;
}

// ==================== SETTINGS TYPES ====================

/**
 * User settings for the application
 */
export interface UserSettings {
  apyCalculationBlocks: number; // Number of blocks to look back for APY calculation
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * Default user settings
 */
export const DEFAULT_SETTINGS: UserSettings = {
  apyCalculationBlocks: 1000,
  theme: 'auto'
};
