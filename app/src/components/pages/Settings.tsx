import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '../../context/SettingsContext';
import { UserSettings } from '../../types';

export default function Settings() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState<UserSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
    setHasChanges(false);
  }, [settings]);

  // Check for changes
  useEffect(() => {
    const changed = localSettings.apyCalculationBlocks !== settings.apyCalculationBlocks ||
                   localSettings.theme !== settings.theme;
    setHasChanges(changed);
  }, [localSettings, settings]);

  const handleSave = () => {
    updateSettings(localSettings);
    setHasChanges(false);
    setSaveMessage('Settings saved successfully!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleReset = () => {
    resetSettings();
    setSaveMessage('Settings reset to defaults!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleApyBlocksChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setLocalSettings(prev => ({ ...prev, apyCalculationBlocks: numValue }));
    }
  };

  // Convert blocks to approximate time for user reference
  const getApproximateTime = (blocks: number) => {
    const minutes = Math.round((blocks * 12) / 60); // 12 second blocks
    if (minutes < 60) return `~${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `~${hours} hours`;
    const days = Math.round(hours / 24);
    return `~${days} days`;
  };

  return (
    <div className="dash-container">
      <div className="card surface">
        <div className="card-head">
          <h3>Settings</h3>
        </div>
        <div className="padding-standard">
          <div className="setting-item">
            <label className="setting-label">
              Theme Preference
            </label>
            <div className="setting-control">
              <div className="theme-options">
                <button
                  className={`theme-option ${localSettings.theme === 'auto' ? 'active' : ''}`}
                  onClick={() => setLocalSettings(prev => ({ ...prev, theme: 'auto' }))}
                >
                  <span className="theme-icon">🌗</span>
                  Auto
                  <span className="theme-detail">Follow system</span>
                </button>
                <button
                  className={`theme-option ${localSettings.theme === 'light' ? 'active' : ''}`}
                  onClick={() => setLocalSettings(prev => ({ ...prev, theme: 'light' }))}
                >
                  <span className="theme-icon">☀️</span>
                  Light
                  <span className="theme-detail">Always light</span>
                </button>
                <button
                  className={`theme-option ${localSettings.theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setLocalSettings(prev => ({ ...prev, theme: 'dark' }))}
                >
                  <span className="theme-icon">🌙</span>
                  Dark
                  <span className="theme-detail">Always dark</span>
                </button>
              </div>
            </div>
          </div>

          <div className="setting-item">
            <label htmlFor="apy-blocks" className="setting-label">
              APY Calculation Historical Period (Blocks)
            </label>
            <div className="setting-control">
              <input
                id="apy-blocks"
                type="number"
                min="100"
                max="100000"
                step="100"
                value={localSettings.apyCalculationBlocks}
                onChange={(e) => handleApyBlocksChange(e.target.value)}
                className="number-input"
              />
              <div className="setting-help">
                {getApproximateTime(localSettings.apyCalculationBlocks)} of flash loan activity
              </div>
            </div>
          </div>
          
          <div className="setting-description">
            <p>
              APY is calculated based on recent flash loan activity. More blocks provide 
              a longer historical view but may be less representative of current rates.
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="settings-section">
            <h5>Quick Presets</h5>
            <div className="preset-buttons">
              <button 
                className={`preset-btn ${localSettings.apyCalculationBlocks === 1000 ? 'active' : ''}`}
                onClick={() => setLocalSettings(prev => ({ ...prev, apyCalculationBlocks: 1000 }))}
              >
                Short Term
                <span className="preset-detail">1000 blocks (~3 hours)</span>
              </button>
              <button 
                className={`preset-btn ${localSettings.apyCalculationBlocks === 10000 ? 'active' : ''}`}
                onClick={() => setLocalSettings(prev => ({ ...prev, apyCalculationBlocks: 10000 }))}
              >
                Medium Term
                <span className="preset-detail">10000 blocks (~1.4 days)</span>
              </button>
              <button 
                className={`preset-btn ${localSettings.apyCalculationBlocks === 50000 ? 'active' : ''}`}
                onClick={() => setLocalSettings(prev => ({ ...prev, apyCalculationBlocks: 50000 }))}
              >
                Long Term
                <span className="preset-detail">50000 blocks (~1 week)</span>
              </button>
            </div>
          </div>

          <div className="recommendation-box">
            <h6>💡 Recommendations</h6>
            <ul>
              <li><strong>Short Term (1000 blocks):</strong> Best for active pools with frequent flash loans</li>
              <li><strong>Medium Term (10000 blocks):</strong> Balanced view, smooths out short-term fluctuations</li>
              <li><strong>Long Term (50000 blocks):</strong> Long-term average, best for established pools</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="card surface">
        <div className="padding-standard">
          {saveMessage && (
            <div className="save-message success">
              ✅ {saveMessage}
            </div>
          )}
          <div className="settings-actions center">
            <button 
              className="btn-lg outline"
              onClick={handleReset}
            >
              Reset to Defaults
            </button>
            <button 
              className="btn-lg primary"
              onClick={handleSave}
              disabled={!hasChanges}
            >
              {hasChanges ? 'Save Changes' : 'No Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
