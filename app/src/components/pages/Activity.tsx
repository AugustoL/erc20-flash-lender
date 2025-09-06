import { useParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { ethers } from 'ethers';
import { FlashLenderDataService } from '../../services/FlashLenderDataService';
import { UserAction } from '../../types';
import { hasContractsDeployed } from '../../utils/helpers';
import { MINIMUM_FRACTION_DIGITS, MAXIMUM_FRACTION_DIGITS } from '../../utils/constants';
import NoContractsMessage from '../common/NoContractsMessage';
import { getNetworkContracts } from '../../config';

export default function Activity() {
  const { userAddress } = useParams<{ userAddress: string }>();
  const chainId = useChainId();
  const { chainId: accountChainId } = useAccount();

  // Check if contracts are deployed on current network
  if (!hasContractsDeployed(chainId)) {
    return <NoContractsMessage pageName="Activity" />;
  }
  
  // Get the current chain ID
  const currentChainId = accountChainId || 31337; // Default to localhost if no chain
  const [actions, setActions] = useState<UserAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Map<string, { symbol: string; decimals: number }>>(new Map());

  // Create ethers provider
  const provider = useMemo(() => {
    const rpcUrl = 'http://localhost:8545'; // Default to localhost
    return new ethers.JsonRpcProvider(rpcUrl);
  }, []);

  // Initialize service
  const service = useMemo(() => {
    try {
      return new FlashLenderDataService(currentChainId);
    } catch (error) {
      console.error('Failed to initialize FlashLenderDataService:', error);
      return null;
    }
  }, [currentChainId]);

  // Fetch user actions
  useEffect(() => {
    if (!userAddress || !service) return;

    const fetchUserActions = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        
        // Get all historical token addresses (including empty pools)
        const fromBlock = getNetworkContracts(currentChainId).find(c => c.name === 'ERC20FlashLender')?.fromBlock || 1;
        const historicalTokens = await service.getAllHistoricalTokens(fromBlock);
        const allActions: UserAction[] = [];
        const metadata = new Map<string, { symbol: string; decimals: number }>();

        // Fetch actions for each historical token
        for (const tokenAddress of historicalTokens) {
          try {
            const tokenActions = await service.getUserActions(tokenAddress, userAddress, fromBlock);
            allActions.push(...tokenActions);
            
            // Fetch token metadata for formatting
            try {
              const tokenMetadata = await service.getTokenMetadata(tokenAddress);
              metadata.set(tokenAddress, {
                symbol: tokenMetadata.symbol,
                decimals: tokenMetadata.decimals
              });
            } catch (metaErr) {
              console.warn(`Failed to fetch metadata for token ${tokenAddress}:`, metaErr);
              // Use default metadata for unknown tokens
              metadata.set(tokenAddress, {
                symbol: 'UNKNOWN',
                decimals: 18
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch actions for token ${tokenAddress}:`, err);
          }
        }

        // Sort by block number and log index (most recent first)
        allActions.sort((a, b) => {
          if (b.blockNumber !== a.blockNumber) {
            return b.blockNumber - a.blockNumber;
          }
          return b.logIndex - a.logIndex;
        });

        setActions(allActions);
        setTokenMetadata(metadata);
      } catch (err) {
        console.error('Error fetching user actions:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch user actions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserActions();
  }, [userAddress, service]);

  // Format token amount
  const formatAmount = (amount: string, tokenAddress: string): string => {
    const metadata = tokenMetadata.get(tokenAddress);
    if (!metadata) return 'Unknown amount';
    
    try {
      const formatted = ethers.formatUnits(amount, metadata.decimals);
      const numericValue = parseFloat(formatted);
      return `${numericValue.toLocaleString('en-US', {
        minimumFractionDigits: MINIMUM_FRACTION_DIGITS,
        maximumFractionDigits: MAXIMUM_FRACTION_DIGITS
      })} ${metadata.symbol}`;
    } catch {
      return 'Invalid amount';
    }
  };

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get action type emoji and color
  const getActionStyle = (type: string) => {
    switch (type) {
      case 'deposit':
        return { emoji: '💰', color: 'var(--success)' };
      case 'withdraw':
        return { emoji: '💸', color: 'var(--warning)' };
      case 'flashloan':
        return { emoji: '⚡', color: 'var(--accent)' };
      case 'vote':
        return { emoji: '🗳️', color: 'var(--accent-alt)' };
      case 'fee_collection':
        return { emoji: '💎', color: 'var(--gold)' };
      case 'fee_proposal':
        return { emoji: '📝', color: '#06b6d4' };
      case 'fee_execution':
        return { emoji: '✅', color: '#10b981' };
      default:
        return { emoji: '📝', color: 'var(--text-sec)' };
    }
  };

  if (!userAddress) {
    return (
      <div className="dash-container">
        <div className="card surface">
          <div className="card-head">
            <h3>User Activity</h3>
          </div>
          <div className="activity-error">
            <p className="activity-error-text">No user address provided</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head">
          <h3>User Activity</h3>
          <p className="activity-header-subtitle">
            Address: {userAddress}
          </p>
        </div>

        {isLoading ? (
          <div className="activity-loading">
            <p className="activity-loading-text">Loading user activity...</p>
          </div>
        ) : error ? (
          <div className="activity-error">
            <p className="activity-error-text">Error: {error}</p>
          </div>
        ) : actions.length === 0 ? (
          <div className="activity-empty">
            <p className="activity-empty-text">No activity found for this user</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Token</th>
                  <th>Amount</th>
                  <th>Fee</th>
                  <th>Time</th>
                  <th>Block</th>
                  <th>Tx Hash</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action, index) => {
                  const style = getActionStyle(action.type);
                  return (
                    <tr key={`${action.transactionHash}-${action.logIndex}`}>
                      <td>
                        <div className={`activity-action-cell activity-action-${action.type}`}>
                          <span>{style.emoji}</span>
                          <span>
                            {action.type === 'fee_proposal' ? 'Fee Proposal' :
                             action.type === 'fee_execution' ? 'Fee Execution' :
                             action.type === 'fee_collection' ? 'Fee Collection' :
                             action.type}
                          </span>
                          {action.type === 'vote' && action.feeSelection && (
                            <span className="activity-vote-details">
                              {`${(action.feeSelection / 100).toFixed(2)}%`}
                            </span>
                          )}
                          {action.type === 'fee_proposal' && action.proposedFee !== undefined && (
                            <span className="activity-vote-details">
                              {`${(action.proposedFee / 100).toFixed(2)}%`}
                            </span>
                          )}
                          {action.type === 'fee_execution' && action.oldFee !== undefined && action.newFee !== undefined && (
                            <span className="activity-vote-details">
                              {`${(action.oldFee / 100).toFixed(2)}% → ${(action.newFee / 100).toFixed(2)}%`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="asset-cell">
                          <div className="sym">
                            {tokenMetadata.get(action.token)?.symbol || 'Unknown'}
                          </div>
                        </div>
                      </td>
                      <td>
                        {action.amount ? formatAmount(action.amount, action.token) : '-'}
                      </td>
                      <td>
                        {action.fee ? formatAmount(action.fee, action.token) : '-'}
                      </td>
                      <td className="activity-time-cell">
                        {formatTime(action.timestamp)}
                      </td>
                      <td className="activity-block-cell">
                        {action.blockNumber.toLocaleString()}
                      </td>
                      <td>
                        <a 
                          href={`https://etherscan.io/tx/${action.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="activity-tx-link"
                        >
                          {action.transactionHash.slice(0, 8)}...{action.transactionHash.slice(-6)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {actions.length > 0 && (
          <div className="activity-footer">
            <p>Total activity records: {actions.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
