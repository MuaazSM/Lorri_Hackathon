'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import useShipments from '@/hooks/useShipments'
import useOptimizer from '@/hooks/useOptimizer'

interface Shipment {
  id: string
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
  // Shipments
  shipments: Shipment[]
  shipmentsTotal: number
  shipmentsLoading: boolean
  shipmentsError: string | null
  loadShipments: (params?: Record<string, unknown>) => Promise<unknown>
  createShipment: (payload: Record<string, unknown>) => Promise<unknown>
  seedData: (params?: Record<string, unknown>) => Promise<unknown>

  // Optimization
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
  const shipmentsHook = useShipments()
  const optimizerHook = useOptimizer()

  // Shared optimization result (plan, insights, scenarios, metrics)
  const [optimizationResult, setOptimizationResult] = useState<unknown>(null)

  // Load shipments on mount
  useEffect(() => {
    shipmentsHook.loadShipments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runFullOptimization = useCallback(async (params: Record<string, unknown> = {}) => {
    const data = await optimizerHook.runOptimization(params)
    if (data) {
      setOptimizationResult(data)
      // Reload shipments (status may have changed to ASSIGNED)
      shipmentsHook.loadShipments()
    }
    return data
  }, [optimizerHook, shipmentsHook])

  const value: AppContextValue = {
    // Shipments
    shipments: shipmentsHook.shipments,
    shipmentsTotal: shipmentsHook.total,
    shipmentsLoading: shipmentsHook.loading,
    shipmentsError: shipmentsHook.error,
    loadShipments: shipmentsHook.loadShipments,
    createShipment: shipmentsHook.createShipment,
    seedData: shipmentsHook.seedData,

    // Optimization
    optimizerLoading: optimizerHook.loading,
    optimizerError: optimizerHook.error,
    optimizationResult,
    runFullOptimization,
    transformPlan: optimizerHook.transformPlan,
    runSimulation: optimizerHook.runSimulation,
    getMetrics: optimizerHook.getMetrics,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export default AppContext
