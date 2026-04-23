'use client'

import { useState, useCallback } from 'react'
import { shipmentApi } from '@/services/api'

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

interface ShipmentsResponse {
  shipments?: Shipment[]
  total?: number
}

export default function useShipments() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadShipments = useCallback(async (params: Record<string, unknown> = {}) => {
    setLoading(true)
    setError(null)
    try {
      const data = await shipmentApi.getAll(params) as ShipmentsResponse
      setShipments(data.shipments ?? [])
      setTotal(data.total ?? 0)
      return data
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const createShipment = useCallback(async (payload: Record<string, unknown>) => {
    setError(null)
    try {
      const created = await shipmentApi.create(payload)
      // Reload list after creation
      await loadShipments()
      return created
    } catch (err) {
      setError((err as Error).message)
      return null
    }
  }, [loadShipments])

  const seedData = useCallback(async (params: Record<string, unknown> = {}) => {
    setLoading(true)
    setError(null)
    try {
      const result = await shipmentApi.seed(params)
      // Reload list after seeding
      await loadShipments()
      return result
    } catch (err) {
      setError((err as Error).message)
      return null
    } finally {
      setLoading(false)
    }
  }, [loadShipments])

  return { shipments, total, loading, error, loadShipments, createShipment, seedData }
}
