export const formatAmount = (amount: string | undefined, maxLength: number = 8): string => {
  if (!amount || amount === '0') return '0';
  
  const num = parseFloat(amount);

  if (num === 115792089237316195423570985008687907853269984665640564039457.584007913129639935) // MaxUint256
    return 'Unlimited';

  if (num === 0) return '0';
  
  // For very small numbers, use scientific notation
  if (num < 0.0001) {
    return num.toExponential(2);
  }
  
  // For large numbers, use K/M/B notation
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  
  // For normal numbers, limit decimal places
  const str = num.toFixed(4);
  return str.length > maxLength ? num.toFixed(2) : str;
};

export const getTokenType = (chainId: number, tokenAddress: string, symbol: string): string => {
  // Normalize token address to lowercase for comparison
  const normalizedAddress = tokenAddress.toLowerCase();
  
  // Common token type mappings by chain
  const tokenTypes: Record<number, Record<string, string>> = {
    // Ethereum Mainnet (Chain ID: 1)
    1: {
      '0xa0b86a33e6441ecb12e6eced5ca5e3aa8c2a4c6e': 'LST', // stETH (Lido Staked Ether)
      '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 'LST', // stETH
      '0xbe9895146f7af43049ca1c1ae358b0541ea49704': 'LST', // cbETH (Coinbase Wrapped Staked ETH)
      '0x5e74c9036fb86bd7ecdcb084a0673efc32ea31cb': 'LST', // sETH2 (StakeHound Staked Ether)
      '0x6b175474e89094c44da98b954eedeac495271d0f': 'Stablecoin', // DAI
      '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'Stablecoin', // USDC
      '0xdac17f958d2ee523a2206206994597c13d831ec7': 'Stablecoin', // USDT
      '0x4fabb145d64652a948d72533023f6e7a623c7c53': 'Stablecoin', // BUSD
      '0x853d955acef822db058eb8505911ed77f175b99e': 'Stablecoin', // FRAX
      '0x956f47f50a910163d8bf957cf5846d573e7f87ca': 'Stablecoin', // FEI
      '0x8e870d67f660d95d5be530380d0ec0bd388289e1': 'Wrapped', // PAXG
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'Wrapped', // WBTC
      '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'Wrapped', // WETH
    },
    // Arbitrum One (Chain ID: 42161)
    42161: {
      '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'Wrapped', // WETH
      '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'Wrapped', // WBTC
      '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 'Stablecoin', // USDC
      '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'Stablecoin', // USDT
      '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1': 'Stablecoin', // DAI
    },
    // Polygon (Chain ID: 137)
    137: {
      '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 'Wrapped', // WMATIC
      '0x7ceb23fd6c950e95d5718b0c3e96d6b46de8c1c5': 'Wrapped', // WETH
      '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 'Wrapped', // WBTC
      '0x2791bca1f2de4661ed88a30c99a7a9449aa84174': 'Stablecoin', // USDC
      '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'Stablecoin', // USDT
      '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063': 'Stablecoin', // DAI
    }
  };
  
  // Check if we have a specific mapping for this chain and token
  const chainTokens = tokenTypes[chainId];
  if (chainTokens && chainTokens[normalizedAddress]) {
    return chainTokens[normalizedAddress];
  }
  
  // Fallback to symbol-based detection
  const upperSymbol = symbol.toUpperCase();
  
  // Wrapped tokens
  if (upperSymbol.startsWith('W') && upperSymbol.length <= 5) {
    return 'Wrapped';
  }
  
  // Stablecoins
  if (upperSymbol.includes('USD') || 
      upperSymbol === 'DAI' || 
      upperSymbol === 'FRAX' || 
      upperSymbol === 'LUSD' ||
      upperSymbol === 'USDC' ||
      upperSymbol === 'USDT' ||
      upperSymbol === 'BUSD' ||
      upperSymbol === 'TUSD') {
    return 'Stablecoin';
  }
  
  // Liquid Staking Tokens
  if (upperSymbol.includes('ST') && upperSymbol.includes('ETH') ||
      upperSymbol.startsWith('ST') ||
      upperSymbol.includes('LST') ||
      upperSymbol === 'RETH' ||
      upperSymbol === 'CBETH') {
    return 'LST';
  }
  
  // LP tokens
  if (upperSymbol.includes('LP') || 
      upperSymbol.includes('-') ||
      upperSymbol.includes('UNI') ||
      upperSymbol.includes('SLP')) {
    return 'LP Token';
  }
  
  // Default fallback
  return 'ERC-20';
};

/**
 * Check if contracts are deployed for a given chain ID
 * @param chainId - The chain ID to check
 * @returns true if ERC20FlashLender contract is deployed with a real address
 */
export function hasContractsDeployed(chainId: number): boolean {
  try {
    const { getContractAddress } = require('../config');
    const flashLenderAddress = getContractAddress('ERC20FlashLender', chainId);
    
    // Check if we have a valid address (not null, undefined, or placeholder)
    if (!flashLenderAddress) return false;
    
    // Check for common placeholder addresses
    const placeholderAddresses = [
      '0x1234567890123456789012345678901234567890',
      '0x0000000000000000000000000000000000000000'
    ];
    
    return !placeholderAddresses.includes(flashLenderAddress.toLowerCase());
  } catch (error) {
    console.warn('Error checking contract deployment:', error);
    return false;
  }
}