import React from 'react';

export interface ModalLoadingProps {
  title?: string;
  message?: string;
  details?: string;
}

export default function ModalLoading({
  title = 'Loading...',
  message,
  details
}: ModalLoadingProps) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '200px',
      flexDirection: 'column',
      textAlign: 'center'
    }}>
      <div style={{ marginBottom: '24px' }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '4px solid var(--border-color, #e5e7eb)',
          borderTop: '4px solid var(--primary-color, #3b82f6)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 24px auto'
        }}></div>
        <h4 style={{ margin: '0 0 8px 0', fontSize: '1.125rem' }}>
          {title}
        </h4>
        {message && (
          <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary, #6b7280)' }}>
            {message}
          </p>
        )}
        {details && (
          <div style={{ margin: '0 0 16px 0', fontSize: '0.875rem', color: 'var(--text-secondary, #6b7280)' }}>
            {details}
          </div>
        )}
        <div style={{
          display: 'inline-flex',
          gap: '4px'
        }}>
          <span style={{ 
            animation: 'pulse 1.5s ease-in-out infinite',
            color: 'var(--primary-color, #3b82f6)',
            fontSize: '24px'
          }}>.</span>
          <span style={{ 
            animation: 'pulse 1.5s ease-in-out infinite 0.2s',
            color: 'var(--primary-color, #3b82f6)',
            fontSize: '24px'
          }}>.</span>
          <span style={{ 
            animation: 'pulse 1.5s ease-in-out infinite 0.4s',
            color: 'var(--primary-color, #3b82f6)',
            fontSize: '24px'
          }}>.</span>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 80%, 100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          40% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
