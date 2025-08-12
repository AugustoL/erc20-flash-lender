import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { getSupportedChains } from '../config';
import { hardhat } from 'wagmi/chains';

const supportedChains = getSupportedChains();
// Ensure we have at least one chain for the config
const chains = supportedChains.length > 0 ? supportedChains : [hardhat];

export const networkConfig = getDefaultConfig({
  appName: 'ERC20 Flash Lender',
  projectId: 'erc20FlashLender',
  chains: chains as [any, ...any[]],
  ssr: false
});