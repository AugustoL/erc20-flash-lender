import React from 'react';
import { UserAction, PoolData } from '../../types';
import { useActionStyles, useTimestampFormatter, useTokenFormatter } from '../../hooks/usePoolData';

interface ActivityListProps {
  actions: UserAction[];
  poolData: PoolData;
  isConnected?: boolean;
  showUser?: boolean;
}

const ActivityItem = React.memo<{
  action: UserAction;
  poolData: PoolData;
  showUser?: boolean;
  getActionIcon: (type: string) => string;
  getActionColor: (type: string) => string;
  formatTimestamp: (timestamp: number) => string;
  formatAmount: (amount: string) => string;
}>(({ action, poolData, showUser, getActionIcon, getActionColor, formatTimestamp, formatAmount }) => {
  return (
    <div 
      className="activity-item"
      style={{'--action-color': getActionColor(action.type)} as React.CSSProperties}
    >
      <div className="activity-icon">{getActionIcon(action.type)}</div>
      <div className="activity-content">
        <div className="activity-type activity-type-colored">
          {action.type === 'flashloan' ? 'Flash Loan' : 
           action.type === 'fee_proposal' ? 'Fee Proposal' :
           action.type === 'fee_execution' ? 'Fee Execution' :
           action.type.charAt(0).toUpperCase() + action.type.slice(1)}
        </div>
        <div className="activity-details">
          {action.type === 'fee_proposal' && action.proposedFee !== undefined ? 
            `Proposed fee: ${(action.proposedFee / 100).toFixed(2)}%` :
           action.type === 'fee_execution' && action.oldFee !== undefined && action.newFee !== undefined ? 
            `Fee changed: ${(action.oldFee / 100).toFixed(2)}% → ${(action.newFee / 100).toFixed(2)}%` :
           action.type === 'vote' && action.feeSelection !== undefined ? 
            `Voted for ${(action.feeSelection / 100).toFixed(2)}% fee` :
           action.amount ? formatAmount(action.amount) : 
           'Activity'}
          {action.fee && ` (Fee: ${formatAmount(action.fee)})`}
          {action.feeSelection && ` (Vote: ${(action.feeSelection / 100).toFixed(2)}%)`}
        </div>
        <div className={showUser ? "activity-user" : "activity-timestamp"}>
          {showUser ? 
            `${action.user.slice(0, 6)}...${action.user.slice(-4)} • ${formatTimestamp(action.timestamp)}` :
            formatTimestamp(action.timestamp)
          }
        </div>
      </div>
      <a 
        href={`https://etherscan.io/tx/${action.transactionHash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="activity-link"
      >
        View →
      </a>
    </div>
  );
});

ActivityItem.displayName = 'ActivityItem';

const ActivityList = React.memo<ActivityListProps>(({ 
  actions, 
  poolData, 
  isConnected = true, 
  showUser = false 
}) => {
  const { getActionIcon, getActionColor } = useActionStyles();
  const { formatTimestamp } = useTimestampFormatter();
  const { formatAmount } = useTokenFormatter(poolData.decimals, poolData.symbol);

  if (!isConnected && !showUser) {
    return (
      <div className="center-content text-secondary">
        Connect your wallet to view your activity
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="center-content text-secondary">
        No recent activity found
      </div>
    );
  }

  return (
    <div className="activity-list">
      {actions.map((action, index) => (
        <ActivityItem
          key={`${action.transactionHash}-${action.logIndex}`}
          action={action}
          poolData={poolData}
          showUser={showUser}
          getActionIcon={getActionIcon}
          getActionColor={getActionColor}
          formatTimestamp={formatTimestamp}
          formatAmount={formatAmount}
        />
      ))}
    </div>
  );
});

ActivityList.displayName = 'ActivityList';

export default ActivityList;