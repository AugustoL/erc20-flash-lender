import { useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { PoolData, UserPosition, FeeVote } from '../types';

/**
 * Hook for getting available balance optimized for Pool component
 */
export const usePoolAvailableBalance = (
  currentAction: string,
  poolData: PoolData | null,
  userPosition: UserPosition | null,
  walletBalance: string
) => {
  return useMemo(() => {
    if (!poolData) return '0';
    
    switch (currentAction) {
      case 'deposit':
        if (walletBalance && walletBalance !== '0') {
          try {
            return ethers.formatUnits(walletBalance, poolData.decimals || 18);
          } catch (error) {
            console.log('Error formatting deposit balance:', error);
            return '0';
          }
        }
        return '0';
        
      case 'withdraw':
        const withdrawAmount = userPosition?.withdrawable?.netAmount || '0';
        if (withdrawAmount && withdrawAmount !== '0') {
          try {
            return ethers.formatUnits(withdrawAmount, poolData.decimals || 18);
          } catch (error) {
            console.log('Error formatting withdraw balance:', error);
            return '0';
          }
        }
        return '0';
        
      case 'vote':
        return '0';
        
      default:
        return '0';
    }
  }, [currentAction, poolData, userPosition, walletBalance]);
};

/**
 * Hook for getting available fees optimized for Pool component
 */
export const usePoolAvailableFees = (
  poolData: PoolData | null,
  userPosition: UserPosition | null
) => {
  return useMemo(() => {
    if (!poolData || !userPosition?.withdrawable?.fees) {
      return '0';
    }
    
    try {
      const feesAmount = userPosition.withdrawable.fees;
      if (feesAmount && feesAmount !== '0') {
        return ethers.formatUnits(feesAmount, poolData.decimals || 18);
      }
      return '0';
    } catch (error) {
      console.log('Error formatting fees:', error);
      return '0';
    }
  }, [poolData, userPosition]);
};

/**
 * Hook for determining if user should show change fee button
 */
export const useShouldShowChangeFeeButton = (
  userPosition: UserPosition | null,
  feeGovernance: FeeVote[]
) => {
  return useMemo(() => {
    if (!userPosition?.shares || BigInt(userPosition.shares) <= BigInt(0)) {
      return false;
    }
    
    if (!userPosition?.voteSelection || feeGovernance.length === 0) {
      return false;
    }

    // Get the highest voted fee (first in sorted array)
    const highestVotedFee = feeGovernance[0];
    
    // Check if user's selection matches highest voted fee and it's not currently active
    return userPosition.voteSelection === highestVotedFee?.fee && !highestVotedFee?.isActive;
  }, [userPosition, feeGovernance]);
};

/**
 * Hook for formatting token amounts with memoization
 */
export const useTokenFormatter = (decimals: number = 18, symbol: string = '') => {
  const formatAmount = useCallback((amount: string): string => {
    try {
      const formatted = Number(ethers.formatUnits(amount, decimals)).toLocaleString(undefined, { 
        maximumFractionDigits: 4 
      });
      return `${formatted} ${symbol}`;
    } catch {
      return 'N/A';
    }
  }, [decimals, symbol]);

  return { formatAmount };
};

/**
 * Hook for formatting timestamps
 */
export const useTimestampFormatter = () => {
  const formatTimestamp = useCallback((timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  }, []);

  return { formatTimestamp };
};

/**
 * Hook for getting action styles
 */
export const useActionStyles = () => {
  const getActionIcon = useCallback((type: string) => {
    switch (type) {
      case 'deposit': return '💰';
      case 'withdraw': return '💸';
      case 'flashloan': return '⚡';
      case 'vote': return '🗳️';
      case 'fee_proposal': return '📝';
      case 'fee_execution': return '✅';
      default: return '📄';
    }
  }, []);

  const getActionColor = useCallback((type: string) => {
    switch (type) {
      case 'deposit': return '#22c55e';
      case 'withdraw': return '#ef4444';
      case 'flashloan': return '#8b5cf6';
      case 'vote': return '#f59e0b';
      case 'fee_proposal': return '#06b6d4';
      case 'fee_execution': return '#10b981';
      default: return 'var(--text-primary)';
    }
  }, []);

  return { getActionIcon, getActionColor };
};