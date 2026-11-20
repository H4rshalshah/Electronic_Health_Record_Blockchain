import React, { useEffect, useState } from 'react'
import { fetchApi } from '../services/api'
import { Activity, Info } from 'lucide-react'

export function useDashboardData(path) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; setLoading(true); fetchApi(path).then(value => { if (active) setData(value) }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [path])
  return { data, error, loading }
}

export function StatusPill({ state, label, status }) {
  const raw = String(label || state || status || '—')
  const isOk = raw === 'OK' || raw === 'ONLINE' || raw === 'CONNECTED' || raw === 'UP' || raw === 'COMPLETED' || raw.includes('COMMITTED')
  const isDanger = raw === 'DOWN' || raw === 'ERROR' || raw === 'FAILED' || raw === 'CRITICAL'
  const pillClass = isOk ? 'is-ok' : isDanger ? 'is-danger' : 'is-warn'
  return (
    <span className={`status-pill ${pillClass}`}>
      <span className="status-pill-dot" />
      <span>{raw}</span>
    </span>
  )
}

export function DataView({ title, description, path, rows, columns, children, data: propData }) {
  const { data: fetchedData, error: fetchErr, loading: fetchLoading } = useDashboardData(propData ? null : path)
  const data = propData || fetchedData
  const error = propData ? null : fetchErr
  const loading = propData ? false : fetchLoading
  const values = rows ? rows(data) : []
  const state = data?.status?.state || 'OK'

  return (
    <section className="max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight">
          {title}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{description}</p>
      </header>

      {loading && (
        <div className="premium-card p-6 text-slate-500 dark:text-slate-400 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Connecting to live dashboard stream…</span>
        </div>
      )}

      {error && (
        <div role="alert" className="premium-card p-4 border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="premium-card px-4 py-3 flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2.5">
              <Activity size={15} className="text-blue-500" />
              <span>
                <strong className="text-slate-800 dark:text-slate-100">{state}</strong>
                {data?.status?.reason ? ` · ${data.status.reason}` : ' · Operational telemetry connected'}
                {data?.status?.mock ? ' · MOCK DATA' : ''}
              </span>
            </div>
            <StatusPill state={state} />
          </div>

          {children?.(data)}

          <div className="premium-table-wrap">
            <div className="overflow-x-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col.label}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {values.map((row, index) => (
                    <tr key={row.eventId || row.id || row.runId || index}>
                      {columns.map(col => (
                        <td key={col.label}>
                          {col.render ? col.render(row) : (
                            row[col.key] === 'OK' || row[col.key] === 'ONLINE' ? (
                              <StatusPill state={row[col.key]} />
                            ) : (
                              row[col.key] ?? '—'
                            )
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!values.length && (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                No events reported in current query buffer.
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export function eventRows(data) { return data?.items || [] }
export function valueText(value) {
  if (value == null) return '0'
  if (typeof value === 'object') {
    if (value.value != null) return String(value.value)
    if (value.state) return value.state
    return '0'
  }
  return String(value)
}
