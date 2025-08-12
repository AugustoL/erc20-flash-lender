import { IS_ENV_PRODUCTION } from '../utils/constants';
import devConfig from './dev.json';
import prodConfig from './prod.json';
import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  base,
  hardhat
} from 'wagmi/chains';
import type { Chain } from 'wagmi/chains';

export interface Contract {
  name: string;
  version: string;
  address: string;
}

export interface Network {
  chainId: number;
  name: string;
  currency: string;
  explorerUrl: string;
  publicProviders: string[];
  contracts: Contract[];
}

export interface Config {
  networks: Network[];
}

/**
 * Get the configuration based on the current environment
 * Returns dev config for development/localhost, prod config for production
 */
export function getConfig(): Config {
  // Check if we're in development mode
  const isDevelopment = !IS_ENV_PRODUCTION;

  return isDevelopment ? devConfig : prodConfig;
}

/**
 * Get contract address by name and chain ID
 * @param contractName - Name of the contract (e.g., 'ERC20FlashLender')
 * @param chainId - Chain ID (e.g., 1 for mainnet, 31337 for localhost)
 * @returns Contract address or null if not found
 */
export function getContractAddress(contractName: string, chainId: number): string | null {
  const config = getConfig();
  
  const network = config.networks.find(n => n.chainId === chainId);
  if (!network) {
    console.warn(`Network with chainId ${chainId} not found in config`);
    return null;
  }

  const contract = network.contracts.find(c => c.name === contractName);
  if (!contract) {
    console.warn(`Contract ${contractName} not found for chainId ${chainId}`);
    return null;
  }

  return contract.address;
}

/**
 * Get the ERC20FlashLender contract address for the current network
 * @param chainId - Chain ID
 * @returns ERC20FlashLender contract address
 */
export function getERC20FlashLenderAddress(chainId: number): string | null {
  return getContractAddress('ERC20FlashLender', chainId);
}

/**
 * Get all contracts for a specific network
 * @param chainId - Chain ID
 * @returns Array of contracts or empty array if network not found
 */
export function getNetworkContracts(chainId: number): Contract[] {
  const config = getConfig();
  
  const network = config.networks.find(n => n.chainId === chainId);
  return network ? network.contracts : [];
}

/**
 * Get network configuration by chain ID
 * @param chainId - Chain ID
 * @returns Network configuration or null if not found
 */
export function getNetworkConfig(chainId: number): Network | null {
  const config = getConfig();
  return config.networks.find(n => n.chainId === chainId) || null;
}

/**
 * Get all supported networks
 * @returns Array of all supported networks
 */
export function getAllNetworks(): Network[] {
  const config = getConfig();
  return config.networks;
}

/**
 * Get supported wagmi chains based on the configuration
 * Maps chain IDs from config to wagmi chain objects
 * @returns Array of wagmi Chain objects
 */
export function getSupportedChains(): Chain[] {
  const config = getConfig();
  const chainMap: Record<number, Chain> = {
    1: mainnet,
    137: polygon,
    10: optimism,
    42161: arbitrum,
    8453: base,
    31337: hardhat
  };

  return config.networks
    .map(network => chainMap[network.chainId])
    .filter((chain): chain is Chain => chain !== undefined);
}
