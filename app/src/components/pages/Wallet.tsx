import { useChainId } from 'wagmi';
import { useEffect } from 'react';
import { useFlashLender } from '../../hooks/useFlashLender';
import { NewTokenDepositModal, DiscoverTokensModal } from '../common/modal';
import { useWalletRows } from '../../hooks/useWalletData';
import WalletTokenRow from '../common/WalletTokenRow';
import { useTokens } from '../../context';
import { useWalletUtils } from '../../hooks/useWalletUtils';
import { useModalManager } from '../../hooks/useModalManager';
import { useTransactions } from '../../hooks/useTransactions';
import { useTokenSync } from '../../hooks/useTokenSync';
import { hasContractsDeployed } from '../../utils/helpers';
import { getERC20FlashLenderAddress } from '../../config';
import NoContractsMessage from '../common/NoContractsMessage';

export default function Wallet() {
  const chainId = useChainId();
  const { address, isConnected, provider } = useWalletUtils();
  const { getAllTokens } = useTokens();

  // Show loading while chain ID is not available
  if (!chainId) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head"><h3>WALLET TOKENS</h3></div>
          <div className="tokens-loading-container">
            <div>Connecting to network...</div>
          </div>
        </div>
      </div>
    );
  }

  // Check if contracts are deployed on current network
  if (!hasContractsDeployed(chainId)) {
    return <NoContractsMessage pageName="Wallet" />;
  }
  
  const {
    isDiscoverModalOpen,
    isNewTokenModalOpen,
    selectedToken,
    isTransactionLoading,
    openDiscoverModal,
    closeDiscoverModal,
    openNewTokenModal,
    closeNewTokenModal,
    setTransactionLoading
  } = useModalManager();
  
  const { executeNewTokenTransaction } = useTransactions();
  const { syncMultipleTokens } = useTokenSync();

  const {
    pools,
    userPositions,
    isLoading,
    error,
    refresh
  } = useFlashLender({
    provider,
    userAddress: address || undefined,
    autoRefresh: false,
    refreshInterval: 30000
  });
  const savedTokens = getAllTokens();
  
  // Sync all saved token balances and allowances when wallet connects or chain changes
  useEffect(() => {
    if (isConnected && provider && chainId && savedTokens.length > 0) {
      const spenderAddress = getERC20FlashLenderAddress(chainId);
      const tokenAddresses = savedTokens.map(token => token.address);
      syncMultipleTokens(tokenAddresses, provider, spenderAddress).catch(error => {
        console.warn('Failed to sync token balances on wallet load:', error);
      });
    }
  }, [isConnected, provider, chainId, savedTokens.length, syncMultipleTokens]);
  
  // Transform pools data into table rows format using optimized hook
  const rows = useWalletRows(userPositions, savedTokens, pools);

  const handleNewTokenConfirm = async (tokenAddress: string, amount: string, tokenInfo: { symbol: string; name: string; decimals: number }) => {
    setTransactionLoading(true);
    try {
      await executeNewTokenTransaction('deposit', tokenAddress, amount, tokenInfo);
      
      // Sync token balances and allowances after successful transaction
      if (provider && chainId) {
        const spenderAddress = getERC20FlashLenderAddress(chainId);
        await syncMultipleTokens([tokenAddress], provider, spenderAddress);
      }
      
      closeNewTokenModal();
    } catch (error) {
      setTransactionLoading(false);
    }
  };

  const handleNewTokenApprove = async (tokenAddress: string, amount: string) => {
    setTransactionLoading(true);
    
    try {
      await executeNewTokenTransaction('approve', tokenAddress, amount, { symbol: '', name: '', decimals: 18 });
      
      // Sync token allowances after successful approval
      if (provider && chainId) {
        const spenderAddress = getERC20FlashLenderAddress(chainId);
        await syncMultipleTokens([tokenAddress], provider, spenderAddress);
      }
      
      setTransactionLoading(false);
    } catch (error) {
      setTransactionLoading(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head"><h3>WALLET TOKENS</h3></div>
          <div className="tokens-loading-container">
            <div>Loading protocol data...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head"><h3>WALLET TOKENS</h3></div>
          <div className="tokens-error-container">
            <div className="tokens-error-message">
              Error loading data: {error.message}
            </div>
            <button onClick={refresh} className="btn primary">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head-with-button">
          <h3>WALLET TOKENS</h3>
          <button 
            className="btn-md primary" 
            onClick={openDiscoverModal}
            disabled={!isConnected}
          >
            Discover Tokens
          </button>
        </div>
        <div className="table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="center">Type</th>
                <th className="center-content">Status</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="tokens-empty-table-cell">
                    {!isConnected 
                      ? "Connect your wallet to view available pools"
                      : "No token pools found. The contract may not have any configured tokens yet."
                    }
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <WalletTokenRow
                    key={row.address}
                    row={row}
                    isConnected={isConnected}
                    address={address}
                    chainId={chainId}
                    onDeposit={openNewTokenModal}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Token Deposit Modal */}
      <NewTokenDepositModal
        isOpen={isNewTokenModalOpen}
        onClose={closeNewTokenModal}
        onConfirm={handleNewTokenConfirm}
        onApprove={handleNewTokenApprove}
        isLoading={isTransactionLoading}
        provider={provider}
        userAddress={address}
        selectedTokenAddress={selectedToken}
        existingTokens={savedTokens.map(token => ({
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals
        }))}
      />

      {/* Discover Tokens Modal */}
      <DiscoverTokensModal
        isOpen={isDiscoverModalOpen}
        onClose={closeDiscoverModal}
        provider={provider}
      />
    </div>
  );
}
