export default function QueuePanel({ queueAnalysis }) {
  if (!queueAnalysis) return null

  const { warehouses, congested_count, total_warehouses, recommendations } = queueAnalysis

  const LEVEL_COLORS = {
    LOW: '#6b7280',
    MODERATE: '#f59e0b',
    WARNING: '#ef4444',
    CRITICAL: '#dc2626',
  }

  return (
    <>
      <style>{`
        .queue-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
        }
        .queue-header {
          padding: 1.1rem 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .queue-header-label {
          font-size: 0.68rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .queue-body { padding: 1.25rem 1.5rem; }
        .queue-wh-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.6rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.78rem;
        }
        .queue-wh-row:last-child { border-bottom: none; }
        .queue-wh-name {
          font-weight: 600;
          min-width: 90px;
        }
        .queue-wh-rho {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          min-width: 60px;
        }
        .queue-wh-wait {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: var(--text-muted);
          min-width: 70px;
          text-align: right;
        }
        .queue-wh-level {
          font-size: 0.6rem;
          padding: 2px 7px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-left: auto;
        }
      `}</style>

      <div className="queue-card">
        <div className="queue-header">
          <span className="queue-header-label">/ warehouse queuing · M/M/1 analysis</span>
          <span style={{
            fontSize: '0.65rem',
            padding: '2px 8px',
            borderRadius: 5,
            fontFamily: "'JetBrains Mono',monospace",
            background: congested_count > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            border: `1px solid ${congested_count > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
            color: congested_count > 0 ? '#ef4444' : '#10b981',
          }}>
            {congested_count > 0 ? `${congested_count} congested` : `${total_warehouses} healthy`}
          </span>
        </div>

        <div className="queue-body">
          {warehouses?.map(wh => {
            const color = LEVEL_COLORS[wh.congestion_level] || '#6b7280'
            return (
              <div key={wh.warehouse} className="queue-wh-row">
                <span className="queue-wh-name" style={{ color: wh.congestion_level !== 'LOW' ? color : 'var(--text-primary)' }}>
                  {wh.warehouse}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: "'JetBrains Mono',monospace" }}>
                  {wh.shipment_count} shipments
                </span>
                <span className="queue-wh-rho" style={{ color }}>
                  ρ={wh.utilization_rho}
                </span>
                <span className="queue-wh-wait">
                  {wh.avg_wait_minutes != null ? `~${wh.avg_wait_minutes}m wait` : '∞'}
                </span>
                <span className="queue-wh-level"
                  style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}>
                  {wh.congestion_level}
                </span>
              </div>
            )
          })}

          {recommendations?.length > 0 && recommendations[0].type !== 'QUEUE_HEALTHY' && (
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              {recommendations.map((r, i) => (
                <div key={i} style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                  padding: '0.4rem 0',
                }}>
                  ⚠ {r.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}