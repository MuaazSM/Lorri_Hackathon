"use client"

import { useRef, useEffect } from 'react'

const ARCS = [
  { startLat:19.076,  startLng:72.8777, endLat:18.5204, endLng:73.8567, color:'#abff02', label:'G1 · V001 · Mumbai→Pune',  ids:['S001','S002','S005'] },
  { startLat:18.5204, startLng:73.8567, endLat:28.6139, endLng:77.209,  color:'#10b981', label:'G2 · V004 · Pune→Delhi',   ids:['S003','S006'] },
  { startLat:19.076,  startLng:72.8777, endLat:28.6139, endLng:77.209,  color:'#06b6d4', label:'G3 · V003 · Mumbai→Delhi', ids:['S004'] },
]

const CITIES = {
  Mumbai: { lat: 19.076,  lng: 72.8777, color: '#abff02' },
  Pune:   { lat: 18.5204, lng: 73.8567, color: '#10b981' },
  Delhi:  { lat: 28.6139, lng: 77.209,  color: '#06b6d4' },
}

function hexToRgb(hex) {
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`
}

export default function GlobeMap({ filter = 'All' }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)

  // Create globe once on mount
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

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
          .arcsData(ARCS)
          .arcStartLat(d => d.startLat).arcStartLng(d => d.startLng)
          .arcEndLat(d => d.endLat).arcEndLng(d => d.endLng)
          .arcColor(d => [d.color, d.color])
          .arcAltitude(0.25)
          .arcStroke(1.2)
          .arcDashLength(0.4).arcDashGap(0.15).arcDashAnimateTime(2200)
          .arcLabel(d => `<div style="background:#052424;border:1px solid ${d.color}55;border-radius:8px;padding:8px 12px;font-family:'Geist Mono',monospace;font-size:0.72rem;color:${d.color}">${d.label}</div>`)
          .pointsData(cityPoints)
          .pointLat(d => d.lat).pointLng(d => d.lng)
          .pointColor(d => d.color).pointAltitude(0.01).pointRadius(0.5)
          .pointLabel(d => `<div style="background:#052424;border:1px solid ${d.color}55;border-radius:6px;padding:5px 10px;font-family:'Geist Mono',monospace;font-size:0.72rem;color:${d.color}">${d.name}</div>`)
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
      if (globeRef.current) {
        globeRef.current._destructor?.()
        globeRef.current = null
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [])

  // Update arcs when filter changes (no scene rebuild)
  useEffect(() => {
    if (!globeRef.current) return
    const activeArcs = filter === 'All'
      ? ARCS
      : ARCS.filter(a => a.label.includes(filter.replace(' -> ', '→').replace(' → ', '→')))
    globeRef.current.arcsData(activeArcs)
  }, [filter])

  return <div ref={containerRef} style={{ width: '100%', height: '520px', background: '#031a1a' }} />
}
