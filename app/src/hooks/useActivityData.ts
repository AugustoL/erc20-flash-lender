import { useCallback } from 'react';
import { ethers } from 'ethers';
import { MINIMUM_FRACTION_DIGITS, MAXIMUM_FRACTION_DIGITS } from '../utils/constants';

/**
 * Hook for formatting token amounts with memoization
 */
export const useTokenFormatter = (decimals: number = 18, symbol: string = '') => {
  const formatAmount = useCallback((amount: string): string => {
    try {
      const formatted = Number(ethers.formatUnits(amount, decimals)).toLocaleString(undefined, { 
        minimumFractionDigits: MINIMUM_FRACTION_DIGITS,
        maximumFractionDigits: MAXIMUM_FRACTION_DIGITS 
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