import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE,
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Interceptors ──────────────────────────────────────────
api.interceptors.response.use(
  res  => res.data,
  err  => {
    const msg = err.response?.data?.detail ?? err.message ?? 'API Error'
    return Promise.reject(new Error(msg))
  }
)

// ── Shipments — POST /shipments · GET /shipments ──────────
export const shipmentApi = {
  getAll:  (params) => api.get('/shipments', { params }),
  create:  (data)   => api.post('/shipments', data),
  seed:    (params) => api.post('/dev/seed', null, { params }),
}

// ── Upload — POST /upload/shipments · POST /upload/vehicles
export const uploadApi = {
  shipments: (file, params = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    return axios.post(`${BASE}/upload/shipments`, formData, {
      params,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    }).then(res => res.data)
  },
  vehicles: (file, params = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    return axios.post(`${BASE}/upload/vehicles`, formData, {
      params,
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60_000,
    }).then(res => res.data)
  },
}

// ── Optimize — POST /optimize · GET /plan/{id} ────────────
export const optimizeApi = {
  run:     (params) => api.post('/optimize', null, { params }),
  getPlan: (id)     => api.get(`/plan/${id}`),
}

// ── Simulate — POST /simulate ─────────────────────────────
export const simulateApi = {
  run:     (params) => api.post('/simulate', null, { params }),
}

// ── Metrics — GET /metrics ────────────────────────────────
export const metricsApi = {
  get:     (planId) => api.get('/metrics', { params: { plan_id: planId } }),
}

// ── History — GET /history ────────────────────────────────
export const historyApi = {
  get:     (limit = 20) => api.get('/history', { params: { limit } }),
}

export default api