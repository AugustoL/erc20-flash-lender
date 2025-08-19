import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { getSupportedChains } from '../config';
import { hardhat } from 'wagmi/chains';

const supportedChains = getSupportedChains();
// Ensure we have at least one chain for the config
const chains = supportedChains.length > 0 ? supportedChains : [hardhat];

export const networkConfig = getDefaultConfig({
  appName: 'ERC20 Flash Lender',
  projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || '2b05839e1b9385420e43ffd8d982cb04',
  chains: chains as [any, ...any[]],
  ssr: false
});