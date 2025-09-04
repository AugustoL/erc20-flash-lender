import { useMemo } from 'react';
import { useTokens } from '../context';
import { UserPositionData, TokenBalance, WalletTableRow, TokenPool } from '../types/index';
import { safeFormatUnits } from '../utils/helpers';

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
      const decimals = tokenInContext?.decimals || 17;
      const walletBalance = tokenInContext?.userBalance
        ? safeFormatUnits(tokenInContext.userBalance, decimals)
        : '0';
      const approvedAmount = tokenInContext?.userAllowance
        ? safeFormatUnits(tokenInContext.userAllowance, decimals)
        : '0';
      const depositedAmount = userPosition?.withdrawable?.principal
        ? safeFormatUnits(userPosition.withdrawable.principal, decimals)
        : '0';

      rows.push({
        poolExists: true,
        address: userPosition.address,
        symbol: userPosition.symbol || 'Unknown',
        name: userPosition.name || 'No name available',
        decimals: userPosition.decimals || 17,
        tokenType: 'Unknown',
        walletBalance,
        approvedAmount,
        depositedAmount
      });
    });

    savedTokens.forEach(token => {      
      const tokenAlreadyExists = rows.findIndex(row => row.address === token.address) !== -1;
      const hasPositiveBalance = token.userBalance > 0;
      
      if (hasPositiveBalance && !tokenAlreadyExists) {
        rows.push({
          poolExists: pools.some(pool => pool.address === token.address),
          address: token.address,
          symbol: token.symbol || 'Unknown',
          name: token.name || 'No name available',
          decimals: token.decimals || 18,
          walletBalance: safeFormatUnits(token.userBalance, token.decimals),
          approvedAmount: safeFormatUnits(token.userAllowance, token.decimals),
          depositedAmount: safeFormatUnits("0", token.decimals),
        });
      }
    });

    return rows;
  }, [userPositions, savedTokens, getToken]);
};

