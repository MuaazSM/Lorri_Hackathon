import { useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import FoxMascot from '@/components/FoxMascot'
import { Zap } from 'lucide-react'
import { DEMO_METRICS } from '@/data/demoData'
import PageShell from '@/components/layout/PageShell'

/* ── Animated counter hook ── */
function useCounter(target, duration = 1800, start = false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime = null
    const step = (ts) => {
      if (!startTime) startTime = ts
      const p = Math.min((ts - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.floor(ease * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [start, target, duration])
  return val
}

const STATS = [
  { label: 'Trips Reduced',  raw: DEMO_METRICS.savings.trips_reduced,    suffix: '',   prefix: '' },
  { label: 'Cost Saved',     raw: DEMO_METRICS.savings.cost_saved / 1000, suffix: 'k', prefix: '₹' },
  { label: 'CO₂ Saved',      raw: DEMO_METRICS.savings.carbon_saved_kg,   suffix: 'kg', prefix: '' },
  { label: 'Avg Utilization',raw: DEMO_METRICS.after.avg_utilization,     suffix: '%',  prefix: '' },
]

const FEATURE_ICONS = [
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--page-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--page-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M9 13v2a3 3 0 0 0 6 0v-2"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="12" y1="19" x2="12" y2="21"/><path d="M7 8a5 5 0 0 1 5-5"/><path d="M12 3a5 5 0 0 1 5 5"/></svg>,
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--page-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--page-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>,
]

const FEATURES = [
  {
    num: '01',
    tag: 'Engine',
    title: 'OR Tools MIP Solver',
    desc: 'Binary decision variables assign each shipment to exactly one truck. The solver minimises total trips while maximising utilisation constrained by weight, volume, time windows and compatibility.',
    bullets: ['Weight & volume capacity', 'Time window feasibility', 'Heuristic fallback >50 shipments'],
    to: '/optimize',
  },
  {
    num: '02',
    tag: 'Intelligence',
    title: 'Four Agent LangGraph Pipeline',
    desc: 'An agentic decision loop validates inputs, explains outputs in plain language, relaxes blocking constraints, and recommends the best plan across all scenarios.',
    bullets: ['Validation before solve', 'Human readable insights', 'Constraint relaxation suggestions'],
    to: '/insights',
  },
  {
    num: '03',
    tag: 'Scenarios',
    title: 'What If Scenario Engine',
    desc: 'Run the same batch under four different business conditions strict SLAs, flexible windows, reduced fleet, or demand surge and compare cost, carbon, and utilisation side by side.',
    bullets: ['Strict vs Flexible SLA', 'Vehicle Shortage mode', 'Demand Surge simulation'],
    to: '/scenarios',
  },
  {
    num: '04',
    tag: 'Visibility',
    title: 'Live Route Map',
    desc: 'Every origin destination pair visualised on an interactive Leaflet map. Routes colour coded by consolidation group, clickable for full shipment details.',
    bullets: ['Mumbai · Pune · Delhi lanes', 'Colour coded groups', 'Click for shipment drawer'],
    to: '/shipments',
  },
]

/* ─────────────────────────────────────────────────────────────
   FIX 1: All globe-related constants and HomeGlobeMap MOVED
   OUTSIDE the Home component. When they were defined inside,
   every state change (e.g. statsVisible flipping to true) caused
   React to see HomeGlobeMap as a brand-new component type and
   fully unmount + remount it — re-importing globe.gl and
   rebuilding the THREE.js scene on every render.
───────────────────────────────────────────────────────────── */
const HOME_ARCS = [
  { startLat:19.076,  startLng:72.8777, endLat:18.5204, endLng:73.8567, color:'#f59e0b', label:'G1 · V001 · Mumbai→Pune' },
  { startLat:18.5204, startLng:73.8567, endLat:28.6139, endLng:77.209,  color:'#10b981', label:'G2 · V004 · Pune→Delhi'  },
  { startLat:19.076,  startLng:72.8777, endLat:28.6139, endLng:77.209,  color:'#06b6d4', label:'G3 · V003 · Mumbai→Delhi' },
]
const HOME_CITIES = {
  Mumbai: { lat:19.076,  lng:72.8777, color:'#f59e0b' },
  Pune:   { lat:18.5204, lng:73.8567, color:'#10b981' },
  Delhi:  { lat:28.6139, lng:77.209,  color:'#06b6d4' },
}
function homeHexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

function HomeGlobeMap() {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    // Delay globe init until hero blur animations have finished (~700ms)
    // so WebGL context creation doesn't compete with CSS blur on the GPU
    const timer = setTimeout(() => {
    import('globe.gl').then(({ default: Globe }) => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = ''
      const cityPoints = Object.entries(HOME_CITIES).map(([name, c]) => ({ name, ...c }))
      const g = Globe({ animateIn: true })(containerRef.current)
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
        .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
        .width(containerRef.current.offsetWidth || 500)
        .height(220)
        .pointOfView({ lat:22, lng:78, altitude:1.8 }, 0)
        .arcsData(HOME_ARCS)
        .arcStartLat(d=>d.startLat).arcStartLng(d=>d.startLng)
        .arcEndLat(d=>d.endLat).arcEndLng(d=>d.endLng)
        .arcColor(d=>[d.color,d.color])
        .arcAltitude(0.25).arcStroke(1.2)
        .arcDashLength(0.4).arcDashGap(0.15).arcDashAnimateTime(2200)
        .pointsData(cityPoints)
        .pointLat(d=>d.lat).pointLng(d=>d.lng)
        .pointColor(d=>d.color).pointAltitude(0.01).pointRadius(0.5)
        .ringsData(cityPoints)
        .ringLat(d=>d.lat).ringLng(d=>d.lng)
        .ringColor(d=>t=>`rgba(${homeHexToRgb(d.color)},${1-t})`)
        .ringMaxRadius(3).ringPropagationSpeed(1.5).ringRepeatPeriod(1500)
      g.controls().autoRotate = true
      g.controls().autoRotateSpeed = 0.5
      g.controls().enableZoom = false
      globeRef.current = g
    }).catch(()=>{})
    }, 800)
    return () => {
      cancelled = true
      clearTimeout(timer)
      // Clean up WebGL context to prevent memory leaks
      if (globeRef.current) {
        globeRef.current._destructor?.()
        globeRef.current = null
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, []) // empty — init once, never re-mount
  return <div ref={containerRef} style={{ width:'100%', height:'220px', background:'#060609', borderRadius:10 }} />
}

export default function Home() {
  const nav = useNavigate()
  const statsRef = useRef(null)
  const [statsVisible, setStatsVisible] = useState(false)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true) }, { threshold: 0.3 })
    if (statsRef.current) obs.observe(statsRef.current)
    return () => obs.disconnect()
  }, [])

  const c0 = useCounter(STATS[0].raw, 1400, statsVisible)
  const c1 = useCounter(STATS[1].raw, 1600, statsVisible)
  const c2 = useCounter(STATS[2].raw, 1800, statsVisible)
  const c3 = useCounter(STATS[3].raw, 1500, statsVisible)
  const counters = [c0, c1, c2, c3]

  return (
    <PageShell>
      <style>{`
      .hero-wrap { position: relative; }
      .features-wrap {
        padding: 0 3rem 5rem;
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .feature-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4rem;
        padding: 4rem 0;
        border-bottom: 1px solid var(--border);
        align-items: center;
      }
      .feature-row:last-child { border-bottom: none; }
      .feature-row.reverse .feature-text { order: 2; }
      .feature-row.reverse .feature-visual { order: 1; }
      .feature-num {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.68rem;
        color: var(--page-accent);
        letter-spacing: 0.12em;
        margin-bottom: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
      .feature-num::after {
        content: '';
        flex: 0 0 40px;
        height: 1px;
        background: var(--page-accent);
        opacity: 0.4;
      }
      .feature-tag {
        font-size: 0.68rem;
        padding: 2px 8px;
        border-radius: 5px;
        border: 1px solid rgba(var(--page-glow-rgb), 0.35);
        color: var(--page-accent);
        background: rgba(var(--page-glow-rgb), 0.1);
        font-family: 'JetBrains Mono', monospace;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        display: inline-block;
        margin-bottom: 1rem;
      }
      .feature-title {
        font-family: 'Syne', sans-serif;
        font-size: 2rem;
        font-weight: 800;
        line-height: 1.15;
        letter-spacing: -0.02em;
        margin-bottom: 1rem;
      }
      .feature-desc {
        font-size: 1rem;
        color: var(--text-secondary);
        line-height: 1.75;
        margin-bottom: 1.5rem;
      }
      .feature-bullets {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 1.8rem;
      }
      .feature-bullet {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 0.92rem;
        color: var(--text-muted);
      }
      .feature-bullet::before {
        content: '';
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--page-accent);
        flex-shrink: 0;
        box-shadow: 0 0 6px var(--page-accent);
      }
      .feature-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.72rem;
        font-weight: 600;
        color: var(--page-accent);
        cursor: pointer;
        padding: 5px 14px;
        border-radius: 9999px;
        border: 1px solid rgba(var(--page-glow-rgb), 0.45);
        background: rgba(var(--page-glow-rgb), 0.1);
        font-family: 'JetBrains Mono', monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        transition: all 0.3s ease;
      }
      .feature-link:hover {
        background: rgba(var(--page-glow-rgb), 0.28);
        border-color: var(--page-accent);
        box-shadow: 0 0 20px rgba(var(--page-glow-rgb), 0.45),
                    0 0 50px rgba(var(--page-glow-rgb), 0.15);
        transform: scale(1.05);
      }
      .feature-visual {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 2rem;
        min-height: 260px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
        transition: border-color 0.3s, box-shadow 0.3s;
      }
      .feature-row:hover .feature-visual {
        border-color: rgba(var(--page-glow-rgb), 0.4);
        box-shadow: 0 0 40px rgba(var(--page-glow-rgb), 0.1);
      }
      .feature-visual::before {
        content: '';
        position: absolute;
        top: -40%; right: -20%;
        width: 200px; height: 200px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(var(--page-glow-rgb), 0.2), transparent 70%);
        pointer-events: none;
      }
      .visual-label {
        font-size: 0.65rem;
        font-family: 'JetBrains Mono', monospace;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        margin-bottom: 1.2rem;
      }
      .visual-metric-row {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .visual-metric {
        flex: 1;
        background: rgba(var(--page-glow-rgb), 0.08);
        border: 1px solid rgba(var(--page-glow-rgb), 0.15);
        border-radius: 10px;
        padding: 0.75rem 1rem;
      }
      .visual-metric-val {
        font-family: 'Syne', sans-serif;
        font-size: 1.4rem;
        font-weight: 800;
        color: var(--page-accent);
        line-height: 1;
      }
      .visual-metric-lbl {
        font-size: 0.65rem;
        color: var(--text-muted);
        font-family: 'JetBrains Mono', monospace;
        margin-top: 3px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .visual-bar-wrap {
        background: rgba(255,255,255,0.05);
        border-radius: 9999px;
        height: 6px;
        overflow: hidden;
        margin-top: 0.5rem;
      }
      .visual-bar {
        height: 100%;
        border-radius: 9999px;
        background: linear-gradient(90deg, rgba(var(--page-glow-rgb),1), var(--page-accent));
      }
      .cta-section {
        border-top: 1px solid var(--border);
        position: relative;
        z-index: 1;
        overflow: hidden;
      }
      .cta-inner {
        padding: 6rem 3rem;
        text-align: center;
        position: relative;
      }
      .cta-glow {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 600px; height: 300px;
        border-radius: 50%;
        background: radial-gradient(ellipse, rgba(var(--page-glow-rgb), 0.25) 0%, transparent 70%);
        pointer-events: none;
      }
      .cta-h2 {
        font-family: 'Syne', sans-serif;
        font-size: clamp(2rem, 4vw, 3.5rem);
        font-weight: 800;
        letter-spacing: -0.025em;
        line-height: 1.1;
        margin-bottom: 1rem;
        position: relative;
      }
      .cta-sub {
        font-size: 1rem;
        color: var(--text-secondary);
        margin-bottom: 2.5rem;
        position: relative;
      }
      `}</style>

      {/* ════ HERO ════ */}
      <section className="home-section">
        <div className="hero-wrap">

          <div className="hero-tag">
            <Zap size={10} /> AI Powered Load Consolidation
          </div>

          <h1 className="hero-h1">
            <div className="blur-line">
              {['Ship', 'Less', 'Trucks.'].map((w, i) => (
                <span key={w} className="blur-word" style={{ animationDelay: `${0.12 + i * 0.09}s` }}>{w}</span>
              ))}
            </div>
            <div className="blur-line" style={{ color: 'var(--page-accent)' }}>
              {['Save', 'More.'].map((w, i) => (
                <span key={w} className="blur-word" style={{ animationDelay: `${0.4 + i * 0.11}s` }}>{w}</span>
              ))}
            </div>
          </h1>

          {/*
            FIX 2: Subtitle animated as a single element instead of 17
            individual <span> elements each with filter:blur(). The
            per-word approach created 17 simultaneous compositing layers.
          */}
          <p className="hero-sub" style={{
            opacity: 0,
            animation: 'fadeSlideUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.65s forwards'
          }}>
            Lorri uses OR Tools + LangGraph agents to consolidate your shipments cutting trips, costs, and carbon in seconds.
          </p>

          <div className="hero-cta-row">
            <button className="btn-primary" onClick={() => nav('/optimize')}>
              <Zap size={15} /> Run Optimizer
            </button>
            <button className="btn-outline" onClick={() => nav('/shipments')}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
              View Shipments
            </button>
          </div>

          <div className="scroll-hint">
            <span>Scroll</span>
            <div className="scroll-line" />
          </div>
        </div>
      </section>

      {/* ════ MARQUEE ════ */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {['Load Consolidation','Fewer Trucks','Lower Costs','Less Carbon','OR Tools Solver','AI Insights','Smart Routing','Max Utilization','Time Windows','Heuristic Fallback','LangGraph Agents','Scenario Engine'].flatMap((t,i) => [
            <span key={`a${i}`} className="marquee-item">{t}</span>,
            <span key={`d${i}`} className="marquee-item marquee-dot">·</span>,
          ]).concat(
            ['Load Consolidation','Fewer Trucks','Lower Costs','Less Carbon','OR Tools Solver','AI Insights','Smart Routing','Max Utilization','Time Windows','Heuristic Fallback','LangGraph Agents','Scenario Engine'].flatMap((t,i) => [
              <span key={`b${i}`} className="marquee-item">{t}</span>,
              <span key={`e${i}`} className="marquee-item marquee-dot">·</span>,
            ])
          )}
        </div>
      </div>

      {/* ════ STATS ════ */}
      <div className="stats-grid" ref={statsRef} style={{ opacity: statsVisible ? 1 : 0, transform: statsVisible ? 'translateY(0)' : 'translateY(28px)', transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)' }}>
        {STATS.map(({ label, raw, suffix, prefix }, i) => (
          <div key={label} className="stat-cell">
            <div className="stat-num">
              {prefix}{counters[i]}{suffix}
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-sub">per optimized batch</div>
          </div>
        ))}
      </div>

      {/* ════ FEATURES — alternating rows ════ */}
      <div className="home-section">
        <div className="section-divider">
          <span className="section-divider-label">— How it works</span>
          <div className="section-divider-line" />
        </div>

        <div className="features-wrap">
          {FEATURES.map((f, idx) => (
            <div key={f.num} className={`feature-row${idx % 2 === 1 ? ' reverse' : ''}`}>

              {/* Text side */}
              <div className="feature-text">
                <div className="feature-num">No. {f.num}</div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1rem' }}>
                  <span className="feature-tag" style={{ marginBottom:0 }}>{f.tag}</span>
                  <span style={{ opacity:0.85 }}>{FEATURE_ICONS[idx]}</span>
                </div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
                <div className="feature-bullets">
                  {f.bullets.map(b => (
                    <div key={b} className="feature-bullet">{b}</div>
                  ))}
                </div>
                <span className="feature-link" onClick={() => nav(f.to)}>
                  <span style={{ display:'flex', alignItems:'center' }}>{FEATURE_ICONS[idx]}</span>
                  {['Optimize','Insights','Scenarios','Shipments'][idx]} →
                </span>
              </div>

              {/* Visual side */}
              <div className="feature-visual">
                <div className="visual-label">/ {f.tag.toLowerCase()} · preview</div>

                {idx === 0 && (
                  <>
                    <div className="visual-metric-row">
                      <div className="visual-metric">
                        <div className="visual-metric-val">3</div>
                        <div className="visual-metric-lbl">Trucks Used</div>
                      </div>
                      <div className="visual-metric">
                        <div className="visual-metric-val">₹13.5k</div>
                        <div className="visual-metric-lbl">Total Cost</div>
                      </div>
                      <div className="visual-metric">
                        <div className="visual-metric-val">44%</div>
                        <div className="visual-metric-lbl">Saved</div>
                      </div>
                    </div>
                    <div>
                      {[['V001 · Mumbai→Pune', 91], ['V003 · Mumbai→Delhi', 32], ['V004 · Pune→Delhi', 97]].map(([lbl, pct]) => (
                        <div key={lbl} style={{ marginBottom: '0.6rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:'4px', fontFamily:'JetBrains Mono' }}>
                            <span>{lbl}</span><span style={{ color:'var(--page-accent)' }}>{pct}%</span>
                          </div>
                          <div className="visual-bar-wrap">
                            <div className="visual-bar" style={{ width:`${pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {idx === 1 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                    {[
                      { agent:'Insight Agent',     color:'#06b6d4', msg:'91% utilisation on Mumbai Pune lane. ₹10.5k saved vs individual dispatch.' },
                      { agent:'Relaxation Agent',  color:'#10b981', msg:'Relax S003 window by 45 min → consolidation with S006 feasible.' },
                      { agent:'Scenario Recommender', color:'var(--page-accent)', msg:'Flexible SLA = best cost. Strict SLA = best compliance.' },
                    ].map(({ agent, color, msg }) => (
                      <div key={agent} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${color}28`, borderRadius:'10px', padding:'0.75rem 1rem' }}>
                        <div style={{ fontSize:'0.65rem', color, fontFamily:'JetBrains Mono', marginBottom:'4px', textTransform:'uppercase', letterSpacing:'0.08em' }}>{agent}</div>
                        <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', lineHeight:1.5 }}>{msg}</div>
                      </div>
                    ))}
                  </div>
                )}

                {idx === 2 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
                    {[
                      { label:'Flexible SLA',    cost:'₹13.5k', util:'76%', color:'var(--page-accent)' },
                      { label:'Strict SLA',      cost:'₹15.5k', util:'68%', color:'#06b6d4' },
                      { label:'Vehicle Shortage',cost:'₹12.0k', util:'91%', color:'#10b981' },
                      { label:'Demand Surge',    cost:'₹19.0k', util:'82%', color:'#8b5cf6' },
                    ].map(({ label, cost, util, color }) => (
                      <div key={label} style={{ display:'flex', alignItems:'center', gap:'0.75rem', background:'rgba(255,255,255,0.02)', borderRadius:'8px', padding:'0.6rem 0.9rem' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0, boxShadow:`0 0 6px ${color}` }} />
                        <span style={{ flex:1, fontSize:'0.78rem', color:'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontSize:'0.78rem', fontFamily:'JetBrains Mono', color }}>{cost}</span>
                        <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono' }}>{util}</span>
                      </div>
                    ))}
                  </div>
                )}

                {idx === 3 && (
                  <div>
                    <HomeGlobeMap />
                    <div style={{ display:'flex', gap:'0.75rem', marginTop:'0.75rem' }}>
                      {HOME_ARCS.map(a => (
                        <div key={a.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.65rem', color:'var(--text-muted)', fontFamily:'JetBrains Mono' }}>
                          <div style={{ width:16, height:2, background:a.color, borderRadius:1, boxShadow:`0 0 4px ${a.color}` }}/>
                          {a.label.split('·')[2]?.trim()}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  )
}