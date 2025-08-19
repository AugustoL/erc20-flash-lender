import React from 'react';
import { ethers } from 'ethers';

interface TokenIconProps {
  address: string;
  symbol: string;
  logoUrl?: string;
  className?: string;
}

const TokenIcon = React.memo<TokenIconProps>(({
  address,
  symbol,
  logoUrl,
  className = 'token-icon'
}) => {
  const getTokenIconUrl = (tokenAddress: string): string => {
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${ethers.getAddress(tokenAddress)}/logo.png`;
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
    // Show the fallback avatar with symbol
    const fallback = img.nextElementSibling as HTMLElement;
    if (fallback) {
      fallback.style.display = 'flex';
    }
  };

  const imageUrl = logoUrl || getTokenIconUrl(address);

  return (
    <div className="token-avatar">
      <img 
        src={imageUrl}
        alt={`${symbol} logo`}
        className={className}
        onError={handleImageError}
      />
      <div className="avatar pool-avatar-fallback" style={{ display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
        {symbol.slice(0, 3).toUpperCase()}
      </div>
    </div>
  );
});

TokenIcon.displayName = 'TokenIcon';

export default TokenIcon;