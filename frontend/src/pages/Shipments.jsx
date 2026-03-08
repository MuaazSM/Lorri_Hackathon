import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { useApp } from '@/context/AppContext'
import PageShell from '@/components/layout/PageShell'

/* ─────────────────────────────────────────────
   ✏️ EDIT: Shipment & truck data
───────────────────────────────────────────── */
const SHIPMENTS = [
  { id:'S001', origin:'Mumbai', dest:'Pune',   weight:850,  volume:12, priority:'High',   window:'08:00–14:00', status:'Consolidated', truck:'V001', group:'G1' },
  { id:'S002', origin:'Mumbai', dest:'Pune',   weight:620,  volume: 9, priority:'Medium', window:'07:30–15:00', status:'Consolidated', truck:'V001', group:'G1' },
  { id:'S003', origin:'Pune',   dest:'Delhi',  weight:1100, volume:18, priority:'High',   window:'09:00–20:00', status:'Consolidated', truck:'V004', group:'G2' },
  { id:'S004', origin:'Mumbai', dest:'Delhi',  weight:450,  volume: 7, priority:'Low',    window:'10:00–22:00', status:'Standalone',   truck:'V003', group:'G3' },
  { id:'S005', origin:'Mumbai', dest:'Pune',   weight:300,  volume: 5, priority:'Medium', window:'08:00–16:00', status:'Consolidated', truck:'V001', group:'G1' },
  { id:'S006', origin:'Pune',   dest:'Delhi',  weight:780,  volume:11, priority:'Medium', window:'10:00–21:00', status:'Consolidated', truck:'V004', group:'G2' },
]

const TRUCKS = [
  { id:'V001', route:'Mumbai → Pune',  shipments:['S001','S002','S005'], util:91, load:1770, cap:2000, color:'#f59e0b' },
  { id:'V003', route:'Mumbai → Delhi', shipments:['S004'],               util:32, load:450,  cap:1500, color:'#06b6d4' },
  { id:'V004', route:'Pune → Delhi',   shipments:['S003','S006'],        util:97, load:1880, cap:2000, color:'#10b981' },
]

/* ✏️ EDIT: Stats bar — 4 numbers shown at the top */
const STATS = [
  { label: 'Total Shipments', raw: 6,    suffix: '',    prefix: '' },
  { label: 'Trucks Assigned', raw: 3,    suffix: '',    prefix: '' },
  { label: 'Total Weight',    raw: 4100, suffix: 'kg',  prefix: '' },
  { label: 'Avg Utilization', raw: 76,   suffix: '%',   prefix: '' },
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

/* ✏️ EDIT: Lane filter pills */
const LANES = ['All', 'Mumbai → Pune', 'Pune → Delhi', 'Mumbai → Delhi']

/* ✏️ EDIT: Arc routes for the globe */
const ARCS = [
  { startLat:19.076,  startLng:72.8777, endLat:18.5204, endLng:73.8567, color:'#f59e0b', label:'G1 · V001 · Mumbai→Pune',  ids:['S001','S002','S005'] },
  { startLat:18.5204, startLng:73.8567, endLat:28.6139, endLng:77.209,  color:'#10b981', label:'G2 · V004 · Pune→Delhi',   ids:['S003','S006'] },
  { startLat:19.076,  startLng:72.8777, endLat:28.6139, endLng:77.209,  color:'#06b6d4', label:'G3 · V003 · Mumbai→Delhi', ids:['S004'] },
]

const CITIES = {
  Mumbai: { lat: 19.076,  lng: 72.8777, color: '#f59e0b' },
  Pune:   { lat: 18.5204, lng: 73.8567, color: '#10b981' },
  Delhi:  { lat: 28.6139, lng: 77.209,  color: '#06b6d4' },
}

const GROUP_COLORS    = { G1:'#f59e0b', G2:'#10b981', G3:'#06b6d4' }
const PRIORITY_COLORS = { High:'#ef4444', Medium:'#f59e0b', Low:'#6b7280' }

function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

/* ─────────────────────────────────────────────────────────────
   Globe component — FIX: init the globe ONCE, then update
   arcsData() on filter changes without rebuilding the scene.
   Previously, filter was in the useEffect dependency array,
   causing a full import('globe.gl') + THREE.js scene teardown
   and rebuild on every filter pill click.
───────────────────────────────────────────────────────────── */
function GlobeMap({ filter }) {
  const containerRef = useRef(null)
  const globeRef     = useRef(null)

  // ── Create globe once on mount ──
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    // Delay globe init until hero blur animations have finished (~700ms)
    // so WebGL context creation doesn't compete with CSS blur on the GPU
    const timer = setTimeout(() => {
    import('globe.gl').then(({ default: Globe }) => {
      if (cancelled || !containerRef.current) return
      containerRef.current.innerHTML = ''

      const cityPoints = Object.entries(CITIES).map(([name, c]) => ({ name, ...c }))

      const g = Globe({ animateIn: true })(containerRef.current)
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
        .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
        .width(containerRef.current.offsetWidth || 900)
        .height(520)
        .pointOfView({ lat: 22, lng: 78, altitude: 1.6 }, 0)
        /* Arc routes — start with all arcs */
        .arcsData(ARCS)
        .arcStartLat(d => d.startLat).arcStartLng(d => d.startLng)
        .arcEndLat(d => d.endLat).arcEndLng(d => d.endLng)
        .arcColor(d => [d.color, d.color])
        .arcAltitude(0.25)
        .arcStroke(1.2)
        .arcDashLength(0.4).arcDashGap(0.15).arcDashAnimateTime(2200)
        .arcLabel(d => `<div style="background:#0d0d12;border:1px solid ${d.color}55;border-radius:8px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:${d.color}">${d.label}</div>`)
        /* City dots */
        .pointsData(cityPoints)
        .pointLat(d => d.lat).pointLng(d => d.lng)
        .pointColor(d => d.color).pointAltitude(0.01).pointRadius(0.5)
        .pointLabel(d => `<div style="background:#0d0d12;border:1px solid ${d.color}55;border-radius:6px;padding:5px 10px;font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:${d.color}">📍 ${d.name}</div>`)
        /* Pulse rings */
        .ringsData(cityPoints)
        .ringLat(d => d.lat).ringLng(d => d.lng)
        .ringColor(d => t => `rgba(${hexToRgb(d.color)},${1 - t})`)
        .ringMaxRadius(3).ringPropagationSpeed(1.5).ringRepeatPeriod(1500)

      g.controls().autoRotate = true
      g.controls().autoRotateSpeed = 0.4
      g.controls().enableZoom = true

      globeRef.current = g
    }).catch(() => {})
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
  }, []) // ← empty — globe created once, never torn down on filter change

  // ── Update arcs data only when filter changes (no scene rebuild) ──
  useEffect(() => {
    if (!globeRef.current) return
    const activeArcs = filter === 'All'
      ? ARCS
      : ARCS.filter(a => a.label.includes(filter.replace(' → ', '→')))
    globeRef.current.arcsData(activeArcs)
  }, [filter])

  return (
    <div ref={containerRef}
      style={{ width:'100%', height:'520px', background:'#060609', cursor:'grab' }}
    />
  )
}

/* ═══════════════════════════════════════════
   Main page
═══════════════════════════════════════════ */
export default function Shipments() {
  const nav = useNavigate()
  const [filter,   setFilter]   = useState('All')
  const [selected, setSelected] = useState(null)
  const { shipments: apiShipments, optimizationResult } = useApp()
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

  // Map API shipments + optimization assignments to the page's expected shape
  const liveData = useMemo(() => {
    if (!apiShipments?.length) return null

    // Build truck assignment lookup from optimization result
    const assignmentMap = {}
    const trucksArr = []
    const plan = optimizationResult?.plan
    const TRUCK_COLORS = ['#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899']
    if (plan?.assigned) {
      plan.assigned.forEach((a, idx) => {
        const groupId = `G${idx + 1}`
        const color = TRUCK_COLORS[idx % TRUCK_COLORS.length]
        ;(a.shipment_ids || []).forEach(sid => {
          assignmentMap[sid] = { truck: a.vehicle_id, group: groupId, color }
        })
        trucksArr.push({
          id: a.vehicle_id,
          route: a.route || 'N/A',
          shipments: a.shipment_ids || [],
          util: a.utilization_pct || 0,
          load: a.total_weight || 0,
          cap: a.capacity_weight || 0,
          color,
        })
      })
    }

    const shipments = apiShipments.map(s => {
      const assign = assignmentMap[s.shipment_id] || {}
      const pTime = s.pickup_time ? new Date(s.pickup_time) : null
      const dTime = s.delivery_time ? new Date(s.delivery_time) : null
      const window = pTime && dTime
        ? `${String(pTime.getHours()).padStart(2,'0')}:${String(pTime.getMinutes()).padStart(2,'0')}–${String(dTime.getHours()).padStart(2,'0')}:${String(dTime.getMinutes()).padStart(2,'0')}`
        : '—'
      const priority = s.priority ? s.priority.charAt(0).toUpperCase() + s.priority.slice(1).toLowerCase() : 'Medium'
      const status = assign.truck ? 'Consolidated' : (s.status === 'ASSIGNED' ? 'Assigned' : 'Pending')
      return {
        id: s.shipment_id,
        origin: s.origin,
        dest: s.destination,
        weight: s.weight,
        volume: s.volume,
        priority,
        window,
        status,
        truck: assign.truck || '—',
        group: assign.group || '—',
        _color: assign.color || '#6b7280',
      }
    })

    const totalWeight = shipments.reduce((sum, s) => sum + s.weight, 0)
    const avgUtil = trucksArr.length ? Math.round(trucksArr.reduce((s, t) => s + t.util, 0) / trucksArr.length) : 0
    const stats = [
      { num: String(shipments.length), label: 'Total Shipments', sub: 'this batch' },
      { num: String(trucksArr.length || '—'), label: 'Trucks Assigned', sub: 'MIP solution' },
      { num: `${totalWeight.toLocaleString()}kg`, label: 'Total Weight', sub: 'all lanes' },
      { num: `${avgUtil}%`, label: 'Avg Utilization', sub: 'across fleet' },
    ]

    const laneSet = new Set(shipments.map(s => `${s.origin} → ${s.dest}`))
    const lanes = ['All', ...laneSet]

    return { shipments, trucks: trucksArr, stats, lanes }
  }, [apiShipments, optimizationResult])

  // Use API data if available, otherwise fallback to demo
  const shipmentList = liveData?.shipments || SHIPMENTS
  const truckList    = liveData?.trucks?.length ? liveData.trucks : TRUCKS
  const statList     = liveData?.stats || STATS
  const laneList     = liveData?.lanes || LANES

  const filtered    = filter === 'All' ? shipmentList : shipmentList.filter(s => `${s.origin} → ${s.dest}` === filter)
  const selShipment = shipmentList.find(s => s.id === selected)
  const selTruck    = selShipment ? truckList.find(t => t.id === selShipment.truck) : null

  return (
    <PageShell>
    <style>{`
        .page-body {
          position: relative;
          z-index: 1;
          padding: 0 3rem 5rem;
        }
        .globe-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
          margin-bottom: 2rem;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .globe-card:hover {
          border-color: rgba(var(--page-glow-rgb), 0.4);
          box-shadow: 0 0 40px rgba(var(--page-glow-rgb), 0.1);
        }
        .globe-header {
          padding: 1.2rem 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .globe-legend {
          padding: 1rem 1.5rem;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
          background: rgba(0,0,0,0.2);
        }
        .filter-pill {
          padding: 7px 18px;
          border-radius: 9999px;
          font-size: 0.72rem;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.08em;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid rgba(var(--page-glow-rgb), 0.25);
          background: rgba(var(--page-glow-rgb), 0.06);
          color: var(--text-muted);
        }
        .filter-pill:hover {
          border-color: var(--page-accent);
          color: var(--page-accent);
        }
        .filter-pill.active {
          border: none;
          background: var(--page-accent);
          color: #0a0a0a;
          font-weight: 700;
          box-shadow: 0 0 16px rgba(var(--page-glow-rgb), 0.4);
        }
        .content-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 1.5rem;
        }
        .table-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          overflow: hidden;
        }
        .table-card table { width: 100%; border-collapse: collapse; }
        .table-card th {
          padding: 0.75rem 1.25rem;
          font-size: 0.62rem;
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          text-align: left;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .table-card td {
          padding: 0.9rem 1.25rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          font-size: 0.82rem;
        }
        .table-card tr { cursor: pointer; transition: background 0.15s; }
        .table-card tr:hover td { background: rgba(var(--page-glow-rgb), 0.05); }
        .table-card tr.sel td { background: rgba(var(--page-glow-rgb), 0.08); }
        .sidebar-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 1.25rem;
          transition: border-color 0.3s, box-shadow 0.3s;
        }
        .sidebar-card:hover { border-color: rgba(var(--page-glow-rgb), 0.3); }
        .sidebar-card-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .sidebar-card-body { padding: 1rem 1.25rem; }
        .util-bar-wrap {
          height: 4px;
          border-radius: 9999px;
          background: rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .util-bar {
          height: 100%;
          border-radius: 9999px;
        }
        .badge {
          font-size: 0.6rem;
          padding: 2px 7px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .footer-badges { display: flex; flex-wrap: wrap; gap: 0.4rem; }
        .footer-badge {
          font-size: 0.65rem;
          font-family: 'JetBrains Mono', monospace;
          padding: 3px 8px;
          border-radius: 5px;
          border: 1px solid var(--border);
          color: var(--text-muted);
          cursor: default;
          transition: all 0.2s;
        }
        .footer-badge:hover { border-color: var(--page-accent); color: var(--page-accent); }
      `}</style>

      {/* ════ HERO ════ */}
      <section style={{ position:'relative', zIndex:1, width:'100%' }}>
        <div className="hero-wrap">
          <div className="hero-tag">
            <MapPin size={10} /> Live Route Visibility
          </div>

          <h1 className="hero-h1">
            <div className="blur-line">
              {['Every', 'Route.'].map((w, i) => (
                <span key={w} className="blur-word" style={{ animationDelay:`${0.12 + i*0.09}s` }}>{w}</span>
              ))}
            </div>
            <div className="blur-line" style={{ color:'var(--page-accent)' }}>
              {['Every', 'Shipment.'].map((w, i) => (
                <span key={w} className="blur-word" style={{ animationDelay:`${0.3 + i*0.11}s` }}>{w}</span>
              ))}
            </div>
          </h1>

          {/*
            FIX: Subtitle as a single animated element instead of 13
            individual blur-word spans. This removes 13 compositing layers
            that were being created and animated simultaneously.
          */}
          <p className="hero-sub" style={{
            opacity: 0,
            animation: 'fadeSlideUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.5s forwards'
          }}>
            6 shipments across 3 lanes visualised on an interactive 3D globe with live arc routes.
          </p>
        </div>
      </section>

      {/* ════ MARQUEE ════ */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {['Route Visibility','Mumbai · Pune · Delhi','Load Consolidation','3 Active Trucks','OR-Tools MIP','6 Shipments','4,100 kg Load','76% Utilization','Colour-Coded Groups','LangGraph Agents','Live Globe Map','Time Windows'].flatMap((t,i) => [
            <span key={`a${i}`} className="marquee-item">{t}</span>,
            <span key={`d${i}`} className="marquee-item marquee-dot">·</span>,
          ]).concat(
            ['Route Visibility','Mumbai · Pune · Delhi','Load Consolidation','3 Active Trucks','OR-Tools MIP','6 Shipments','4,100 kg Load','76% Utilization','Colour-Coded Groups','LangGraph Agents','Live Globe Map','Time Windows'].flatMap((t,i) => [
              <span key={`b${i}`} className="marquee-item">{t}</span>,
              <span key={`e${i}`} className="marquee-item marquee-dot">·</span>,
            ])
          )}
        </div>
      </div>

      {/* ════ STATS ════ */}
      <div className="stats-grid" ref={statsRef} style={{ opacity: statsVisible ? 1 : 0, transform: statsVisible ? 'translateY(0)' : 'translateY(28px)', transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)' }}>
        {STATS.map(({ label, suffix, prefix }, i) => (
          <div key={label} className="stat-cell">
            <div className="stat-num">{prefix}{counters[i]}{suffix}</div>
            <div className="stat-label">{label}</div>
            <div className="stat-sub">per optimized batch</div>
          </div>
        ))}
      </div>

      {/* ════ MAIN CONTENT ════ */}
      <div style={{ position:'relative', zIndex:1 }}>

        <div className="section-divider">
          <span className="section-divider-label">— Route map · shipment table</span>
          <div className="section-divider-line" />
        </div>

        <div className="page-body">

          {/* ── Lane filter pills ── */}
          <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap', marginBottom:'1.5rem' }}>
            {laneList.map(lane => (
              <button key={lane} className={`filter-pill${filter === lane ? ' active' : ''}`}
                onClick={() => { setFilter(lane); setSelected(null) }}
              >{lane}</button>
            ))}
          </div>

          {/* ════ GLOBE MAP ════ */}
          <div className="globe-card">
            <div className="globe-header">
              <span style={{ fontSize:'0.68rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em' }}>
                / 3d globe · globe.gl · india shipment lanes
              </span>
              <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <span style={{ fontSize:'0.65rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--page-accent)' }}>
                  ● Drag to rotate · Scroll to zoom
                </span>
                <span style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:5, fontFamily:"'JetBrains Mono',monospace", background:'rgba(var(--page-glow-rgb),0.1)', border:'1px solid rgba(var(--page-glow-rgb),0.3)', color:'var(--page-accent)' }}>Live</span>
              </div>
            </div>

            <GlobeMap filter={filter} />

            <div className="globe-legend">
              {ARCS.map(a => (
                <div key={a.label} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.65rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)' }}>
                  <div style={{ width:24, height:2, background:a.color, borderRadius:1, boxShadow:`0 0 6px ${a.color}` }}/>
                  {a.label}
                </div>
              ))}
            </div>
          </div>

          {/* ════ TABLE + SIDEBAR ════ */}
          <div className="content-grid">

            {/* TABLE */}
            <div className="table-card">
              <div style={{ padding:'1.1rem 1.5rem', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'0.68rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em' }}>
                  / shipments · {filtered.length} records
                </span>
                <span style={{ fontSize:'0.65rem', padding:'2px 8px', borderRadius:5, fontFamily:"'JetBrains Mono',monospace", background:'rgba(var(--page-glow-rgb),0.1)', border:'1px solid rgba(var(--page-glow-rgb),0.3)', color:'var(--page-accent)' }}>{filtered.length}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    {['ID','Route','Weight','Priority','Window','Status','Truck'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className={selected === s.id ? 'sel' : ''} onClick={() => setSelected(selected === s.id ? null : s.id)}>
                      <td>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:s._color || GROUP_COLORS[s.group] || '#6b7280', display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:7, height:7, borderRadius:'50%', background:s._color || GROUP_COLORS[s.group] || '#6b7280', display:'inline-block', boxShadow:`0 0 6px ${s._color || GROUP_COLORS[s.group] || '#6b7280'}` }}/>
                          {s.id}
                        </span>
                      </td>
                      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.75rem', color:'var(--text-secondary)' }}>{s.origin} → {s.dest}</td>
                      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.75rem', color:'var(--text-muted)' }}>{s.weight} kg</td>
                      <td>
                        <span className="badge" style={{ background:`${PRIORITY_COLORS[s.priority]}18`, border:`1px solid ${PRIORITY_COLORS[s.priority]}30`, color:PRIORITY_COLORS[s.priority] }}>{s.priority}</span>
                      </td>
                      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.72rem', color:'var(--text-muted)' }}>{s.window}</td>
                      <td>
                        <span className="badge" style={{
                          background: s.status==='Consolidated' ? 'rgba(var(--page-glow-rgb),0.1)' : 'rgba(6,182,212,0.1)',
                          border: `1px solid ${s.status==='Consolidated' ? 'rgba(var(--page-glow-rgb),0.3)' : 'rgba(6,182,212,0.3)'}`,
                          color: s.status==='Consolidated' ? 'var(--page-accent)' : '#06b6d4',
                        }}>{s.status}</span>
                      </td>
                      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:700 }}>{s.truck}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* SIDEBAR */}
            <div>

              {/* Shipment detail drawer */}
              {selShipment && (
                <div className="sidebar-card" style={{ borderColor:`${selShipment._color || GROUP_COLORS[selShipment.group] || '#6b7280'}44`, animation:'fadeSlideUp 0.3s ease forwards' }}>
                  <div className="sidebar-card-header">
                    <span style={{ fontFamily:"'Syne',sans-serif", fontSize:'1rem', fontWeight:700, color:selShipment._color || GROUP_COLORS[selShipment.group] || '#6b7280' }}>{selShipment.id}</span>
                    <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'1rem', lineHeight:1, transition:'color 0.2s' }}
                      onMouseEnter={e=>e.currentTarget.style.color='var(--page-accent)'}
                      onMouseLeave={e=>e.currentTarget.style.color='var(--text-muted)'}
                    >✕</button>
                  </div>
                  <div className="sidebar-card-body">
                    {[
                      ['Route',    `${selShipment.origin} → ${selShipment.dest}`],
                      ['Weight',   `${selShipment.weight} kg`],
                      ['Volume',   `${selShipment.volume} m³`],
                      ['Priority', selShipment.priority],
                      ['Window',   selShipment.window],
                      ['Status',   selShipment.status],
                      ['Truck',    selShipment.truck],
                      ['Group',    selShipment.group],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'0.6rem 0', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:'0.82rem' }}>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.68rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{k}</span>
                        <span style={{ color:'var(--text-secondary)' }}>{v}</span>
                      </div>
                    ))}

                    {selTruck && (
                      <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
                        <div style={{ fontSize:'0.68rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:'0.5rem' }}>Truck util</div>
                        <div style={{ background:`${selTruck.color}10`, border:`1px solid ${selTruck.color}25`, borderRadius:10, padding:'0.7rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:'0.88rem' }}>{selTruck.id}</span>
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.75rem', fontWeight:700, color:selTruck.color }}>{selTruck.util}%</span>
                          </div>
                          <div className="util-bar-wrap">
                            <div className="util-bar" style={{ width:`${selTruck.util}%`, background:`linear-gradient(90deg,${selTruck.color}88,${selTruck.color})` }}/>
                          </div>
                          <div style={{ fontSize:'0.65rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', marginTop:'0.35rem' }}>{selTruck.load}/{selTruck.cap} kg</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fleet utilization cards */}
              <div className="sidebar-card">
                <div className="sidebar-card-header">
                  <span style={{ fontSize:'0.68rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em' }}>/ fleet utilization</span>
                </div>
                <div className="sidebar-card-body" style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  {truckList.map(t => (
                    <div key={t.id}
                      style={{ background:'rgba(255,255,255,0.02)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', transition:'all 0.2s' }}
                    >
                      <div
                        onClick={() => setSelected(selected === t.id ? null : t.id)}
                        style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.9rem 1rem', cursor:'pointer' }}
                        onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                      >
                        <div style={{ width:8, height:8, borderRadius:'50%', background:t.color, boxShadow:`0 0 6px ${t.color}`, flexShrink:0 }}/>
                        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:'0.88rem', fontWeight:700, flex:1 }}>{t.id}</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'0.75rem', fontWeight:700, color:t.color }}>{t.util}%</div>
                        <div style={{ color:'var(--text-muted)', fontSize:'0.7rem', marginLeft:4 }}>{selected === t.id ? '▲' : '▼'}</div>
                      </div>
                      {selected === t.id && (
                        <div style={{ padding:'0 1rem 1rem', borderTop:'1px solid var(--border)' }}>
                          <div className="util-bar-wrap" style={{ margin:'0.75rem 0 0.5rem' }}>
                            <div className="util-bar" style={{ width:`${t.util}%`, background:`linear-gradient(90deg,${t.color}88,${t.color})` }}/>
                          </div>
                          <div style={{ fontSize:'0.68rem', fontFamily:"'JetBrains Mono',monospace", color:'var(--text-muted)', marginBottom:'0.75rem' }}>{t.route} · {t.load}/{t.cap} kg</div>
                          <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
                            {t.shipments.map(sid => (
                              <span key={sid}
                                style={{ fontSize:'0.6rem', padding:'2px 6px', borderRadius:4, fontFamily:"'JetBrains Mono',monospace", background:`${t.color}15`, border:`1px solid ${t.color}30`, color:t.color, cursor:'pointer' }}
                                onClick={e=>{ e.stopPropagation(); setSelected(sid) }}
                              >{sid}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}