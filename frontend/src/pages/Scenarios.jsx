import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import PageShell from '@/components/layout/PageShell'

const TYPE_TO_ID = { FLEXIBLE_SLA: 'flexible', STRICT_SLA: 'strict', VEHICLE_SHORTAGE: 'shortage', DEMAND_SURGE: 'surge' }

/* ✏️ EDIT: stats bar */
const STATS = [
  { label: 'Scenarios',    raw: 4,  suffix: '',  prefix: '' },
  { label: 'Best Saving',  raw: 44, suffix: '%', prefix: '' },
  { label: 'Peak Util',    raw: 91, suffix: '%', prefix: '' },
  { label: 'Demand Surge', raw: 2,  suffix: '×', prefix: '' },
]

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

const SCENARIOS = [
  {
    id: 'flexible', num: '01', label: 'Flexible SLA', tag: 'Recommended',
    color: '#8b5cf6', colorRaw: '139,92,246',
    icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
    desc: 'Delivery windows relaxed by up to 2 hours. Enables maximum consolidation and cost savings ideal for non urgent B2B shipments.',
    metrics: { trucks: 3, cost: '₹13.5k', util: '76%', carbon: '42 kg', saved: '44%' },
    bars: [['V001 · Mumbai→Pune', 91], ['V003 · Mumbai→Delhi', 32], ['V004 · Pune→Delhi', 97]],
  },
  {
    id: 'strict', num: '02', label: 'Strict SLA', tag: 'Compliance',
    color: '#06b6d4', colorRaw: '6,182,212',
    icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    desc: 'All delivery time windows respected exactly. Fewer consolidations are possible choose this for contractually bound SLA customers.',
    metrics: { trucks: 4, cost: '₹15.5k', util: '68%', carbon: '58 kg', saved: '22%' },
    bars: [['V001 · Mumbai→Pune', 74], ['V003 · Mumbai→Delhi', 61], ['V004 · Pune→Delhi', 82], ['V005 · Mumbai→Pune', 55]],
  },
  {
    id: 'shortage', num: '03', label: 'Vehicle Shortage', tag: 'Peak Mode',
    color: '#10b981', colorRaw: '16,185,129',
    icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    desc: 'Fleet reduced to 2 available vehicles. The solver maximises utilisation above all best for peak season fleet crunches.',
    metrics: { trucks: 2, cost: '₹12.0k', util: '91%', carbon: '35 kg', saved: '52%' },
    bars: [['V001 · Mumbai→Pune', 95], ['V003 · Full Circuit', 91]],
  },
  {
    id: 'surge', num: '04', label: 'Demand Surge', tag: 'Stress Test',
    color: '#8b5cf6', colorRaw: '139,92,246',
    icon: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    desc: 'Shipment volume doubled to simulate Q4 demand spike. All 4 trucks deployed with heuristic solver fallback for >50 shipments.',
    metrics: { trucks: 4, cost: '₹19.0k', util: '82%', carbon: '71 kg', saved: '18%' },
    bars: [['V001', 88], ['V003', 92], ['V004', 79], ['V005', 82]],
  },
]

function MetricPill({ val, lbl, color }) {
  return (
    <div style={{ flex:1, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.65rem 0.8rem' }}>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:'1.2rem', fontWeight:800, color, lineHeight:1, marginBottom:2 }}>{val}</div>
      <div style={{ fontSize:'0.62rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{lbl}</div>
    </div>
  )
}

export default function Scenarios() {
  const [running,     setRunning]     = useState(null)
  const [results,     setResults]     = useState({})
  const [selected,    setSelected]    = useState(null)
  const [liveMetrics, setLiveMetrics] = useState({})
  const { optimizationResult, runSimulation } = useApp()

  const statsRef = useRef(null)
  const [statsVisible, setStatsVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true) }, { threshold: 0.3 })
      if (statsRef.current) obs.observe(statsRef.current)
    }, 300)
    return () => clearTimeout(timer)
  }, [])
  const c0 = useCounter(STATS[0].raw, 1400, statsVisible)
  const c1 = useCounter(STATS[1].raw, 1600, statsVisible)
  const c2 = useCounter(STATS[2].raw, 1800, statsVisible)
  const c3 = useCounter(STATS[3].raw, 1500, statsVisible)
  const counters = [c0, c1, c2, c3]

  useEffect(() => {
    if (optimizationResult?.scenarios?.length) {
      const nr = {}; const nm = {}
      optimizationResult.scenarios.forEach(s => {
        const id = TYPE_TO_ID[s.scenario_type]
        if (id) { nr[id]=true; nm[id]={ trucks:s.trucks_used, cost:`₹${(s.total_cost/1000).toFixed(1)}k`, util:`${Math.round(s.avg_utilization)}%`, carbon:`${Math.round(s.carbon_emissions)} kg`, saved:`${Math.round(s.sla_success_rate)}%` } }
      })
      setResults(prev => ({ ...prev, ...nr })); setLiveMetrics(prev => ({ ...prev, ...nm }))
      if (!selected && Object.keys(nr).length) setSelected(Object.keys(nr)[0])
    }
  }, [optimizationResult])

  const runScenario = async (id) => {
    setRunning(id)
    const planId = optimizationResult?.plan?.id
    if (planId && runSimulation) {
      const data = await runSimulation({ plan_id: planId })
      if (data?.scenarios) {
        const nr = {}; const nm = {}
        data.scenarios.forEach(s => {
          const sid = TYPE_TO_ID[s.scenario_type]
          if (sid) { nr[sid]=true; nm[sid]={ trucks:s.trucks_used, cost:`₹${(s.total_cost/1000).toFixed(1)}k`, util:`${Math.round(s.avg_utilization)}%`, carbon:`${Math.round(s.carbon_emissions)} kg`, saved:`${Math.round(s.sla_success_rate)}%` } }
        })
        setResults(prev => ({ ...prev, ...nr })); setLiveMetrics(prev => ({ ...prev, ...nm }))
      }
    } else {
      await new Promise(r => setTimeout(r, 1400))
      setResults(prev => ({ ...prev, [id]: true }))
    }
    setRunning(null); setSelected(id)
  }

  const runAll = async () => {
    const planId = optimizationResult?.plan?.id
    if (planId && runSimulation) { setRunning('all'); await runScenario('flexible'); setRunning(null) }
    else { for (const s of SCENARIOS) { await runScenario(s.id); await new Promise(r => setTimeout(r, 200)) } }
  }

  const getMetrics = (s) => liveMetrics[s.id] || s.metrics
  const allDone = SCENARIOS.every(s => results[s.id])

  return (
    <PageShell>
      <style>{`
        /* ── Unique scn-* styles only ── */

        .scn-toolbar {
          display: flex; align-items: center; gap: 1rem;
          padding: 0 3rem; margin-bottom: 2rem;
          position: relative; z-index: 1;
          opacity: 0; animation: fadeSlideUp 0.45s ease 0.3s forwards;
        }
        .scn-run-all-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 22px; border-radius: 12px; border: none;
          background: var(--page-accent); color: #0a0a0a;
          font-weight: 700; font-size: 0.85rem; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          box-shadow: 0 0 24px rgba(var(--page-glow-rgb), 0.4);
          transition: all 0.22s;
        }
        .scn-run-all-btn:hover { transform: translateY(-2px); box-shadow: 0 0 42px rgba(var(--page-glow-rgb), 0.6); }
        .scn-run-all-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        .scn-toolbar-info { font-size: 0.72rem; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); }

        .scn-cards-grid {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 1.25rem; padding: 0 3rem; margin-bottom: 2.5rem;
          position: relative; z-index: 1;
        }
        .scn-card {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 18px; overflow: hidden; cursor: pointer;
          transition: border-color 0.25s, box-shadow 0.25s;
          opacity: 0; animation: fadeSlideUp 0.5s ease forwards;
        }
        .scn-card.selected { box-shadow: 0 0 0 1px var(--page-accent), 0 0 32px rgba(var(--page-glow-rgb), 0.18); }
        .scn-card:hover { border-color: rgba(var(--page-glow-rgb), 0.4); }
        .scn-card-header { padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 0.75rem; }
        .scn-card-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .scn-card-num { font-family: 'JetBrains Mono', monospace; font-size: 0.62rem; color: var(--text-muted); }
        .scn-card-title { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700; }
        .scn-card-tag { margin-left: auto; font-size: 0.62rem; padding: 2px 7px; border-radius: 5px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; }
        .scn-card-body { padding: 1.1rem 1.25rem; }
        .scn-card-desc { font-size: 0.82rem; color: var(--text-secondary); line-height: 1.65; margin-bottom: 1rem; }
        .scn-metric-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
        .scn-bars { display: flex; flex-direction: column; gap: 0.45rem; }
        .scn-bar-lbl { display: flex; justify-content: space-between; font-size: 0.65rem; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); margin-bottom: 3px; }
        .scn-bar-track { height: 5px; border-radius: 9999px; background: rgba(255,255,255,0.05); overflow: hidden; }
        .scn-bar-fill { height: 100%; border-radius: 9999px; transition: width 0.8s cubic-bezier(0.22,1,0.36,1); }
        .scn-card-footer { padding: 0.9rem 1.25rem; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .scn-run-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 16px; border-radius: 9999px; border: none;
          font-size: 0.72rem; font-weight: 600; font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; transition: all 0.2s;
        }
        .scn-run-btn:disabled { cursor: not-allowed; opacity: 0.6; }

        .scn-compare {
          background: var(--card); border: 1px solid var(--border);
          border-radius: 18px; overflow: hidden;
          margin: 0 3rem 6rem; position: relative; z-index: 1;
          opacity: 0; animation: fadeSlideUp 0.5s ease 0.5s forwards;
        }
        .scn-compare-header { padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--border); }
        .scn-compare-title { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700; margin-bottom: 2px; }
        .scn-compare-sub { font-size: 0.68rem; font-family: 'JetBrains Mono', monospace; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; }
        .scn-table { width: 100%; border-collapse: collapse; }
        .scn-table th { padding: 0.75rem 1.25rem; font-size: 0.65rem; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); text-align: left; border-bottom: 1px solid var(--border); }
        .scn-table td { padding: 0.9rem 1.25rem; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .scn-table tr:last-child td { border-bottom: none; }
        .scn-table tr:hover td { background: rgba(var(--page-glow-rgb), 0.03); }

        @keyframes spinIcon { to { transform: rotate(360deg); } }
      `}</style>

      {/* ════ HERO ════ */}
      <section className="home-section">
        <div className="hero-wrap">
          <div className="hero-tag">
            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            What If Engine
          </div>
          <h1 className="hero-h1">
            <div className="blur-line">
              {['What If'].map((w,i) => <span key={w} className="blur-word" style={{ animationDelay:`${0.12+i*0.09}s` }}>{w}</span>)}
            </div>
            <div className="blur-line" style={{ color:'var(--page-accent)' }}>
              {['Scenarios.'].map((w,i) => <span key={w} className="blur-word" style={{ animationDelay:`${0.3+i*0.11}s` }}>{w}</span>)}
            </div>
          </h1>
          <p className="hero-sub">
            {['Run','the','same','shipment','batch','under','four','different','business','conditions.','Compare','cost,','carbon,','and','utilisation','side by side.'].map((w,i) => (
              <span key={i} className="blur-word-sub" style={{ animationDelay:`${0.55+i*0.04}s`, marginRight:'0.3em' }}>{w}</span>
            ))}
          </p>
        </div>
      </section>

      {/* ════ MARQUEE ════ */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {['Flexible SLA','Strict SLA','Vehicle Shortage','Demand Surge','Cost Comparison','Carbon Savings','MIP Solver','Utilisation','What If Engine','4 Scenarios','OR Tools','Scenario Engine'].flatMap((t,i) => [
            <span key={`a${i}`} className="marquee-item">{t}</span>,
            <span key={`d${i}`} className="marquee-item marquee-dot">·</span>,
          ]).concat(
            ['Flexible SLA','Strict SLA','Vehicle Shortage','Demand Surge','Cost Comparison','Carbon Savings','MIP Solver','Utilisation','What If Engine','4 Scenarios','OR Tools','Scenario Engine'].flatMap((t,i) => [
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
            <div className="stat-num">{prefix}{counters[i]}{suffix}</div>
            <div className="stat-label">{label}</div>
            <div className="stat-sub">per optimized batch</div>
          </div>
        ))}
      </div>

      {/* ════ SECTION DIVIDER ════ */}
      <div style={{ position:'relative', zIndex:1 }}>
        <div className="section-divider">
          <span className="section-divider-label">— Scenarios · run & compare</span>
          <div className="section-divider-line" />
        </div>
      </div>

      {/* ════ UNIQUE: toolbar + cards + compare ════ */}

      <div className="scn-toolbar">
        <button className="scn-run-all-btn" onClick={runAll} disabled={running !== null}>
          {running
            ? <><Loader2 size={14} style={{ animation:'spinIcon 1s linear infinite' }} /> Running…</>
            : <><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run All Scenarios</>
          }
        </button>
        <span className="scn-toolbar-info">
          {allDone ? 'All 4 scenarios complete' : `${Object.keys(results).length}/4 complete`}
        </span>
      </div>

      <div className="scn-cards-grid">
        {SCENARIOS.map((s, idx) => {
          const isDone    = !!results[s.id]
          const isRunning = running === s.id
          const isSel     = selected === s.id
          return (
            <div
              key={s.id}
              className={`scn-card ${isSel ? 'selected' : ''}`}
              style={{ animationDelay:`${0.1+idx*0.08}s`, borderColor: isSel ? s.color : undefined }}
              onClick={() => isDone && setSelected(s.id)}
            >
              <div className="scn-card-header">
                <div className="scn-card-icon" style={{ background:`${s.color}18`, border:`1px solid ${s.color}28`, color:s.color }}>{s.icon}</div>
                <div>
                  <div className="scn-card-num">No. {s.num}</div>
                  <div className="scn-card-title">{s.label}</div>
                </div>
                <span className="scn-card-tag" style={{ background:`${s.color}18`, border:`1px solid ${s.color}28`, color:s.color }}>{s.tag}</span>
              </div>

              <div className="scn-card-body">
                <p className="scn-card-desc">{s.desc}</p>
                {isDone ? (
                  <>
                    <div className="scn-metric-row">
                      <MetricPill val={getMetrics(s).trucks + ' trucks'} lbl="Fleet Used" color={s.color} />
                      <MetricPill val={getMetrics(s).cost} lbl="Total Cost" color={s.color} />
                      <MetricPill val={getMetrics(s).util} lbl="Avg Util" color={s.color} />
                    </div>
                    <div className="scn-bars">
                      {s.bars.map(([lbl, pct]) => (
                        <div key={lbl}>
                          <div className="scn-bar-lbl"><span>{lbl}</span><span style={{ color:s.color }}>{pct}%</span></div>
                          <div className="scn-bar-track">
                            <div className="scn-bar-fill" style={{ width:`${pct}%`, background:`linear-gradient(90deg, ${s.color}88, ${s.color})` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ height:80, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px dashed var(--border)' }}>
                    <span style={{ fontSize:'0.72rem', fontFamily:'JetBrains Mono', color:'var(--text-muted)' }}>
                      {isRunning ? 'Solving…' : 'Not run yet'}
                    </span>
                  </div>
                )}
              </div>

              <div className="scn-card-footer">
                <span style={{ fontSize:'0.68rem', fontFamily:'JetBrains Mono', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em' }}>
                  {isDone ? `✓ SLA ${getMetrics(s).saved}` : isRunning ? 'Running MIP…' : 'Ready'}
                </span>
                <button
                  className="scn-run-btn"
                  style={{ background:`${s.color}18`, border:`1px solid ${s.color}40`, color:s.color }}
                  onClick={(e) => { e.stopPropagation(); runScenario(s.id) }}
                  disabled={running !== null}
                >
                  {isRunning
                    ? <><Loader2 size={12} style={{ animation:'spinIcon 1s linear infinite' }} /> Running</>
                    : isDone ? 'Re-run' : 'Run →'
                  }
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {Object.keys(results).length >= 2 && (
        <div className="scn-compare">
          <div className="scn-compare-header">
            <div className="scn-compare-title">Side-by-Side Comparison</div>
            <div className="scn-compare-sub">/ scenarios · cost · util · carbon</div>
          </div>
          <table className="scn-table">
            <thead>
              <tr>{['Scenario','Trucks','Total Cost','Avg Util','CO₂ Saved','Cost Saving'].map(h => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {SCENARIOS.filter(s => results[s.id]).map(s => {
                const m = getMetrics(s)
                return (
                  <tr key={s.id} style={{ cursor:'pointer' }} onClick={() => setSelected(s.id)}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:s.color, boxShadow:`0 0 6px ${s.color}` }} />
                        <span style={{ fontFamily:'Syne, sans-serif', fontWeight:700 }}>{s.label}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily:'JetBrains Mono', color:'var(--text-secondary)' }}>{m.trucks}</td>
                    <td style={{ fontFamily:'JetBrains Mono', color:s.color, fontWeight:700 }}>{m.cost}</td>
                    <td style={{ fontFamily:'JetBrains Mono', color:'var(--text-secondary)' }}>{m.util}</td>
                    <td style={{ fontFamily:'JetBrains Mono', color:'var(--text-muted)' }}>{m.carbon}</td>
                    <td style={{ fontFamily:'JetBrains Mono', color:s.color }}>{m.saved}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </PageShell>
  )
}