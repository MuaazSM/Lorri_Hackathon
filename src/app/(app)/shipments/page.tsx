'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { MapPin } from 'lucide-react'
import { useApp } from '@/context/AppContext'

const GlobeMap = dynamic(() => import('@/components/app/GlobeMap'), { ssr: false })
import UploadZone from '@/components/app/UploadZone'

const TRUCK_COLORS = ['#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#f97316']
const PRIORITY_COLORS: Record<string, string> = { High: '#ef4444', Medium: '#f59e0b', Low: '#6b7280' }

interface DemoShipment {
  id: string
  origin: string
  dest: string
  weight: number
  volume: number
  priority: string
  window: string
  status: string
  truck: string
  group: string
  _color?: string
}

interface DemoTruck {
  id: string
  route: string
  shipments: string[]
  util: number
  load: number
  cap: number
  color: string
}

function useCounter(target: number, duration = 1800, start = false) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    let startTime: number | null = null
    let rafId: number
    const step = (ts: number) => {
      if (!startTime) startTime = ts
      const p = Math.min((ts - startTime) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.floor(ease * target))
      if (p < 1) rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, [start, target, duration])
  return val
}

export default function ShipmentsPage() {
  const [filter, setFilter] = useState('All')
  const [selected, setSelected] = useState<string | null>(null)
  const { shipments: apiShipments, optimizationResult, loadShipments } = useApp()
  const statsRef = useRef<HTMLDivElement>(null)
  const [statsVisible, setStatsVisible] = useState(false)

  useEffect(() => {
    document.body.setAttribute('data-page', 'shipments')
    return () => { document.body.removeAttribute('data-page') }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStatsVisible(true) }, { threshold: 0.3 })
      if (statsRef.current) obs.observe(statsRef.current)
      return () => obs.disconnect()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // Map API shipments to the page's expected shape
  const liveData = useMemo(() => {
    const assignmentMap: Record<string, { truck: string; group: string; color: string }> = {}
    const trucksArr: DemoTruck[] = []
    const plan = (optimizationResult as Record<string, unknown>)?.plan as Record<string, unknown> | undefined
    const assigned = (plan?.assigned ?? []) as Array<Record<string, unknown>>
    if (assigned.length) {
      assigned.forEach((a, idx) => {
        const groupId = `G${idx + 1}`
        const color = TRUCK_COLORS[idx % TRUCK_COLORS.length]
        const shipmentIds = (a.shipment_ids ?? []) as string[]
        shipmentIds.forEach(sid => {
          assignmentMap[sid] = { truck: a.vehicle_id as string, group: groupId, color }
        })
        trucksArr.push({
          id: a.vehicle_id as string,
          route: (a.route as string) || 'N/A',
          shipments: shipmentIds,
          util: (a.utilization_pct as number) || 0,
          load: (a.total_weight as number) || 0,
          cap: (a.capacity_weight as number) || 0,
          color,
        })
      })
    }

    const shipments: DemoShipment[] = (apiShipments || []).map(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sid: string = (s as any).shipment_id || s.id
      const assign = assignmentMap[sid] || {}
      const pTime = s.pickup_time ? new Date(s.pickup_time) : null
      const dTime = s.delivery_time ? new Date(s.delivery_time) : null
      const window = pTime && dTime
        ? `${String(pTime.getHours()).padStart(2, '0')}:${String(pTime.getMinutes()).padStart(2, '0')}-${String(dTime.getHours()).padStart(2, '0')}:${String(dTime.getMinutes()).padStart(2, '0')}`
        : '-'
      const priority = s.priority ? s.priority.charAt(0).toUpperCase() + s.priority.slice(1).toLowerCase() : 'Medium'
      const status = assign.truck ? 'Consolidated' : (s.status === 'ASSIGNED' ? 'Assigned' : 'Pending')
      return {
        id: sid,
        origin: s.origin,
        dest: s.destination,
        weight: s.weight,
        volume: s.volume,
        priority,
        window,
        status,
        truck: assign.truck || '-',
        group: assign.group || '-',
        _color: assign.color || '#6b7280',
      }
    })

    const totalWeight = Math.round(shipments.reduce((sum, s) => sum + s.weight, 0))
    const avgUtil = trucksArr.length ? Math.round(trucksArr.reduce((s, t) => s + t.util, 0) / trucksArr.length) : 0
    const laneSet = new Set(shipments.map(s => `${s.origin} -> ${s.dest}`))

    return {
      shipments,
      trucks: trucksArr,
      stats: [
        { label: 'Total Shipments', raw: shipments.length, suffix: '', prefix: '' },
        { label: 'Trucks Assigned', raw: trucksArr.length, suffix: '', prefix: '' },
        { label: 'Total Weight', raw: totalWeight, suffix: 'kg', prefix: '' },
        { label: 'Avg Utilization', raw: avgUtil, suffix: '%', prefix: '' },
      ],
      lanes: ['All', ...laneSet],
    }
  }, [apiShipments, optimizationResult])

  const shipmentList = liveData.shipments
  const truckList = liveData.trucks
  const laneList = liveData.lanes
  const STATS = liveData.stats

  const c0 = useCounter(STATS[0].raw, 1400, statsVisible)
  const c1 = useCounter(STATS[1].raw, 1600, statsVisible)
  const c2 = useCounter(STATS[2].raw, 1800, statsVisible)
  const c3 = useCounter(STATS[3].raw, 1500, statsVisible)
  const counters = [c0, c1, c2, c3]

  const filtered = filter === 'All' ? shipmentList : shipmentList.filter(s => `${s.origin} -> ${s.dest}` === filter)
  const selShipment = shipmentList.find(s => s.id === selected) ?? null
  const selTruck = selShipment ? truckList.find(t => t.id === selShipment.truck) ?? null : null

  return (
    <>
      <style>{`
        .page-body { position: relative; z-index: 1; padding: 0; }
        .globe-card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; margin-bottom: 2rem; transition: border-color 0.3s, box-shadow 0.3s; }
        .globe-card:hover { border-color: rgba(var(--page-glow-rgb), 0.4); box-shadow: 0 0 40px rgba(var(--page-glow-rgb), 0.1); }
        .globe-header { padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .globe-legend { padding: 1rem 1.5rem; border-top: 1px solid var(--border); display: flex; gap: 1.5rem; flex-wrap: wrap; background: rgba(0,0,0,0.2); }
        .filter-pill { padding: 7px 18px; border-radius: 9999px; font-size: 0.72rem; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(var(--page-glow-rgb), 0.25); background: rgba(var(--page-glow-rgb), 0.06); color: var(--text-muted); }
        .filter-pill:hover { border-color: var(--page-accent); color: var(--page-accent); }
        .filter-pill.active { border: none; background: var(--page-accent); color: #0a0a0a; font-weight: 700; box-shadow: 0 0 16px rgba(var(--page-glow-rgb), 0.4); }
        .content-grid { display: grid; grid-template-columns: 1fr 340px; gap: 1.5rem; }
        .table-card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
        .table-card table { width: 100%; border-collapse: collapse; }
        .table-card th { padding: 0.75rem 1.25rem; font-size: 0.62rem; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
        .table-card td { padding: 0.9rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.82rem; }
        .table-card tr { cursor: pointer; transition: background 0.15s; }
        .table-card tr:hover td { background: rgba(var(--page-glow-rgb), 0.05); }
        .table-card tr.sel td { background: rgba(var(--page-glow-rgb), 0.08); }
        .sidebar-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; margin-bottom: 1.25rem; transition: border-color 0.3s, box-shadow 0.3s; }
        .sidebar-card:hover { border-color: rgba(var(--page-glow-rgb), 0.3); }
        .sidebar-card-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .sidebar-card-body { padding: 1rem 1.25rem; }
        .util-bar-wrap { height: 4px; border-radius: 9999px; background: rgba(255,255,255,0.05); overflow: hidden; }
        .util-bar { height: 100%; border-radius: 9999px; }
        .badge { font-size: 0.6rem; padding: 2px 7px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.06em; }
      `}</style>

      {/* HERO */}
      <section style={{ position: 'relative', zIndex: 1, width: '100%' }}>
        <div className="hero-wrap">
          <div className="hero-tag">
            <MapPin size={10} /> Live Route Visibility
          </div>
          <h1 className="hero-h1">
            <div className="blur-line">
              {['Every', 'Route.'].map((w, i) => (
                <span key={w} className="blur-word" style={{ animationDelay: `${0.12 + i * 0.09}s` }}>{w}</span>
              ))}
            </div>
            <div className="blur-line" style={{ color: 'var(--page-accent)' }}>
              {['Every', 'Shipment.'].map((w, i) => (
                <span key={w} className="blur-word" style={{ animationDelay: `${0.3 + i * 0.11}s` }}>{w}</span>
              ))}
            </div>
          </h1>
          <p className="hero-sub" style={{ opacity: 0, animation: 'fadeSlideUp 0.65s cubic-bezier(0.22,1,0.36,1) 0.5s forwards' }}>
            6 shipments across 3 lanes visualised on an interactive map with live arc routes.
          </p>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="marquee-wrap">
        <div className="marquee-track">
          {['Route Visibility', 'Mumbai . Pune . Delhi', 'Load Consolidation', '3 Active Trucks', 'OR-Tools MIP', '6 Shipments', '4,100 kg Load', '76% Utilization', 'Colour-Coded Groups', 'LangGraph Agents', 'Live Map', 'Time Windows'].flatMap((t, i) => [
            <span key={`a${i}`} className="marquee-item">{t}</span>,
            <span key={`d${i}`} className="marquee-item marquee-dot">.</span>,
          ]).concat(
            ['Route Visibility', 'Mumbai . Pune . Delhi', 'Load Consolidation', '3 Active Trucks', 'OR-Tools MIP', '6 Shipments', '4,100 kg Load', '76% Utilization', 'Colour-Coded Groups', 'LangGraph Agents', 'Live Map', 'Time Windows'].flatMap((t, i) => [
              <span key={`b${i}`} className="marquee-item">{t}</span>,
              <span key={`e${i}`} className="marquee-item marquee-dot">.</span>,
            ])
          )}
        </div>
      </div>

      {/* STATS */}
      <div className="stats-grid" ref={statsRef} style={{ opacity: statsVisible ? 1 : 0, transform: statsVisible ? 'translateY(0)' : 'translateY(28px)', transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)' }}>
        {STATS.map(({ label, suffix, prefix }, i) => (
          <div key={label} className="stat-cell">
            <div className="stat-num">{prefix}{counters[i]}{suffix}</div>
            <div className="stat-label">{label}</div>
            <div className="stat-sub">per optimized batch</div>
          </div>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="section-divider">
          <span className="section-divider-label">-- Route map . shipment table</span>
          <div className="section-divider-line" />
        </div>

        <div className="page-body">
          {/* Upload zone */}
          <div style={{ marginBottom: '1.5rem' }}>
            <UploadZone onUploadComplete={() => loadShipments()} />
          </div>

          {/* Lane filter pills */}
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {laneList.map(lane => (
              <button key={lane} className={`filter-pill${filter === lane ? ' active' : ''}`}
                onClick={() => { setFilter(lane); setSelected(null) }}
              >{lane}</button>
            ))}
          </div>

          {/* MAP PLACEHOLDER (globe.gl too heavy for SSR) */}
          <div className="globe-card">
            <div className="globe-header">
              <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                / route map . india shipment lanes
              </span>
              <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 5, fontFamily: "'JetBrains Mono',monospace", background: 'rgba(var(--page-glow-rgb),0.1)', border: '1px solid rgba(var(--page-glow-rgb),0.3)', color: 'var(--page-accent)' }}>{shipmentList.length ? 'Live' : 'No Data'}</span>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <GlobeMap filter={filter} shipments={shipmentList as any} />
            <div className="globe-legend">
              {laneList.filter(l => l !== 'All').map((lane, i) => (
                <div key={lane} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.65rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)' }}>
                  <div style={{ width: 24, height: 2, background: TRUCK_COLORS[i % TRUCK_COLORS.length], borderRadius: 1, boxShadow: `0 0 6px ${TRUCK_COLORS[i % TRUCK_COLORS.length]}` }} />
                  {lane}
                </div>
              ))}
            </div>
          </div>

          {/* TABLE + SIDEBAR */}
          <div className="content-grid">
            {/* TABLE */}
            <div className="table-card">
              <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  / shipments . {filtered.length} records
                </span>
                <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 5, fontFamily: "'JetBrains Mono',monospace", background: 'rgba(var(--page-glow-rgb),0.1)', border: '1px solid rgba(var(--page-glow-rgb),0.3)', color: 'var(--page-accent)' }}>{filtered.length}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    {['ID', 'Route', 'Weight', 'Priority', 'Window', 'Status', 'Truck'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, idx) => (
                    <tr key={s.id || idx} className={selected === s.id ? 'sel' : ''} onClick={() => setSelected(selected === s.id ? null : s.id)}>
                      <td>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: s._color || s._color || '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: s._color || s._color || '#6b7280', display: 'inline-block', boxShadow: `0 0 6px ${s._color || s._color || '#6b7280'}` }} />
                          {s.id}
                        </span>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.origin} -&gt; {s.dest}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.weight} kg</td>
                      <td>
                        <span className="badge" style={{ background: `${PRIORITY_COLORS[s.priority]}18`, border: `1px solid ${PRIORITY_COLORS[s.priority]}30`, color: PRIORITY_COLORS[s.priority] }}>{s.priority}</span>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.window}</td>
                      <td>
                        <span className="badge" style={{
                          background: s.status === 'Consolidated' ? 'rgba(var(--page-glow-rgb),0.1)' : 'rgba(6,182,212,0.1)',
                          border: `1px solid ${s.status === 'Consolidated' ? 'rgba(var(--page-glow-rgb),0.3)' : 'rgba(6,182,212,0.3)'}`,
                          color: s.status === 'Consolidated' ? 'var(--page-accent)' : '#06b6d4',
                        }}>{s.status}</span>
                      </td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{s.truck}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* SIDEBAR */}
            <div>
              {/* Shipment detail drawer */}
              {selShipment && (
                <div className="sidebar-card" style={{ borderColor: `${selShipment._color || selShipment._color || '#6b7280'}44`, animation: 'fadeSlideUp 0.3s ease forwards' }}>
                  <div className="sidebar-card-header">
                    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: '1rem', fontWeight: 700, color: selShipment._color || selShipment._color || '#6b7280' }}>{selShipment.id}</span>
                    <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}>x</button>
                  </div>
                  <div className="sidebar-card-body">
                    {([
                      ['Route', `${selShipment.origin} -> ${selShipment.dest}`],
                      ['Weight', `${selShipment.weight} kg`],
                      ['Volume', `${selShipment.volume} m3`],
                      ['Priority', selShipment.priority],
                      ['Window', selShipment.window],
                      ['Status', selShipment.status],
                      ['Truck', selShipment.truck],
                      ['Group', selShipment.group],
                    ] as const).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.82rem' }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                      </div>
                    ))}

                    {selTruck && (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>Truck util</div>
                        <div style={{ background: `${selTruck.color}10`, border: `1px solid ${selTruck.color}25`, borderRadius: 10, padding: '0.7rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                            <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: '0.88rem' }}>{selTruck.id}</span>
                            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', fontWeight: 700, color: selTruck.color }}>{selTruck.util}%</span>
                          </div>
                          <div className="util-bar-wrap">
                            <div className="util-bar" style={{ width: `${selTruck.util}%`, background: `linear-gradient(90deg,${selTruck.color}88,${selTruck.color})` }} />
                          </div>
                          <div style={{ fontSize: '0.65rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)', marginTop: '0.35rem' }}>{selTruck.load}/{selTruck.cap} kg</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fleet utilization cards */}
              <div className="sidebar-card">
                <div className="sidebar-card-header">
                  <span style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>/ fleet utilization</span>
                </div>
                <div className="sidebar-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {truckList.map(t => (
                    <div key={t.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s' }}>
                      <div
                        onClick={() => setSelected(selected === t.id ? null : t.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1rem', cursor: 'pointer' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, boxShadow: `0 0 6px ${t.color}`, flexShrink: 0 }} />
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: '0.88rem', fontWeight: 700, flex: 1 }}>{t.id}</div>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '0.75rem', fontWeight: 700, color: t.color }}>{t.util}%</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginLeft: 4 }}>{selected === t.id ? '\u25B2' : '\u25BC'}</div>
                      </div>
                      {selected === t.id && (
                        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--border)' }}>
                          <div className="util-bar-wrap" style={{ margin: '0.75rem 0 0.5rem' }}>
                            <div className="util-bar" style={{ width: `${t.util}%`, background: `linear-gradient(90deg,${t.color}88,${t.color})` }} />
                          </div>
                          <div style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-muted)', marginBottom: '0.75rem' }}>{t.route} . {t.load}/{t.cap} kg</div>
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            {t.shipments.map(sid => (
                              <span key={sid}
                                style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: 4, fontFamily: "'JetBrains Mono',monospace", background: `${t.color}15`, border: `1px solid ${t.color}30`, color: t.color, cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); setSelected(sid) }}
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
    </>
  )
}
