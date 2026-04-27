'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import useOptimizer from '@/hooks/useOptimizer'
import { DEMO_SHIPMENTS } from '@/data/demoData'

// ── Demo mode: hardcoded data, no backend calls ──

const DEMO_SHIPMENTS_MAPPED = DEMO_SHIPMENTS.map(s => ({
  id: s.id,
  shipment_id: s.id,
  origin: s.origin,
  destination: s.destination,
  weight: s.weight,
  volume: s.volume,
  pickup_time: s.pickup_time,
  delivery_time: s.delivery_time,
  priority: s.priority,
  status: 'pending' as string,
}))

const MOCK_OPTIMIZATION_RESULT = {
  plan: {
    id: 'PLAN-001',
    created_at: '2024-01-15T10:30:00',
    status: 'OPTIMIZED',
    total_trucks: 3,
    trips_baseline: 6,
    avg_utilization: 73,
    cost_saving_pct: 44,
    carbon_saving_pct: 44,
    solver_used: 'OR_TOOLS',
    route_stats: {
      total_naive_distance_km: 94,
      total_optimized_distance_km: 85,
      total_savings_km: 9,
      total_savings_pct: 9.5,
    },
    assigned: [
      {
        vehicle_id: 'V001', vehicle_type: '20ft Container',
        shipment_ids: ['S001', 'S002', 'S005'],
        total_weight: 9100, capacity_weight: 10000,
        utilization_pct: 91, route: 'Mumbai → Pune', cost: 4500,
        stop_sequence: ['S001', 'S005', 'S002'],
        optimized_route_km: 28, naive_route_km: 31,
        route_savings_km: 3, route_savings_pct: 9.7,
      },
      {
        vehicle_id: 'V003', vehicle_type: '40ft Container',
        shipment_ids: ['S003', 'S006'],
        total_weight: 12000, capacity_weight: 18000,
        utilization_pct: 67, route: 'Mumbai → Delhi', cost: 7000,
        stop_sequence: ['S003', 'S006'],
        optimized_route_km: 35, naive_route_km: 38,
        route_savings_km: 3, route_savings_pct: 7.9,
      },
      {
        vehicle_id: 'V004', vehicle_type: 'Mini Truck',
        shipment_ids: ['S004'],
        total_weight: 2900, capacity_weight: 3000,
        utilization_pct: 97, route: 'Pune → Delhi', cost: 2000,
        stop_sequence: ['S004'],
        optimized_route_km: 22, naive_route_km: 25,
        route_savings_km: 3, route_savings_pct: 12.0,
      },
    ],
  },
  validation: {
    is_valid: true,
    summary_counts: { total_shipments: 6, error_count: 0 },
    llm_summary: 'All 6 shipments passed constraint validation. Weight and volume bounds satisfied across all lanes. Time windows are feasible for proposed consolidation groups.',
  },
  insights: {
    plan_summary: { cost_saving_pct: 44, carbon_saving_pct: 44 },
    recommendations: [
      { message: '91% utilisation on Mumbai–Pune lane by grouping S001, S002, and S005. ₹10.5k saved versus individual dispatch.' },
    ],
    llm_narrative: '91% utilisation on the Mumbai–Pune lane achieved by grouping S001, S002, and S005. ₹10.5k saved versus individual dispatch. V003 on the Delhi run is underutilised at 67% — consider demand buffering.',
  },
  relaxation: {
    is_feasible: true,
    summary_counts: { total_suggestions: 1 },
    suggestions: [
      { message: "Relaxing S003's delivery window by 45 minutes enables consolidation with S006 on the Delhi lane." },
    ],
    llm_summary: "Relaxing S003's delivery window by 45 minutes would allow consolidation with S006 on the Mumbai–Delhi lane, increasing utilisation from 32% to 67%. Estimated additional saving: ₹2.1k. No SLA breach if customer notified.",
  },
  scenario_analysis: {
    recommendations: {
      balanced: {
        winner: 'Flexible SLA',
        reason: 'Flexible SLA delivers the best cost outcome at ₹13.5k with 76% avg utilization. Strict SLA recommended only when compliance is contractually mandated. Vehicle Shortage hits 91% utilisation — ideal for peak season planning.',
      },
    },
    llm_narrative: 'Flexible SLA delivers the best cost outcome at ₹13.5k with 76% avg utilization. Strict SLA is recommended only when compliance is contractually mandated. Vehicle Shortage hits 91% utilisation — ideal for peak season planning.',
  },
  scenarios: [
    { scenario_type: 'STRICT_SLA', trucks_used: 4, total_cost: 15500, avg_utilization: 68, carbon_emissions: 58, sla_success_rate: 22 },
    { scenario_type: 'FLEXIBLE_SLA', trucks_used: 3, total_cost: 13500, avg_utilization: 76, carbon_emissions: 42, sla_success_rate: 44 },
    { scenario_type: 'VEHICLE_SHORTAGE', trucks_used: 2, total_cost: 12000, avg_utilization: 91, carbon_emissions: 35, sla_success_rate: 52 },
    { scenario_type: 'DEMAND_SURGE', trucks_used: 4, total_cost: 19000, avg_utilization: 82, carbon_emissions: 71, sla_success_rate: 18 },
  ],
  metrics: {
    before: { trips: 6, avg_utilization: 62, total_cost: 24000, carbon_kg: 1440 },
    after: { trips: 3, avg_utilization: 73, total_cost: 13500, carbon_kg: 810 },
    savings: { trips_reduced: 3, cost_saved: 10500, cost_saved_pct: 44, carbon_saved_kg: 630, carbon_saved_pct: 44 },
  },
  sensitivity: {
    binding_count: 1,
    total_trucks: 3,
    fleet_shadow_price: { shadow_price: 2100, improvement_pct: 8.5 },
    constraint_slack: [
      { vehicle_id: 'V001', weight_utilization_pct: 91, weight_binding: false, weight_slack_kg: 900 },
      { vehicle_id: 'V003', weight_utilization_pct: 67, weight_binding: false, weight_slack_kg: 6000 },
      { vehicle_id: 'V004', weight_utilization_pct: 97, weight_binding: true, weight_slack_kg: 100 },
    ],
    bottleneck: { vehicle_id: 'V004' },
    recommendations: [
      { priority: 'HIGH', message: 'V004 at 97% capacity — near binding. Consider upgrading to a larger vehicle for Pune→Delhi.' },
      { priority: 'MEDIUM', message: 'V003 has 6,000 kg slack. Consolidate additional Delhi-bound shipments to improve utilisation.' },
    ],
  },
  queue_analysis: {
    origin_queues: [
      { origin: 'Mumbai', shipments: 4, avg_wait_minutes: 45, peak_hour: '08:00-09:00' },
      { origin: 'Pune', shipments: 1, avg_wait_minutes: 20, peak_hour: '10:00-11:00' },
      { origin: 'Delhi', shipments: 1, avg_wait_minutes: 15, peak_hour: '06:00-07:00' },
    ],
    bottleneck_origin: 'Mumbai',
    recommendations: [
      { message: 'Mumbai warehouse handles 67% of outbound volume. Stagger pickup windows to reduce congestion.' },
    ],
  },
}

interface Shipment {
  id: string
  shipment_id?: string
  origin: string
  destination: string
  weight: number
  volume: number
  pickup_time: string
  delivery_time: string
  priority: string
  status: string
}

interface AppContextValue {
  shipments: Shipment[]
  shipmentsTotal: number
  shipmentsLoading: boolean
  shipmentsError: string | null
  loadShipments: (params?: Record<string, unknown>) => Promise<unknown>
  createShipment: (payload: Record<string, unknown>) => Promise<unknown>
  seedData: (params?: Record<string, unknown>) => Promise<unknown>

  optimizerLoading: boolean
  optimizerError: string | null
  optimizationResult: unknown
  runFullOptimization: (params?: Record<string, unknown>) => Promise<unknown>
  transformPlan: ReturnType<typeof useOptimizer>['transformPlan']
  runSimulation: (params?: Record<string, unknown>) => Promise<unknown>
  getMetrics: (planId: string) => Promise<unknown>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const optimizerHook = useOptimizer()

  const [shipments] = useState<Shipment[]>(DEMO_SHIPMENTS_MAPPED)
  const [optimizationResult, setOptimizationResult] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  // Simulated API calls — return demo data after a short delay
  const loadShipments = useCallback(async () => DEMO_SHIPMENTS_MAPPED, [])
  const createShipment = useCallback(async () => DEMO_SHIPMENTS_MAPPED[0], [])
  const seedData = useCallback(async () => ({ message: 'Demo mode — data pre-loaded', shipments_saved: 6 }), [])

  const runFullOptimization = useCallback(async () => {
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    setOptimizationResult(MOCK_OPTIMIZATION_RESULT)
    setLoading(false)
    return MOCK_OPTIMIZATION_RESULT
  }, [])

  const runSimulation = useCallback(async () => {
    await new Promise(r => setTimeout(r, 600))
    return { scenarios: MOCK_OPTIMIZATION_RESULT.scenarios }
  }, [])

  const getMetrics = useCallback(async () => {
    return MOCK_OPTIMIZATION_RESULT.metrics
  }, [])

  const value: AppContextValue = {
    shipments,
    shipmentsTotal: shipments.length,
    shipmentsLoading: false,
    shipmentsError: null,
    loadShipments,
    createShipment,
    seedData,

    optimizerLoading: loading,
    optimizerError: null,
    optimizationResult,
    runFullOptimization,
    transformPlan: optimizerHook.transformPlan,
    runSimulation,
    getMetrics,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export default AppContext
