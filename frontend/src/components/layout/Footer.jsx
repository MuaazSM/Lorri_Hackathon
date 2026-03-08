import { useNavigate } from 'react-router-dom'
import FoxMascot from '@/components/FoxMascot'

export default function Footer() {
  const nav = useNavigate()

  return (
    <footer style={{ borderTop: '1px solid var(--border)', position: 'relative', zIndex: 1 }}>
      <div style={{ padding: '1.5rem 3rem 0.2rem', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '3rem' }}>

        {/* Brand */}
        <div>
          <div className="footer-brand">
              <div style={{ width:30, height:20, flexShrink:0, transform:'scale(0.6)', transformOrigin:'left top' }}>
                <FoxMascot size="sm" variant="idle" />
              </div>
              Lorri
            </div>
            <p className="footer-desc">
              <p>Lorri ⮕ Logistics Optimization through Reasoning, Routing & Intelligence.</p>
              <p>AI powered load consolidation. Fewer trucks, lower costs, less carbon optimized in seconds using OR Tools and LangGraph.</p>
            </p>
          </div>

        {/* Product */}
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '1.1rem' }}>Product</div>
          {[['Shipment', '/shipments'], ['Optimizer', '/optimize'], ['Scenarios', '/scenarios'], ['AI Insights', '/insights']].map(([l, t]) => (
            <span key={l} onClick={() => nav(t)} style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.55rem', cursor: 'pointer', transition: 'all 0.2s ease', width: 'fit-content' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--page-accent)'; e.currentTarget.style.transform = 'translateX(3px)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'translateX(0)' }}
            >{l}</span>
          ))}
        </div>

        {/* Stack */}
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '1.1rem' }}>Stack</div>
          {[
            ['Recharts',         'Side by side before/after charts for cost, CO₂ and truck utilisation'],
            ['SQLite / PG',      'Persists every shipment batch, solver result and scenario run for comparison'],              
            ['scikit learn',     'Clusters shipments by origin, destination & time window before the solver runs'], 
            ['OR Tools MIP',     "Google's MIP solver assigns shipments to trucks while minimising cost & trips"],
            ['Leaflet Maps',     'Interactive map showing consolidated routes as colour coded arcs between cities'],
            ['LangGraph Agents', '4 chained AI agents that validate, explain, relax constraints & recommend plans'],
          ].map(([t, tip]) => (
            <div key={t} style={{ position: 'relative', display: 'block', width: 'fit-content', marginBottom: '0.55rem' }}
              onMouseEnter={e => {
                const box = e.currentTarget.querySelector('.ft-tip')
                const rect = e.currentTarget.getBoundingClientRect()
                box.style.top = (rect.top + rect.height / 2 - 20) + 'px'
                box.style.left = Math.min(rect.right + 12, window.innerWidth - 215) + 'px'
                box.style.opacity = '1'
                box.style.visibility = 'visible'
              }}
              onMouseLeave={e => {
                const box = e.currentTarget.querySelector('.ft-tip')
                box.style.opacity = '0'
                box.style.visibility = 'hidden'
              }}
            >
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'default', transition: 'color 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--page-accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >{t}</span>
              <div className="ft-tip" style={{
                position: 'fixed', opacity: 0, visibility: 'hidden',
                background: 'rgba(10,10,10,0.92)', border: '1px solid rgba(var(--page-glow-rgb),0.45)',
                color: 'var(--page-accent)', fontSize: '0.68rem', fontFamily: 'JetBrains Mono',
                letterSpacing: '0.08em', padding: '5px 12px', borderRadius: 8,
                width: 200, textAlign: 'center', lineHeight: 1.5, pointerEvents: 'none',
                boxShadow: '0 0 16px rgba(var(--page-glow-rgb),0.25)', zIndex: 9999,
                transition: 'opacity 0.2s ease',
              }}>{tip}</div>
            </div>
          ))}
        </div>

        {/* Team */}
        <div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '1.1rem' }}>Team</div>
          {[

            ['Muaaz       AI & Backend',  'https://github.com/MuaazSM'],
            ['Manikya    Frontend',    'https://github.com/manikyarathore'],
            ['Aditya R    OR Engine',  'https://github.com/aditya-rajkumar'],
            ['Vaishnavi  OR Engine', 'https://github.com/vaishp1005']
          ].map(([name, url]) => (
            <a 
              key={name} 
              href={url} 
              target="_blank" 
              rel="noreferrer" 
              style={{ 
                display: 'block', 
                fontSize: '0.82rem', 
                color: 'var(--text-muted)', 
                marginBottom: '0.55rem', 
                textDecoration: 'none', 
                transition: 'all 0.2s ease', 
                width: 'fit-content',
                whiteSpace: 'pre' // <--- ADD THIS LINE
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--page-accent)'; e.currentTarget.style.transform = 'translateX(3px)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.transform = 'translateX(0)' }}
            >{name}</a>
          ))}
        </div>

      </div>

      {/* Bottom bar */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '1.2rem 3rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
          © 2025 Lorri · Load Consolidation Intelligence · Hackathon Build
        </span>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {[['Privacy', null], ['Terms', null], ['GitHub', 'https://github.com/MuaazSM/Lorri_Hackathon']].map(([l, href]) =>
            href
              ? <a key={l} href={href} target="_blank" rel="noreferrer" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', transition: 'color 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--page-accent)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>{l}</a>
              : <span key={l} style={{ fontSize: '0.72rem', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--page-accent)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>{l}</span>
          )}
        </div>
      </div>
    </footer>
  )
}