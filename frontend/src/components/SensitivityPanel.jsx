export default function SensitivityPanel({ sensitivity }) {
  if (!sensitivity) return null

  const { constraint_slack, fleet_shadow_price, capacity_shadow_price, bottleneck, recommendations } = sensitivity

  const PRIORITY_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6b7280' }

  return (
    <>
      <style>{`
        .sens-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
        }
        .sens-header {
          padding: 1.1rem 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sens-header-label {
          font-size: 0.68rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .sens-body { padding: 1.25rem 1.5rem; }
        .sens-summary-row { display: flex; gap: 1rem; margin-bottom: 1.25rem; }
        .sens-summary-cell {
          flex: 1;
          background: rgba(var(--page-glow-rgb), 0.06);
          border: 1px solid rgba(var(--page-glow-rgb), 0.15);
          border-radius: 12px;
          padding: 0.85rem 1rem;
        }
        .sens-summary-val {
          font-family: 'Syne', sans-serif;
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--page-accent);
          line-height: 1;
        }
        .sens-summary-lbl {
          font-size: 0.62rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 4px;
        }
        .sens-rec {
          padding: 0.7rem 1rem;
          border-radius: 10px;
          margin-bottom: 0.5rem;
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.6;
          display: flex;
          align-items: flex-start;
          gap: 0.6rem;
        }
        .sens-rec-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 6px;
        }
        .sens-constraint-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.75rem;
        }
        .sens-constraint-row:last-child { border-bottom: none; }
      `}</style>

      <div className="sens-card">
        <div className="sens-header">
          <span className="sens-header-label">/ sensitivity analysis · shadow prices</span>
          {bottleneck && (
            <span style={{
              fontSize: '0.65rem',
              padding: '2px 8px',
              borderRadius: 5,
              fontFamily: "'JetBrains Mono',monospace",
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444',
            }}>
              Bottleneck: {bottleneck.vehicle_id}
            </span>
          )}
        </div>

        <div className="sens-body">
          <div className="sens-summary-row">
            <div className="sens-summary-cell">
              <div className="sens-summary-val">
                {sensitivity.binding_count}/{sensitivity.total_trucks}
              </div>
              <div className="sens-summary-lbl">Binding constraints</div>
            </div>
            <div className="sens-summary-cell">
              <div className="sens-summary-val">
                ₹{(fleet_shadow_price?.shadow_price ?? 0).toLocaleString()}
              </div>
              <div className="sens-summary-lbl">Fleet shadow price</div>
            </div>
            <div className="sens-summary-cell">
              <div className="sens-summary-val">
                {fleet_shadow_price?.improvement_pct ?? 0}%
              </div>
              <div className="sens-summary-lbl">Potential improvement</div>
            </div>
          </div>

          {/* Constraint slack per truck */}
          {constraint_slack?.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{
                fontSize: '0.65rem',
                fontFamily: "'JetBrains Mono',monospace",
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '0.5rem',
              }}>
                Constraint utilization per truck
              </div>
              {constraint_slack.map(t => (
                <div key={t.vehicle_id} className="sens-constraint-row">
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontWeight: 700,
                    color: t.weight_binding ? '#ef4444' : 'var(--page-accent)',
                    minWidth: 60,
                  }}>
                    {t.vehicle_id}
                  </span>
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>
                    {t.weight_utilization_pct}% weight
                    {t.weight_binding && (
                      <span style={{ color: '#ef4444', marginLeft: 6, fontSize: '0.65rem' }}>● BINDING</span>
                    )}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: "'JetBrains Mono',monospace" }}>
                    slack: {t.weight_slack_kg}kg
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {recommendations?.length > 0 && (
            <div>
              <div style={{
                fontSize: '0.65rem',
                fontFamily: "'JetBrains Mono',monospace",
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '0.5rem',
              }}>
                Recommendations
              </div>
              {recommendations.map((r, i) => (
                <div key={i} className="sens-rec"
                  style={{ background: `${PRIORITY_COLORS[r.priority]}08`, border: `1px solid ${PRIORITY_COLORS[r.priority]}20` }}>
                  <div className="sens-rec-dot" style={{ background: PRIORITY_COLORS[r.priority], boxShadow: `0 0 6px ${PRIORITY_COLORS[r.priority]}` }} />
                  <span>{r.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}