import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  base,
  hardhat
} from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

export const networkConfig = getDefaultConfig({
  appName: 'ERC20 Flash Lender',
  projectId: 'erc20FlashLender',
  chains: [hardhat, mainnet, polygon, optimism, arbitrum, base],
  ssr: false,
});