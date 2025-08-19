import { useMemo } from 'react';
import { ethers } from 'ethers';
import { TokenPoolRow, PoolData, UserPositionData } from '../types';
import { useTokens } from '../context';

/**
 * Custom hook to transform pools and user positions into tokens table rows
 * Optimized with stable memoization to prevent unnecessary re-renders
 */
export const useTokensRows = (pools: PoolData[] = [], userPositions: UserPositionData[] = []): TokenPoolRow[] => {
  const { getToken } = useTokens();

  return useMemo(() => {
    if (!pools || pools.length === 0) {
      return [];
    }

    return pools.map(pool => {
      // Use a more stable check for user positions to avoid unnecessary recalculations
      const userPosition = userPositions?.find(pos => 
        pos?.address?.toLowerCase() === pool?.address?.toLowerCase()
      );
      const hasWithdrawableAmount = userPosition?.withdrawable?.netAmount && 
        BigInt(userPosition.withdrawable.netAmount) > BigInt(0);
      
      // Format status amounts
      const decimals = pool.decimals || 18;
      const tokenInContext = getToken(pool.address);
      // Format status amounts
      const walletBalance = tokenInContext?.userBalance
        ? ethers.formatUnits(tokenInContext.userBalance, decimals)
        : '0';
      const approvedAmount = tokenInContext?.userAllowance
        ? ethers.formatUnits(tokenInContext.userAllowance, decimals)
        : '0';
      const depositedAmount = userPosition?.withdrawable?.principal
        ? ethers.formatUnits(userPosition.withdrawable.principal, decimals)
        : '0';
      
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

