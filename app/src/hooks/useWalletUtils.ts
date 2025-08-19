import { useCallback, useMemo } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ethers } from 'ethers';

/**
 * Shared wallet utilities hook
 * Consolidates duplicated wallet logic across components
 */
export const useWalletUtils = () => {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Create stable ethers provider from wagmi public client
  const provider = useMemo(() => {
    const rpcUrl = publicClient?.transport?.url || 'http://localhost:8545';
    return new ethers.JsonRpcProvider(rpcUrl);
  }, [publicClient?.transport?.url]);

  // Get the current chain ID
  const currentChainId = chainId || 31337;

  // Utility function to create ethers signer from wallet client - FORCE MetaMask
  const getSigner = useCallback(async (): Promise<ethers.Signer> => {
    if (!walletClient || !address) {
      throw new Error('Wallet not connected');
    }
    
    // Force MetaMask provider instead of using local RPC
    if (!window.ethereum) {
      throw new Error('MetaMask not installed');
    }
    
    try {
      // Ensure we're using MetaMask's provider, not the local RPC
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      return signer;
    } catch (error) {
      throw new Error('Failed to get MetaMask signer');
    }
  }, [walletClient, address]);

  return {
    address,
    isConnected,
    chainId: currentChainId,
    provider,
    getSigner
  };
};