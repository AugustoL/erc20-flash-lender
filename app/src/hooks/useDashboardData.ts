import { useMemo } from 'react';
import { ethers } from 'ethers';
import { TokenPoolRow, PoolData, UserPosition } from '../types';

/**
 * Custom hook to transform pools and user positions into dashboard table rows
 * Optimized with stable memoization to prevent unnecessary re-renders
 */
export const useDashboardRows = (pools: PoolData[] = [], userPositions: UserPosition[] = []): TokenPoolRow[] => {
  return useMemo(() => {
    if (!pools || pools.length === 0) {
      return [];
    }

    return pools.map(pool => {
      // Use a more stable check for user positions to avoid unnecessary recalculations
      const userPosition = userPositions?.find(pos => 
        pos.token.toLowerCase() === pool.address.toLowerCase()
      );
      
      const hasWithdrawableAmount = userPosition?.withdrawable?.netAmount && 
        BigInt(userPosition.withdrawable.netAmount) > BigInt(0);
      
      // Format status amounts
      const decimals = pool.decimals || 18;
      const walletBalance = pool.userBalance ? 
        ethers.formatUnits(pool.userBalance, decimals) : '0';
      const approvedAmount = pool.userAllowance ? 
        ethers.formatUnits(pool.userAllowance, decimals) : '0';
      const depositedAmount = userPosition?.withdrawable?.principal ? 
        ethers.formatUnits(userPosition.withdrawable.principal, decimals) : '0';
      
      return {
        address: pool.address,
        symbol: pool.symbol || 'Unknown',
        name: pool.name || 'No name available',
        tvl: pool.formattedLiquidity || '0',
        loans: 0,
        volume: '0', 
        lpFeeBps: ((pool.lpFee || 0) / 100).toFixed(2),
        decimals: pool.decimals || 18,
        apy: pool.apy,
        hasUserDeposits: !!hasWithdrawableAmount,
        walletBalance,
        approvedAmount,
        depositedAmount
      };
    });
  }, [pools, userPositions]);
};

/**
 * Optimized hook for getting available balance with memoization
 */
export const useAvailableBalance = (
  currentAction: string,
  selectedToken: string,
  pools: PoolData[],
  userPositions: UserPosition[]
) => {
  return useMemo(() => {
    if (!selectedToken || !pools.length) return '0';

    if (currentAction === 'withdraw') {
      const userPosition = userPositions?.find(
        pos => pos.token.toLowerCase() === selectedToken.toLowerCase()
      );
      
      if (userPosition?.withdrawable?.netAmount) {
        const selectedPool = pools.find(pool => pool.address === selectedToken);
        const decimals = selectedPool?.decimals || 18;
        return ethers.formatUnits(userPosition.withdrawable.netAmount, decimals);
      }
      return '0';
    }
    
    // For deposit and approve
    const selectedPool = pools.find(pool => pool.address === selectedToken);
    if (selectedPool?.userBalance) {
      const decimals = selectedPool.decimals || 18;
      return ethers.formatUnits(selectedPool.userBalance, decimals);
    }
    return '0';
  }, [currentAction, selectedToken, pools, userPositions]);
};

/**
 * Optimized hook for getting available fees with memoization
 */
export const useAvailableFees = (
  selectedToken: string,
  pools: PoolData[],
  userPositions: UserPosition[]
) => {
  return useMemo(() => {
    if (!selectedToken || !pools.length) return '0';

    const userPosition = userPositions?.find(
      pos => pos.token.toLowerCase() === selectedToken.toLowerCase()
    );
    
    if (userPosition?.withdrawable?.fees) {
      const selectedPool = pools.find(pool => pool.address === selectedToken);
      const decimals = selectedPool?.decimals || 18;
      return ethers.formatUnits(userPosition.withdrawable.fees, decimals);
    }
    return '0';
  }, [selectedToken, pools, userPositions]);
};

/**
 * Hook for stable provider creation to prevent unnecessary re-renders
 */
export const useStableProvider = (rpcUrl?: string) => {
  return useMemo(() => {
    const url = rpcUrl || 'http://localhost:8545';
    return new ethers.JsonRpcProvider(url);
  }, [rpcUrl]);
};