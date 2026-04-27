"use client"

import { useRef, useEffect } from 'react'

// All Indian cities the platform supports
const CITY_COORDS = {
  Mumbai:    { lat: 19.076,  lng: 72.8777 },
  Pune:      { lat: 18.5204, lng: 73.8567 },
  Delhi:     { lat: 28.7041, lng: 77.1025 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Chennai:   { lat: 13.0827, lng: 80.2707 },
  Hyderabad: { lat: 17.3850, lng: 78.4867 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Kolkata:   { lat: 22.5726, lng: 88.3639 },
  Jaipur:    { lat: 26.9124, lng: 75.7873 },
}

const ARC_COLORS = ['#abff02', '#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#14b8a6', '#f97316']

function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

/**
 * Build arcs and city points from shipment data.
 * Groups shipments by origin->destination lane and assigns colors.
 */
function buildGlobeData(shipments) {
  if (!shipments?.length) return { arcs: [], cities: [] }

  // Group shipments by lane
  const laneMap = {}
  shipments.forEach(s => {
    const origin = s.origin
    const dest = s.dest || s.destination
    if (!origin || !dest) return
    const key = `${origin}->${dest}`
    if (!laneMap[key]) laneMap[key] = { origin, dest, ids: [] }
    laneMap[key].ids.push(s.id || s.shipment_id)
  })

  const arcs = []
  const citySet = {}

  Object.values(laneMap).forEach((lane, idx) => {
    const originCoord = CITY_COORDS[lane.origin]
    const destCoord = CITY_COORDS[lane.dest]
    if (!originCoord || !destCoord) return

    const color = ARC_COLORS[idx % ARC_COLORS.length]

    arcs.push({
      startLat: originCoord.lat,
      startLng: originCoord.lng,
      endLat: destCoord.lat,
      endLng: destCoord.lng,
      color,
      label: `${lane.origin}→${lane.dest} (${lane.ids.length})`,
      lane: `${lane.origin} -> ${lane.dest}`,
    })

    if (!citySet[lane.origin]) citySet[lane.origin] = { ...originCoord, name: lane.origin, color }
    if (!citySet[lane.dest]) citySet[lane.dest] = { ...destCoord, name: lane.dest, color }
  })

  return { arcs, cities: Object.values(citySet) }
}

export default function GlobeMap({ filter = 'All', shipments = [] }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const globeDataRef = useRef({ arcs: [], cities: [] })

  // Rebuild globe data when shipments change
  const globeData = buildGlobeData(shipments)
  globeDataRef.current = globeData

  // Create globe once on mount
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    const timer = setTimeout(() => {
      import('globe.gl').then(({ default: Globe }) => {
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''

        const { arcs, cities } = globeDataRef.current

        const g = Globe({ animateIn: true })(containerRef.current)
          .globeImageUrl('//unpkg.com/three-globe/example/img/earth-dark.jpg')
          .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
          .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')
          .width(containerRef.current.offsetWidth || 900)
          .height(520)
          .pointOfView({ lat: 22, lng: 78, altitude: 1.6 }, 0)
          .arcsData(arcs)
          .arcStartLat(d => d.startLat).arcStartLng(d => d.startLng)
          .arcEndLat(d => d.endLat).arcEndLng(d => d.endLng)
          .arcColor(d => [d.color, d.color])
          .arcAltitude(0.25)
          .arcStroke(1.2)
          .arcDashLength(0.4).arcDashGap(0.15).arcDashAnimateTime(2200)
          .arcLabel(d => `<div style="background:#052424;border:1px solid ${d.color}55;border-radius:8px;padding:8px 12px;font-family:'Geist Mono',monospace;font-size:0.72rem;color:${d.color}">${d.label}</div>`)
          .pointsData(cities)
          .pointLat(d => d.lat).pointLng(d => d.lng)
          .pointColor(d => d.color).pointAltitude(0.01).pointRadius(0.5)
          .pointLabel(d => `<div style="background:#052424;border:1px solid ${d.color}55;border-radius:6px;padding:5px 10px;font-family:'Geist Mono',monospace;font-size:0.72rem;color:${d.color}">${d.name}</div>`)
          .ringsData(cities)
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
      if (globeRef.current) {
        globeRef.current._destructor?.()
        globeRef.current = null
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [])

  // Update arcs + points when shipments or filter changes
  useEffect(() => {
    if (!globeRef.current) return
    const { arcs, cities } = globeDataRef.current
    const activeArcs = filter === 'All'
      ? arcs
      : arcs.filter(a => a.lane === filter)
    globeRef.current.arcsData(activeArcs)
    globeRef.current.pointsData(cities)
    globeRef.current.ringsData(cities)
  }, [filter, shipments])

  return <div ref={containerRef} style={{ width: '100%', height: '520px', background: '#031a1a' }} />
}
