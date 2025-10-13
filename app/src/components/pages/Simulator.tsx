import React, { useState } from 'react';

type Results = {
  day: number;
  week: number;
  month: number;
  threeMonths: number;
  sixMonths: number;
  year: number;
} | null;

const toFixed = (val: number) => Number.isFinite(val) ? Number(val.toFixed(6)) : 0;

// Default management fee is 1% of LP fee (as per protocol defaults)
const DEFAULT_MANAGEMENT_FEE_OF_LP = 0.01; // 1% of the LP fee

const Simulator: React.FC = () => {
  const [totalPool, setTotalPool] = useState<number>(1000);
  const [deposited, setDeposited] = useState<number>(100);
  const [amountLentPerDay, setAmountLentPerDay] = useState<number>(0);
  const [feePercent, setFeePercent] = useState<number>(0.01); // percent, 0.01 - 5
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [results, setResults] = useState<Results>(null);
  const [error, setError] = useState<string>("");

  const calculate = () => {
    setError("");
    setResults(null);

    // Basic validation
    if (totalPool <= 0) {
      setError('Total pool amount must be greater than 0');
      return;
    }
    if (deposited < 0 || amountLentPerDay < 0) {
      setError('Inputs cannot be negative');
      return;
    }
    if (deposited > totalPool) {
      setError('Deposited amount cannot exceed total pool amount');
      return;
    }
    if (feePercent < 0.01 || feePercent > 5) {
      setError('Fee percent must be between 0.01% and 5%');
      return;
    }

  const feeRate = feePercent / 100; // convert % to fraction
  const dailyFees = amountLentPerDay * feeRate; // total pool fees per day (before management fee)
  // Apply default management fee: a percentage of the LP fee
  const managementCut = dailyFees * DEFAULT_MANAGEMENT_FEE_OF_LP;
  const lpDistributableFees = dailyFees - managementCut;
    const userShare = totalPool > 0 ? deposited / totalPool : 0;
    const dailyEarnings = lpDistributableFees * userShare;
    // Derive a daily rate based on current deposit and first-day earnings
    const rawDailyRate = deposited > 0 ? (dailyEarnings / deposited) : 0;
    const dailyRate = Number.isFinite(rawDailyRate) && rawDailyRate > -1 ? rawDailyRate : 0; // guard

    const compoundEarnings = (days: number) => {
      if (dailyRate === 0 || deposited === 0) return 0;
      const growth = Math.pow(1 + dailyRate, days) - 1;
      return deposited * growth;
    };

    const res: Results = {
      day: toFixed(compoundEarnings(1)),
      week: toFixed(compoundEarnings(7)),
      month: toFixed(compoundEarnings(30)),
      threeMonths: toFixed(compoundEarnings(90)),
      sixMonths: toFixed(compoundEarnings(180)),
      year: toFixed(compoundEarnings(365))
    };

    setResults(res);
  };

  // Helper to render results table (always visible, with empty state)
  const renderResultsTable = () => {
    const apyPercent = results && deposited > 0 ? (results.year / deposited) * 100 : 0;
    const apyDisplay = `${toFixed(apyPercent)}%`;
    
    const rows = [
      { label: '1 day', value: results?.day ?? '-' },
      { label: '1 week', value: results?.week ?? '-' },
      { label: '1 month (30d)', value: results?.month ?? '-' },
      { label: '3 months (90d)', value: results?.threeMonths ?? '-' },
      { label: '6 months (180d)', value: results?.sixMonths ?? '-' },
      { label: '1 year (365d)', value: results?.year ?? '-' }
    ];

    return (
      <div>
        <h3 className="margin-0">Projected earnings</h3>
        <p className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
          Daily compounding projection. Applies default management fee (1% of LP fee).
        </p>
        <div className="table-responsive" style={{ marginTop: 12 }}>
          <table className="table compact">
            <thead>
              <tr>
                <th>Period</th>
                <th>{tokenSymbol ? `${tokenSymbol} earned` : 'Tokens earned'}</th>
                <th>APY</th>
                <th>ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const roiPercent = results && deposited > 0 && typeof row.value === 'number'
                  ? `${toFixed((row.value / deposited) * 100)}%`
                  : '-';
                return (
                  <tr key={idx}>
                    <td>{row.label}</td>
                    <td>{row.value}</td>
                    <td>{results ? apyDisplay : '-'}</td>
                    <td>{roiPercent}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="dash-container">
      <div className="card surface">
        <h1 className="center-justify-content margin-0" style={{ padding: '20px 24px 12px' }}>FlashLender Simulator</h1>

        <div className="card-body">
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            {/* Left: Form */}
            <div className="form-stack gap-16 form-narrow">
              <div className="form-field">
                <label>Token symbol (display only)</label>
                <input
                  type="text"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g. USDC, DAI, WETH"
                />
                <small>Shown next to the projected earnings.</small>
              </div>

              <div className="form-field">
                <label>Total pool amount</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={totalPool}
                  onChange={(e) => setTotalPool(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 1,000,000"
                />
                <small>Units: tokens (no decimals scaling applied)</small>
              </div>

              <div className="form-field">
                <label>Deposited amount</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={deposited}
                  onChange={(e) => setDeposited(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 10,000"
                />
              </div>

              <div className="form-field">
                <label>Amount lent per day</label>
                <input
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={amountLentPerDay}
                  onChange={(e) => setAmountLentPerDay(parseFloat(e.target.value) || 0)}
                  placeholder="e.g. 500,000"
                />
                <small>Aggregate daily loan volume across the pool</small>
              </div>

              <div className="form-field">
                <label>Pool fee %: {feePercent.toFixed(2)}%</label>
                <input
                  type="range"
                  min={0.01}
                  max={5}
                  step={0.01}
                  value={feePercent}
                  onChange={(e) => setFeePercent(parseFloat(e.target.value) || 0.01)}
                />
                <small>Between 0.01% and 5.00%</small>
              </div>
              
              <button className="btn primary" onClick={calculate}>Calculate</button>

              {error && (
                <div className="alert error">{error}</div>
              )}
            </div>

            {/* Right: Results table (always visible) */}
            <div style={{ flex: 1 }}>
              {renderResultsTable()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Simulator;
