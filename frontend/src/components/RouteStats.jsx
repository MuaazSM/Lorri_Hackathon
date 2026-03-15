export default function RouteStats({ routeStats, trucks }) {
  if (!routeStats) return null

  const saved = routeStats.total_savings_km
  const pct = routeStats.total_savings_pct

  return (
    <>
      <style>{`
        .route-stats-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
        }
        .route-stats-header {
          padding: 1.1rem 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .route-stats-header-label {
          font-size: 0.68rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .route-stats-body { padding: 1.25rem 1.5rem; }
        .route-summary-row {
          display: flex;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .route-summary-cell {
          flex: 1;
          background: rgba(var(--page-glow-rgb), 0.06);
          border: 1px solid rgba(var(--page-glow-rgb), 0.15);
          border-radius: 12px;
          padding: 0.85rem 1rem;
        }
        .route-summary-val {
          font-family: 'Syne', sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          color: var(--page-accent);
          line-height: 1;
        }
        .route-summary-lbl {
          font-size: 0.62rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 4px;
        }
        .route-truck-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.78rem;
        }
        .route-truck-row:last-child { border-bottom: none; }
        .route-truck-id {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          color: var(--page-accent);
          min-width: 60px;
        }
        .route-truck-seq {
          flex: 1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: var(--text-secondary);
        }
        .route-truck-dist {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: var(--text-muted);
          text-align: right;
          min-width: 80px;
        }
        .route-truck-save {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.72rem;
          color: #10b981;
          text-align: right;
          min-width: 70px;
        }
      `}</style>

      <div className="route-stats-card">
        <div className="route-stats-header">
          <span className="route-stats-header-label">/ route optimization · TSP per truck</span>
          <span style={{
            fontSize: '0.65rem',
            padding: '2px 8px',
            borderRadius: 5,
            fontFamily: "'JetBrains Mono',monospace",
            background: 'rgba(16,185,129,0.1)',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#10b981',
          }}>
            {pct > 0 ? `-${pct}%` : 'Optimized'}
          </span>
        </div>

        <div className="route-stats-body">
          <div className="route-summary-row">
            <div className="route-summary-cell">
              <div className="route-summary-val">{routeStats.total_naive_distance_km?.toLocaleString()} km</div>
              <div className="route-summary-lbl">Before (naive order)</div>
            </div>
            <div className="route-summary-cell">
              <div className="route-summary-val">{routeStats.total_optimized_distance_km?.toLocaleString()} km</div>
              <div className="route-summary-lbl">After (TSP optimized)</div>
            </div>
            <div className="route-summary-cell">
              <div className="route-summary-val" style={{ color: '#10b981' }}>
                {saved > 0 ? `-${saved.toLocaleString()} km` : '0 km'}
              </div>
              <div className="route-summary-lbl">Distance saved</div>
            </div>
          </div>

          {trucks?.length > 0 && (
            <div>
              <div style={{
                fontSize: '0.65rem',
                fontFamily: "'JetBrains Mono',monospace",
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '0.6rem',
              }}>
                Per-truck stop sequence
              </div>
              {trucks.filter(t => t.stop_sequence?.length > 0).map(t => (
                <div key={t.vehicle_id} className="route-truck-row">
                  <span className="route-truck-id">{t.vehicle_id}</span>
                  <span className="route-truck-seq">
                    {t.stop_sequence.join(' → ')}
                  </span>
                  <span className="route-truck-dist">{t.optimized_route_km} km</span>
                  <span className="route-truck-save">
                    {t.route_savings_km > 0 ? `-${t.route_savings_km} km` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}