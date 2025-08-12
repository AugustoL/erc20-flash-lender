import { useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isValid: boolean;
}

interface UseTokenInfoReturn {
  tokenInfo: TokenInfo | null;
  isLoading: boolean;
  error: string | null;
  validateToken: (address: string) => void;
  clearToken: () => void;
}

// Cache for token info to avoid repeated calls
const tokenInfoCache = new Map<string, TokenInfo>();

export function useTokenInfo(provider?: ethers.Provider): UseTokenInfoReturn {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateToken = useCallback(async (address: string) => {
    if (!provider) {
      setError('No provider available');
      return;
    }

    if (!address || address.trim() === '') {
      setTokenInfo(null);
      setError(null);
      return;
    }

    // Basic address format validation
    if (!ethers.isAddress(address)) {
      setTokenInfo(null);
      setError('Invalid token address format');
      return;
    }

    const normalizedAddress = ethers.getAddress(address);

    // Check cache first
    if (tokenInfoCache.has(normalizedAddress)) {
      const cachedInfo = tokenInfoCache.get(normalizedAddress)!;
      setTokenInfo(cachedInfo);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create a contract instance to fetch token info
      const tokenContract = new ethers.Contract(
        normalizedAddress,
        [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ],
        provider
      );

      // Fetch token information
      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol?.() || 'UNKNOWN',
        tokenContract.name?.() || 'Unknown Token',
        tokenContract.decimals?.() || 18
      ]);

      const info: TokenInfo = {
        address: normalizedAddress,
        symbol: symbol.toString(),
        name: name.toString(),
        decimals: Number(decimals),
        isValid: true
      };

      // Cache the result
      tokenInfoCache.set(normalizedAddress, info);

      setTokenInfo(info);
      setError(null);
    } catch (err) {
      console.error('Error fetching token info:', err);
      setTokenInfo(null);
      
      if (err instanceof Error) {
        if (err.message.includes('call revert')) {
          setError('Token contract not found or invalid');
        } else if (err.message.includes('network')) {
          setError('Network error - please try again');
        } else {
          setError('Failed to fetch token information');
        }
      } else {
        setError('Failed to fetch token information');
      }
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  const clearToken = useCallback(() => {
    setTokenInfo(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    tokenInfo,
    isLoading,
    error,
    validateToken,
    clearToken
  };
}

// Debounced version for real-time input validation
export function useDebouncedTokenInfo(provider?: ethers.Provider, delay: number = 500): UseTokenInfoReturn {
  const tokenInfoHook = useTokenInfo(provider);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedValidateToken = useCallback((address: string) => {
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If address is empty, clear immediately
    if (!address || address.trim() === '') {
      tokenInfoHook.validateToken('');
      return;
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      tokenInfoHook.validateToken(address);
    }, delay);
  }, [tokenInfoHook, delay]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    ...tokenInfoHook,
    validateToken: debouncedValidateToken
  };
}