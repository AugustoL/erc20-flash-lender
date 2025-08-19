import { useMemo } from 'react';
import { ethers } from 'ethers';
import { useTokens } from '../context';
import { UserPositionData, TokenBalance, WalletTableRow, TokenPool } from '../types/index';

/**
 * Custom hook to transform pools and user positions into dashboard table rows
 * Optimized with stable memoization to prevent unnecessary re-renders
 */
export const useWalletRows = (userPositions: UserPositionData[] = [], savedTokens: TokenBalance[] = [], pools: TokenPool[] = []): WalletTableRow[] => {
  const { getToken } = useTokens();
  
  return useMemo(() => {
    const rows: WalletTableRow[] = [];

    userPositions.map(userPosition => {
      const tokenInContext = getToken(userPosition.address);
      // Format status amounts
      const decimals = userPosition.decimals || 18;
      const walletBalance = tokenInContext?.userBalance
        ? ethers.formatUnits(tokenInContext.userBalance, decimals)
        : '0';
      const approvedAmount = tokenInContext?.userAllowance
        ? ethers.formatUnits(tokenInContext.userAllowance, decimals)
        : '0';
      const depositedAmount = userPosition?.withdrawable?.principal
        ? ethers.formatUnits(userPosition.withdrawable.principal, decimals)
        : '0';

      rows.push({
        poolExists: true,
        address: userPosition.address,
        symbol: userPosition.symbol || 'Unknown',
        name: userPosition.name || 'No name available',
        decimals: userPosition.decimals || 18,
        tokenType: 'Unknown',
        walletBalance,
        approvedAmount,
        depositedAmount
      });
    });

    savedTokens.forEach(token => {
      if ((token.userBalance > 0) && (rows.findIndex(row => row.address === token.address) === -1)) {
        rows.push({
          poolExists: pools.some(pool => pool.address === token.address),
          address: token.address,
          symbol: token.symbol || 'Unknown',
          name: token.name || 'No name available',
          decimals: token.decimals || 18,
          walletBalance: ethers.formatUnits(token.userBalance, Number(token.decimals) || 18),
          approvedAmount: ethers.formatUnits(token.userAllowance, Number(token.decimals) || 18),
          depositedAmount: ethers.formatUnits(0, Number(token.decimals) || 18),
        });
      }
    });

    return rows;
  }, [userPositions, savedTokens, getToken]);
};

