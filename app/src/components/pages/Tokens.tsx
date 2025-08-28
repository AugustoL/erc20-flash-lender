import { useChainId } from 'wagmi';
import { useFlashLender } from '../../hooks/useFlashLender';
import { NewTokenDepositModal } from '../common/modal';
import TokensTableRow from '../common/TokensTableRow';
import { useTokensRows } from '../../hooks/useTokensData';
import { useWalletUtils } from '../../hooks/useWalletUtils';
import { useModalManager } from '../../hooks/useModalManager';
import { useTransactions } from '../../hooks/useTransactions';
import { hasContractsDeployed } from '../../utils/helpers';
import NoContractsMessage from '../common/NoContractsMessage';

export default function Tokens() {
  const chainId = useChainId();
  const { address, isConnected, provider } = useWalletUtils();

  // Check if contracts are deployed on current network
  if (!hasContractsDeployed(chainId)) {
    return <NoContractsMessage pageName="Tokens" />;
  }
  const { 
    isNewTokenModalOpen,
    isTransactionLoading,
    openNewTokenModal,
    closeNewTokenModal,
    setTransactionLoading
  } = useModalManager();
  const { executeNewTokenTransaction } = useTransactions();

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

  // Transform pools data into table rows format using optimized hook
  const rows = useTokensRows(pools, userPositions);


  const handleNewTokenDeposit = async (
    tokenAddress: string, 
    amount: string, 
    tokenInfo: { symbol: string; name: string; decimals: number }
  ) => {
    setTransactionLoading(true);
    
    try {
      await executeNewTokenTransaction('deposit', tokenAddress, amount, tokenInfo);
      closeNewTokenModal();
    } catch (error) {
      setTransactionLoading(false);
    }
  };

  const handleNewTokenApproval = async (tokenAddress: string, amount: string) => {
    setTransactionLoading(true);
    
    try {
      await executeNewTokenTransaction('approve', tokenAddress, amount, { symbol: '', name: '', decimals: 18 });
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
          <div className="card-head"><h3>Token Pools</h3></div>
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
          <div className="card-head"><h3>Token Pools</h3></div>
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
          <h3>Token Pools</h3>
          <button 
            className="btn-md primary" 
            onClick={() => openNewTokenModal()}
            disabled={!isConnected}
          >
            <span>+</span>
            Deposit Token
          </button>
        </div>
        <div className="table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="center">TVL</th>
                <th className="center">APY</th>
                <th className="center">LP Fee</th>
                <th className="center-content">Status</th>
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
                  <TokensTableRow
                    key={row.address}
                    row={row}
                    isConnected={isConnected}
                    address={address}
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
        onConfirm={handleNewTokenDeposit}
        onApprove={handleNewTokenApproval}
        isLoading={isTransactionLoading}
        provider={provider}
        userAddress={address}
        existingTokens={pools.map(pool => ({
          address: pool.address,
          symbol: pool.symbol || 'Unknown',
          name: pool.name || 'Unknown Token',
          decimals: pool.decimals || 18
        }))}
      />
    </div>
  );
}
