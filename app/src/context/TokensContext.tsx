import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { TokenBalance } from '../types';

// ==================== CONTEXT TYPES ====================

export interface TokensContextState {
  tokens: TokenBalance[];
  isLoading: boolean;
  error: string | null;
}

export interface TokensContextType extends TokensContextState {
  addToken: (token: TokenBalance) => void;
  removeToken: (address: string) => void;
  updateToken: (address: string, updates: Partial<TokenBalance>) => void;
  getToken: (address: string) => TokenBalance | undefined;
  getAllTokens: () => TokenBalance[];
  hasToken: (address: string) => boolean;
  clearAllTokens: () => void;
  loadTokensFromStorage: () => void;
}

// ==================== ACTION TYPES ====================

type TokenAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_TOKENS'; payload: TokenBalance[] }
  | { type: 'ADD_TOKEN'; payload: TokenBalance }
  | { type: 'REMOVE_TOKEN'; payload: string }
  | { type: 'UPDATE_TOKEN'; payload: { address: string; updates: Partial<TokenBalance> } }
  | { type: 'CLEAR_TOKENS' };

// ==================== REDUCER ====================

const tokenReducer = (state: TokensContextState, action: TokenAction): TokensContextState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    
    case 'SET_TOKENS':
      return { ...state, tokens: action.payload, error: null };
    
    case 'ADD_TOKEN': {
      const existingIndex = state.tokens.findIndex(
        token => token.address.toLowerCase() === action.payload.address.toLowerCase()
      );
      
      if (existingIndex >= 0) {
        // Update existing token
        const updatedTokens = [...state.tokens];
        updatedTokens[existingIndex] = action.payload;
        return { ...state, tokens: updatedTokens };
      } else {
        // Add new token
        return { ...state, tokens: [...state.tokens, action.payload] };
      }
    }
    
    case 'REMOVE_TOKEN':
      return {
        ...state,
        tokens: state.tokens.filter(
          token => token.address.toLowerCase() !== action.payload.toLowerCase()
        )
      };
    
    case 'UPDATE_TOKEN': {
      const updatedTokens = state.tokens.map(token => {
        if (token.address.toLowerCase() === action.payload.address.toLowerCase()) {
          return { ...token, ...action.payload.updates };
        }
        return token;
      });
      return { ...state, tokens: updatedTokens };
    }
    
    case 'CLEAR_TOKENS':
      return { ...state, tokens: [] };
    
    default:
      return state;
  }
};

// ==================== STORAGE UTILITIES ====================

const STORAGE_KEY = 'erc20-lender-tokens';

const saveTokensToStorage = (tokens: TokenBalance[]): void => {
  try {
    // Convert BigInt values to strings for JSON serialization
    const serializedTokens = tokens.map(token => ({
      ...token,
      userBalance: token.userBalance.toString(),
      userAllowance: token.userAllowance.toString()
    }));
    
    // Use JSON.stringify with a replacer function to handle any remaining BigInt values
    const jsonString = JSON.stringify(serializedTokens, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
    
    localStorage.setItem(STORAGE_KEY, jsonString);
  } catch (error) {
    console.error('Failed to save tokens to localStorage:', error);
  }
};

const loadTokensFromStorage = (): TokenBalance[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    
    // Convert string values back to BigInt with proper error handling
    return parsed.map((token: any) => {
      try {
        return {
          ...token,
          userBalance: token.userBalance ? BigInt(token.userBalance) : BigInt(0),
          userAllowance: token.userAllowance ? BigInt(token.userAllowance) : BigInt(0)
        };
      } catch (error) {
        console.warn(`Failed to parse BigInt values for token ${token.address}:`, error);
        return {
          ...token,
          userBalance: BigInt(0),
          userAllowance: BigInt(0)
        };
      }
    });
  } catch (error) {
    console.error('Failed to load tokens from localStorage:', error);
    // Clear corrupted data
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

// ==================== CONTEXT CREATION ====================

const TokensContext = createContext<TokensContextType | undefined>(undefined);

// ==================== PROVIDER COMPONENT ====================

export interface TokenProviderProps {
  children: React.ReactNode;
}

export const TokenProvider: React.FC<TokenProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(tokenReducer, {
    tokens: [],
    isLoading: false,
    error: null
  });

  // Load tokens from localStorage on mount
  useEffect(() => {
    const storedTokens = loadTokensFromStorage();
    dispatch({ type: 'SET_TOKENS', payload: storedTokens });
  }, []);

  // Save tokens to localStorage whenever tokens change
  useEffect(() => {
    if (state.tokens.length > 0) {
      saveTokensToStorage(state.tokens);
    }
  }, [state.tokens]);

  // ==================== CONTEXT METHODS ====================

  const addToken = useCallback((token: TokenBalance) => {
    dispatch({ type: 'ADD_TOKEN', payload: token });
  }, []);

  const removeToken = useCallback((address: string) => {
    dispatch({ type: 'REMOVE_TOKEN', payload: address });
  }, []);

  const updateToken = useCallback((address: string, updates: Partial<TokenBalance>) => {
    dispatch({ type: 'UPDATE_TOKEN', payload: { address, updates } });
  }, []);

  const getToken = useCallback((address: string): TokenBalance | undefined => {
    return state.tokens.find(
      token => token.address.toLowerCase() === address.toLowerCase()
    );
  }, [state.tokens]);

  const getAllTokens = useCallback((): TokenBalance[] => {
    return [...state.tokens];
  }, [state.tokens]);

  const hasToken = useCallback((address: string): boolean => {
    return state.tokens.some(
      token => token.address.toLowerCase() === address.toLowerCase()
    );
  }, [state.tokens]);

  const clearAllTokens = useCallback(() => {
    dispatch({ type: 'CLEAR_TOKENS' });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const loadTokensFromStorageManual = useCallback(() => {
    const storedTokens = loadTokensFromStorage();
    dispatch({ type: 'SET_TOKENS', payload: storedTokens });
  }, []);

  // ==================== CONTEXT VALUE ====================

  const contextValue: TokensContextType = {
    ...state,
    addToken,
    removeToken,
    updateToken,
    getToken,
    getAllTokens,
    hasToken,
    clearAllTokens,
    loadTokensFromStorage: loadTokensFromStorageManual
  };

  return (
    <TokensContext.Provider value={contextValue}>
      {children}
    </TokensContext.Provider>
  );
};

// ==================== HOOK ====================

export const useTokens = (): TokensContextType => {
  const context = useContext(TokensContext);
  if (context === undefined) {
    throw new Error('useTokens must be used within a TokenProvider');
  }
  return context;
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Helper function to create a TokenBalance from basic token info
 */
export const createTokenBalance = (
  address: string,
  symbol: string,
  name: string,
  decimals: number,
  userBalance: bigint = BigInt(0),
  userAllowance: bigint = BigInt(0),
  logoUrl?: string
): TokenBalance => {
  return {
    address,
    symbol,
    name,
    decimals,
    logoUrl,
    userBalance,
    userAllowance
  };
};

/**
 * Helper function to update token balances from wallet/blockchain data
 */
export const updateTokenBalances = (
  token: TokenBalance,
  userBalance?: bigint,
  userAllowance?: bigint
): TokenBalance => {
  return {
    ...token,
    userBalance: userBalance ?? token.userBalance,
    userAllowance: userAllowance ?? token.userAllowance
  };
};
