import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { Link } from 'react-router-dom';
import { formatUnits } from 'viem';

interface TokenPoolRow {
  address: string;
  symbol: string;
  name: string;
  tvl: string;
  loans: number; // placeholder until on-chain stat exists
  volume: string; // placeholder
  lpFeeBps?: string;
}

// Temporary demo data until integrated with contract reader hook
const demoData: TokenPoolRow[] = [
  { address: '0xToken1', symbol: 'DAI', name: 'Dai Stablecoin', tvl: '523451.23', loans: 182, volume: '9.2M', lpFeeBps: '1' },
  { address: '0xToken2', symbol: 'USDC', name: 'USD Coin', tvl: '812345.77', loans: 95, volume: '4.7M', lpFeeBps: '1' },
];

export default function Dashboard() {
  const { address } = useAccount();
  const [rows, setRows] = useState<TokenPoolRow[]>(demoData);

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head"><h3>Token Pools</h3></div>
        <div className="table-wrapper">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>TVL</th>
                <th>Loans</th>
                <th>Loan Volume</th>
                <th>LP Fee (bps)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.address}>
                  <td>
                    <div className="asset-cell">
                      <div className="avatar" />
                      <div>
                        <div className="sym">
                          <Link 
                            to={`/pool/${r.address}`}
                            className="token-link"
                          >
                            {r.symbol}
                          </Link>
                        </div>
                        <div className="nm">{r.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>{r.tvl}</td>
                  <td>{r.loans}</td>
                  <td>{r.volume}</td>
                  <td>{r.lpFeeBps}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-xs primary">Deposit</button>
                      <button className="btn-xs success" disabled={!address}>Withdraw</button>
                      <button className="btn-xs outline" disabled={!address}>Vote fee</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
