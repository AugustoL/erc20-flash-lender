import { useCallback, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { ethers } from 'ethers';
import { useTokens } from '../context/TokensContext';
import { TokenBalance } from '../types';
import { MulticallService } from '../services/MulticallService';

/**
 * Hook to sync token data with wallet connection and balances
 */
export const useTokenSync = () => {
  const { address, isConnected } = useAccount();
  const { tokens, updateToken, clearAllTokens, addToken } = useTokens();

  // Clear tokens when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      // Reset all token balances to 0 when wallet disconnects
      tokens.forEach(token => {
        updateToken(token.address, {
          userBalance: BigInt(0),
          userAllowance: BigInt(0)
        });
      });
    }
  }, [isConnected, tokens, updateToken]);

  // Function to update a token's balance and allowance
  const syncTokenBalance = useCallback(async (
    tokenAddress: string,
    provider: ethers.Provider,
    spenderAddress?: string
  ) => {
    if (!address || !isConnected) return;

    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function balanceOf(address owner) view returns (uint256)',
          'function allowance(address owner, address spender) view returns (uint256)'
        ],
        provider
      );

      const [balance, allowance] = await Promise.all([
        tokenContract.balanceOf?.(address) ?? BigInt(0),
        spenderAddress ? (tokenContract.allowance?.(address, spenderAddress) ?? BigInt(0)) : BigInt(0)
      ]);

      updateToken(tokenAddress, {
        userBalance: balance,
        userAllowance: allowance
      });

      return { balance, allowance };
    } catch (error) {
      console.error(`Error syncing token balance for ${tokenAddress}:`, error);
      return null;
    }
  }, [address, isConnected, updateToken]);

  // Create MulticallService instance factory
  const createMulticallService = useCallback((provider: ethers.Provider) => 
    new MulticallService(provider), 
    []
  );

  // Function to sync multiple tokens at once using multicall
  const syncMultipleTokens = useCallback(async (
    tokenAddresses: string[],
    provider: ethers.Provider,
    spenderAddress?: string
  ) => {
    if (!address || !isConnected || tokenAddresses.length === 0) return;

    try {
      
      // Create multicall for all tokens (2 calls per token: balance + allowance)
      const multicallCalls = [];
      const ERC20_ABI = [
        'function balanceOf(address owner) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)'
      ];
      
      const tokenInterface = new ethers.Interface(ERC20_ABI);
      
      for (const tokenAddress of tokenAddresses) {
        multicallCalls.push(
          // Balance
          {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'balanceOf', [address]),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'balanceOf'
          },
          // Allowance (if spender provided)
          spenderAddress ? {
            target: tokenAddress,
            callData: MulticallService.encodeCall(tokenInterface, 'allowance', [address, spenderAddress]),
            allowFailure: true,
            contractInterface: tokenInterface,
            methodName: 'allowance'
          } : null
        );
      }

      // Filter out null calls
      const validCalls = multicallCalls.filter(call => call !== null);
      const callsPerToken = spenderAddress ? 2 : 1;

      const multicallService = createMulticallService(provider);
      const response = await multicallService.multicall(validCalls);

      // Process results and update tokens
      const results = [];
      for (let i = 0; i < tokenAddresses.length; i++) {
        const tokenAddress = tokenAddresses[i];
        if (!tokenAddress) continue;
        
        const baseIndex = i * callsPerToken;
        
        try {
          const balance = response.decoded[baseIndex]?.[0] || BigInt(0);
          const allowance = spenderAddress && callsPerToken > 1 
            ? response.decoded[baseIndex + 1]?.[0] || BigInt(0)
            : BigInt(0);

          updateToken(tokenAddress, {
            userBalance: balance,
            userAllowance: allowance
          });

          results.push({ 
            status: 'fulfilled' as const, 
            value: { balance, allowance } 
          });
        } catch (error) {
          console.warn(`Failed to process multicall result for token ${tokenAddress}:`, error);
          results.push({ 
            status: 'rejected' as const, 
            reason: error 
          });
        }
      }

      return results;
    } catch (error) {
      console.warn('Multicall failed, falling back to individual calls:', error);
      
      // Fallback to original approach
      const results = await Promise.allSettled(
        tokenAddresses.map(addr => syncTokenBalance(addr, provider, spenderAddress))
      );

      return results;
    }
  }, [address, isConnected, updateToken, createMulticallService, syncTokenBalance]);

  // Function to add a new token with immediate balance sync
  const addTokenWithSync = useCallback(async (
    token: Omit<TokenBalance, 'userBalance' | 'userAllowance'>,
    provider: ethers.Provider,
    spenderAddress?: string
  ) => {
    // First add the token with zero balances
    const fullToken: TokenBalance = {
      ...token,
      userBalance: BigInt(0),
      userAllowance: BigInt(0)
    };

    addToken(fullToken);

    // Then sync the actual balances
    if (isConnected && address) {
      await syncTokenBalance(token.address, provider, spenderAddress);
    }

    return fullToken;
  }, [address, isConnected, syncTokenBalance, addToken]);

  return {
    syncTokenBalance,
    syncMultipleTokens,
    addTokenWithSync,
    isWalletConnected: isConnected,
    walletAddress: address
  };
};

/**
 * Hook to get token information with automatic sync
 */
export const useTokenInfo = (tokenAddress: string) => {
  const { getToken, hasToken } = useTokens();
  const { syncTokenBalance } = useTokenSync();
  
  const token = getToken(tokenAddress);
  
  // Function to refresh this specific token's data
  const refreshToken = useCallback(async (
    provider: ethers.Provider,
    spenderAddress?: string
  ) => {
    return await syncTokenBalance(tokenAddress, provider, spenderAddress);
  }, [tokenAddress, syncTokenBalance]);

  return {
    token,
    hasToken: hasToken(tokenAddress),
    refreshToken,
    userBalance: token?.userBalance ?? BigInt(0),
    userAllowance: token?.userAllowance ?? BigInt(0)
  };
};
