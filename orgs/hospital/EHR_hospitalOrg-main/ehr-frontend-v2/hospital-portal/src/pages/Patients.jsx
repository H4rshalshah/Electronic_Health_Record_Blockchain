import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, Button, Input, Modal, Alert, StatusBadge, Spinner, EmptyState } from '../components/ui'
import { Users, Plus, Search, ChevronRight, User, Phone, MapPin, Droplets, RefreshCw } from 'lucide-react'
import PatientCard from '../design-system/components/PatientCard'
import PhotoUploadModal from '../design-system/components/PhotoUploadModal'

export default function PatientsPage() {
  const { api, user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch]         = useState('')
  const [patients, setPatients]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [visits, setVisits]         = useState([])
  const [loading, setLoading]       = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError]           = useState('')
  const [showRegModal, setShowRegModal] = useState(false)
  const [uploadTarget, setUploadTarget] = useState(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true); setError('')
    try {
      const res = await api().get('/patients')
      setPatients(res.data.data || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load patients from Hyperledger Fabric')
    } finally { setLoading(false) }
  }

  const selectPatient = async (p) => {
    setSelected(p); setDetailLoading(true)
    try {
      const res = await api().get(`/patients/${p.patientId}/visits/full`)
      setVisits(res.data.data || [])
    } catch { setVisits([]) }
    finally { setDetailLoading(false) }
  }

  const filtered = patients.filter(p =>
    p.patientId.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Reference 3: Counter Header ("Available Doctors 22" style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="vitalis-counter-header mb-0">
            <span>Registered Patients</span>
            <span className="count">{filtered.length}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Each patient has one ledger identity (DID); personal details are kept encrypted off the ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadAll}
            className="btn-vitalis-ghost py-2 px-3 text-xs"
            title="Refresh ledger"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowRegModal(true)}
            className="btn-vitalis-pill py-2 px-4 text-xs"
          >
            <Plus size={15} />
            <span>Register Patient</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Patient ID, ABHA number or full name..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 rounded-3xl bg-slate-100 dark:bg-slate-800/60 animate-pulse" />
          ))}
        </div>
      )}

      {/* Grid of PatientCards (Reference 3 Grid) */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center text-xs text-slate-400">
              No registered patients found. Click &quot;Register Patient&quot; to intake the first record.
            </div>
          ) : (
            filtered.map(p => (
              <PatientCard
                key={p.patientId}
                id={p.patientId}
                name={p.name}
                age={p.age}
                gender={p.gender}
                bloodGroup={p.bloodGroup || 'O+'}
                activeVisit={p.visitCount > 0}
                lastVisitDate={`${p.visitCount} visit${p.visitCount !== 1 ? 's' : ''}`}
                onAction={() => selectPatient(p)}
                actionLabel="Inspect"
              />
            ))
          )}
        </div>
      )}

      {/* Selected Patient Drawer / Detail View */}
      {selected && (
        <div className="space-y-4 pt-4 border-t border-slate-200/80 dark:border-slate-800">
          <div className="bento-card p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-sky-950/60 text-blue-600 dark:text-sky-400 flex items-center justify-center font-bold text-lg">
                  {selected.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selected.name}</h2>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {selected.patientId}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUploadTarget({ id: selected.patientId, name: selected.name })}
                  className="btn-vitalis-ghost py-1.5 px-3 text-xs"
                >
                  Upload Photo
                </button>

                {(user.role === 'receptionist' || user.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => navigate(`/open-visit?patientId=${selected.patientId}`)}
                    className="btn-vitalis-pill py-1.5 px-4 text-xs"
                  >
                    Open Clinical Visit
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <InfoTile icon={User} label="Age / Gender" value={`${selected.age} yrs · ${selected.gender}`} />
              <InfoTile icon={Droplets} label="Blood Group" value={selected.bloodGroup} />
              <InfoTile icon={Phone} label="Contact" value={selected.contact} />
              <InfoTile icon={MapPin} label="Address" value={selected.address} truncate />
            </div>
          </div>

          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-3">Encounter History ({visits.length})</h3>
            {detailLoading ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : visits.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                No encounters recorded yet for this patient.
              </div>
            ) : (
              <div className="space-y-2">
                {visits.map(v => (
                  <div
                    key={v.visitId}
                    onClick={() => navigate(`/visits/${v.visitId}`)}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{v.visitId}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {v.assignedDoctor && ` · Dr: ${v.assignedDoctor}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={v.status} />
                      <ChevronRight size={14} className="text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registration Modal */}
      <RegisterModal open={showRegModal} onClose={() => { setShowRegModal(false); loadAll() }} api={api} />

      {/* Local Photo Upload Modal */}
      <PhotoUploadModal
        isOpen={!!uploadTarget}
        targetId={uploadTarget?.id}
        targetName={uploadTarget?.name}
        onClose={() => setUploadTarget(null)}
        onPhotoSaved={() => loadAll()}
      />
    </div>
  )
}

function InfoTile({ icon: Icon, label, value, truncate }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-blue-600 dark:text-sky-400" />
        <span className="text-[11px] text-slate-400">{label}</span>
      </div>
      <p className={`text-xs font-semibold text-slate-800 dark:text-slate-200 ${truncate ? 'truncate' : ''}`}>{value || '—'}</p>
    </div>
  )
}

function RegisterModal({ open, onClose, api }) {
  const [form, setForm] = useState({
    patientId: '', name: '', age: '', gender: 'Male',
    bloodGroup: 'O+', contact: '', address: '', symptoms: ''
  })
  const [result, setResult] = useState(null)
  const [registeredPatient, setRegisteredPatient] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleClose = () => {
    setResult(null)
    setRegisteredPatient(null)
    setError('')
    setSuccess('')
    setForm({ patientId: '', name: '', age: '', gender: 'Male', bloodGroup: 'O+', contact: '', address: '', symptoms: '' })
    onClose()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    setResult(null)
    try {
      const patientPayload = { ...form, age: parseInt(form.age) }
      const res = await api().post('/patients', patientPayload, { timeout: 120000 })
      setSuccess(`Patient ${form.patientId} registered successfully.`)
      setRegisteredPatient(patientPayload)
      setResult(res.data.data)
      setForm({ patientId: '', name: '', age: '', gender: 'Male', bloodGroup: 'O+', contact: '', address: '', symptoms: '' })
    } catch (err) {
      const data = err.response?.data
      setError(data?.error || (data?.errors || []).map(x => x.msg).join('; ') || (err.response ? 'Registration failed' : 'The registration service is not reachable. Try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={result ? "Registration Complete & Symptom Analysis" : "Register New Patient"}
      size={result ? "lg" : "md"}
    >
      {result ? (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
              ✓
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white">Patient Record Anchored On Ledger</h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                <span className="font-semibold text-slate-900 dark:text-white">{registeredPatient?.name}</span> ({registeredPatient?.gender}, {registeredPatient?.age} yrs) was registered with ID <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{registeredPatient?.patientId}</span>.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50/70 dark:bg-slate-900/60 space-y-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Decentralized Identifier (DID)</span>
              <p className="font-mono text-xs text-blue-600 dark:text-sky-400 break-all select-all font-semibold mt-0.5">{result.did}</p>
            </div>

            {result.intake && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Provisional ICD-10 Code</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded text-sm">
                      {result.intake.provisional.code}
                    </span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {result.intake.provisional.name}
                    </span>
                    {!result.intake.provisional.matched && (
                      <span className="text-xs text-slate-400 italic">(general symptom template)</span>
                    )}
                  </div>
                </div>

                {result.intake.aiAnalysis?.status === 'OK' ? (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">AI Urgency Estimate:</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        result.intake.aiAnalysis.urgency === 'EMERGENCY'
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300'
                          : result.intake.aiAnalysis.urgency === 'HIGH'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                      }`}>
                        {result.intake.aiAnalysis.urgency || 'MEDIUM'}
                      </span>
                      <span className="text-[11px] text-slate-400 italic">— AI cross-reference for doctor; not a diagnosis</span>
                    </div>

                    {result.intake.aiAnalysis.summary && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-900/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                        "{result.intake.aiAnalysis.summary}"
                      </p>
                    )}

                    {result.intake.aiAnalysis.suggestedTests?.length > 0 && (
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">Suggested Investigations:</span>{' '}
                        {result.intake.aiAnalysis.suggestedTests.join(', ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400 pt-1">
                    AI triage unavailable ({result.intake.aiAnalysis?.reason || 'offline'}). Provisional code was securely anchored to ledger.
                  </p>
                )}
              </div>
            )}

            {result.intakeError && (
              <p className="text-xs text-red-600 pt-1">Ledger note: {result.intakeError}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setResult(null)
                setRegisteredPatient(null)
              }}
            >
              Register Another Patient
            </Button>
            <Button type="button" onClick={handleClose}>
              Done / Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Patient ID *" value={form.patientId} onChange={e => update('patientId', e.target.value)} placeholder="PAT-001" required />
            <Input label="Full Name *" value={form.name} onChange={e => update('name', e.target.value)} placeholder="John Doe" required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Age *" type="number" value={form.age} onChange={e => update('age', e.target.value)} min="0" max="150" required />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Gender *</label>
              <select value={form.gender} onChange={e => update('gender', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['Male','Female','Other'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Blood Group *</label>
              <select value={form.bloodGroup} onChange={e => update('bloodGroup', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                {['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <Input label="Contact *" value={form.contact} onChange={e => update('contact', e.target.value)} placeholder="9876543210" required />
          <Input label="Address *" value={form.address} onChange={e => update('address', e.target.value)} placeholder="123 Main Street, City" required />
          <div className="flex flex-col gap-1">
            <label htmlFor="reg-symptoms" className="text-sm font-medium text-slate-700 dark:text-slate-300">Symptoms *</label>
            <textarea id="reg-symptoms" rows={3} required minLength={3} maxLength={1000} value={form.symptoms}
              onChange={e => update('symptoms', e.target.value)}
              placeholder="In the patient's words, e.g. high fever for 3 days with body ache and rash"
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-slate-500">Used to assign a provisional disease code and to prepare an AI cross-reference for the doctor.</p>
          </div>
          {loading && <p className="text-xs text-slate-500" role="status">Registering on the ledger and analysing symptoms. This can take a moment.</p>}
          {error   && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button type="submit" loading={loading}>Register Patient</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
