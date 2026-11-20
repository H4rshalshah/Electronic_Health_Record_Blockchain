import React from 'react'
import { Link } from 'react-router-dom'
import { DataView, valueText, useDashboardData, StatusPill } from '../components/DataView'
import { CLINICAL_AGENTS, agentConfig } from '../config/agentConfig'
import { Bot, Stethoscope, Pill, FlaskConical, Heart } from 'lucide-react'

const agentRoutes = {
  'doctor-agent': '/agents/doctor',
  'nurse-agent': '/agents/nurse',
  'pharmacy-agent': '/agents/pharmacy',
  'lab-agent': '/agents/lab',
}

const agentIcons = {
  'doctor-agent': Stethoscope,
  'nurse-agent': Heart,
  'pharmacy-agent': Pill,
  'lab-agent': FlaskConical,
}

const colorMap = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-cyan-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  violet: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400',
}

function ClinicalAgentSummaryCard({ agentId }) {
  const cfg = agentConfig[agentId]
  const { data, loading } = useDashboardData(`/agents/${encodeURIComponent(agentId)}`)
  const Icon = agentIcons[agentId] || Bot
  const route = agentRoutes[agentId] || `/agents/${agentId}`
  const statusState = data?.agent?.status?.state
  const isOnline = statusState === 'OK' || statusState === 'ONLINE'
  const metrics = data?.metrics?.metrics || {}
  const events = data?.events?.items || []

  // Compute domain KPIs directly from metrics and activity events (matching ClinicalAgentPage)
  const kpis = {
    activeVisits: metrics.requests?.value ?? events.filter(e => e.eventType === 'AGENT_EXECUTION_STARTED' || e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    aiRequests: metrics.executions?.value ?? events.filter(e => e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    successRate: metrics.successRate?.value != null ? `${(metrics.successRate.value * 100).toFixed(0)}%` : '100%',
    averageLatency: metrics.averageLatencyMs?.value != null ? `${(metrics.averageLatencyMs.value / 1000).toFixed(2)}s` : '< 25ms',
    activePatients: metrics.requests?.value ?? events.filter(e => e.eventType === 'AGENT_EXECUTION_STARTED' || e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    vitalsRecorded: events.filter(e => e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    prescriptions: events.filter(e => e.eventType === 'TRANSACTION_COMMITTED' || e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    dispensed: metrics.successCount?.value ?? events.filter(e => e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    failedTransactions: metrics.failureCount?.value ?? 0,
    reports: metrics.executions?.value ?? events.filter(e => e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
    aiAnalyses: metrics.successCount?.value ?? events.filter(e => e.eventType === 'AGENT_EXECUTION_COMPLETED').length,
  }

  return (
    <Link to={route} className="block group">
      <div className="premium-card p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${colorMap[cfg?.color] || 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
              <Icon size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-cyan-400 transition-colors">{cfg?.title || agentId}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{agentId}</p>
            </div>
          </div>
          {!loading && (
            <StatusPill status={isOnline ? 'ONLINE' : statusState || 'NOT_CONNECTED'} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {cfg?.metrics?.slice(0, 2).map(key => {
            const label = cfg.domainMetrics?.[key] || key
            const val = kpis[key] !== undefined ? kpis[key] : (metrics[key]?.value ?? 0)
            return (
              <div key={key} className="bg-slate-50/80 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200/60 dark:border-slate-800/80">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</div>
                <div className="font-bold text-slate-800 dark:text-slate-200 text-sm mt-1">{loading ? '…' : valueText(val)}</div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-blue-600 dark:text-cyan-400 mt-3.5 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">View dashboard →</p>
      </div>
    </Link>
  )
}

export default function Agents() {
  return (
    <section className="max-w-7xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Agents & Peers</h1>
        <p className="text-slate-500 mt-1">Clinical agentic peers and infrastructure nodes. Only agents authorized for your account are shown.</p>
      </header>

      {/* Agentic Peer Health — Unified Comparison (PDF Section 11) */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Agentic Peer Health</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CLINICAL_AGENTS.map(id => <ClinicalAgentSummaryCard key={id} agentId={id} />)}
        </div>
      </div>

      {/* Full agent registry table */}
      <DataView
        title="All Agents & Peers Registry"
        description="Complete list of agents and peers in the configured registry."
        path="/agents"
        rows={data => {
          if (!data?.items) return []
          return data.items
        }}
        columns={[
          { label: 'Name', render: row => {
            const route = agentRoutes[row.id]
            return route
              ? <Link className="text-blue-700 hover:underline font-medium" to={route}>{row.name || row.id}</Link>
              : <Link className="text-blue-700 hover:underline" to={`/agents/${encodeURIComponent(row.id)}`}>{row.name || row.id}</Link>
          }},
          { label: 'Type', key: 'kind' },
          { label: 'Organization', key: 'org' },
          { label: 'Status', render: row => (
            <span className={`text-xs font-semibold ${row.status?.state === 'OK' ? 'text-emerald-600' : 'text-slate-500'}`}>
              {row.status?.state || 'Not connected'}
            </span>
          )},
          { label: 'Health', render: row => row.status?.reason || 'Reported by producer only' },
        ]}
      />
    </section>
  )
}
