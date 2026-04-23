'use client'

import { useState, useCallback } from 'react'
import { optimizeApi, simulateApi, metricsApi } from '@/services/api'

interface AssignedTruck {
  vehicle_id: string
  vehicle_type?: string
  shipment_ids?: string[]
  total_weight?: number
  capacity_weight?: number
  utilization_pct?: number
  route?: string
  cost?: number
  stop_sequence?: string[]
  optimized_route_km?: number
  naive_route_km?: number
  route_savings_km?: number
  route_savings_pct?: number
}

interface BackendPlan {
  id?: string
  created_at?: string
  status?: string
  total_trucks?: number
  trips_baseline?: number
  avg_utilization?: number
  cost_saving_pct?: number
  carbon_saving_pct?: number
  solver_used?: string
  route_stats?: Record<string, unknown> | null
  assigned?: AssignedTruck[]
}

interface BackendResult {
  plan?: BackendPlan
}

interface TransformedTruck {
  vehicle_id: string
  vehicle_type: string
  shipments: string[]
  total_weight: number
  capacity_weight: number
  utilization: number
  route: string
  cost: number
  stop_sequence: string[]
  optimized_route_km: number
  naive_route_km: number
  route_savings_km: number
  route_savings_pct: number
}

interface TransformedPlan {
  id: string
  created_at?: string
  status?: string
  total_trucks?: number
  trips_baseline?: number
  avg_utilization?: number
  cost_saving_pct?: number
  carbon_saving_pct?: number
  solver_used?: string
  route_stats: Record<string, unknown> | null
  trucks: TransformedTruck[]
}

export default function useOptimizer() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<unknown>(null)

  const runOptimization = useCallback(async (params: Record<string, unknown> = {}) => {
    setLoading(true)
    setError(null)
    try {
      const data = await optimizeApi.run(params)
      setResult(data)
      return data
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const runSimulation = useCallback(async (params: Record<string, unknown> = {}) => {
    setError(null)
    try {
      return await simulateApi.run(params)
    } catch (err) {
      setError((err as Error).message)
      return null
    }
  }, [])

  const getMetrics = useCallback(async (planId: string) => {
    setError(null)
    try {
      return await metricsApi.get(planId)
    } catch (err) {
      setError((err as Error).message)
      return null
    }
  }, [])

  const getPlan = useCallback(async (planId: string) => {
    setError(null)
    try {
      return await optimizeApi.getPlan(planId)
    } catch (err) {
      setError((err as Error).message)
      return null
    }
  }, [])

  // Transform backend plan.assigned[] → frontend plan.trucks[] shape
  const transformPlan = useCallback((backendResult: BackendResult): TransformedPlan | null => {
    if (!backendResult?.plan) return null
    const p = backendResult.plan
    return {
      id: p.id ?? 'PLAN-LIVE',
      created_at: p.created_at,
      status: p.status,
      total_trucks: p.total_trucks,
      trips_baseline: p.trips_baseline,
      avg_utilization: p.avg_utilization,
      cost_saving_pct: p.cost_saving_pct,
      carbon_saving_pct: p.carbon_saving_pct,
      solver_used: p.solver_used,
      route_stats: p.route_stats ?? null,
      trucks: (p.assigned || []).map(a => ({
        vehicle_id: a.vehicle_id,
        vehicle_type: a.vehicle_type ?? a.vehicle_id,
        shipments: a.shipment_ids ?? [],
        total_weight: a.total_weight ?? 0,
        capacity_weight: a.capacity_weight ?? 0,
        utilization: a.utilization_pct ?? 0,
        route: a.route ?? '',
        cost: a.cost ?? 0,
        // New route optimization fields
        stop_sequence: a.stop_sequence ?? [],
        optimized_route_km: a.optimized_route_km ?? 0,
        naive_route_km: a.naive_route_km ?? 0,
        route_savings_km: a.route_savings_km ?? 0,
        route_savings_pct: a.route_savings_pct ?? 0,
      })),
    }
  }, [])

  return {
    loading, error, result,
    runOptimization, runSimulation, getMetrics, getPlan, transformPlan,
  }
}
