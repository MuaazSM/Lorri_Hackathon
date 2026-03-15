import { useState, useRef } from 'react'
import { uploadApi } from '@/services/api'
import toast from 'react-hot-toast'

export default function UploadZone({ onUploadComplete }) {
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const handleFile = async (file) => {
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Unsupported file type. Use .csv or .xlsx')
      return
    }

    setUploading(true)
    setResult(null)

    try {
      const data = await uploadApi.shipments(file, {
        clear_existing: true,
        auto_generate_fleet: true,
      })

      setResult(data)

      if (data.shipments_saved > 0) {
        toast.success(
          `Imported ${data.shipments_saved} shipments${data.vehicles_generated ? ` + ${data.vehicles_generated} vehicles` : ''}`,
          { duration: 4000 }
        )
        onUploadComplete?.(data)
      } else {
        toast.error(data.message || 'No valid shipments found')
      }
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <>
      <style>{`
        .upload-zone {
          border: 1px dashed rgba(var(--page-glow-rgb), 0.4);
          border-radius: 14px;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1.2rem;
          background: rgba(var(--page-glow-rgb), 0.04);
          transition: all 0.25s ease;
          cursor: pointer;
        }
        .upload-zone:hover {
          border-color: var(--page-accent);
          background: rgba(var(--page-glow-rgb), 0.08);
          box-shadow: 0 0 20px rgba(var(--page-glow-rgb), 0.15);
        }
        .upload-zone.dragging {
          border-color: var(--page-accent);
          background: rgba(var(--page-glow-rgb), 0.12);
          box-shadow: 0 0 30px rgba(var(--page-glow-rgb), 0.25);
        }
        .upload-icon {
          width: 42px; height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(var(--page-glow-rgb), 0.3);
          background: rgba(var(--page-glow-rgb), 0.08);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          color: var(--page-accent);
        }
        .upload-text-main {
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 2px;
        }
        .upload-text-sub {
          font-size: 0.7rem;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-muted);
        }
        .upload-btn {
          margin-left: auto;
          padding: 8px 20px;
          border-radius: 10px;
          border: 1px solid rgba(var(--page-glow-rgb), 0.4);
          background: rgba(var(--page-glow-rgb), 0.1);
          color: var(--page-accent);
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .upload-btn:hover {
          background: var(--page-accent);
          color: #0a0a0a;
          box-shadow: 0 0 16px rgba(var(--page-glow-rgb), 0.4);
        }
        .upload-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .upload-result {
          margin-top: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 10px;
          font-size: 0.72rem;
          font-family: 'JetBrains Mono', monospace;
        }
        .upload-result.success {
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #10b981;
        }
        .upload-result.error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #ef4444;
        }
      `}</style>

      <div
        className={`upload-zone ${uploading ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="upload-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>

        <div>
          <div className="upload-text-main">
            {uploading ? 'Uploading…' : 'Upload your shipment data'}
          </div>
          <div className="upload-text-sub">
            CSV or Excel · columns auto-detected · fleet auto-generated
          </div>
        </div>

        <button
          className="upload-btn"
          disabled={uploading}
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
        >
          {uploading ? 'Uploading…' : 'Choose File'}
        </button>
      </div>

      {result && (
        <div className={`upload-result ${result.shipments_saved > 0 ? 'success' : 'error'}`}>
          {result.shipments_saved > 0 ? '✓' : '✗'} {result.message}
          {result.columns_unmapped?.length > 0 && (
            <span style={{ display: 'block', marginTop: 4, opacity: 0.7 }}>
              Unmapped columns: {result.columns_unmapped.join(', ')}
            </span>
          )}
        </div>
      )}
    </>
  )
}