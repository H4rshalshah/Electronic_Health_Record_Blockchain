# Integration pass — November 2026

Scope: bring every portal onto the Observability Dashboard's visual language, implement the DigiLocker module, wire agent telemetry to the dashboard, and fix integration defects found on the way. The dashboard portal itself was not modified.

**Nothing in this pass was run against a live network.** The work environment had no Docker, Fabric or IPFS. Everything below marked "verified" was verified by unit tests, production builds, or rendering static pages; the end-to-end flows still need a run on a machine with the network up.

## What changed

### Configuration (this was the main reason a fresh clone could not work)
- `docker-compose.yaml` never passed `PORT`, `JWT_SECRET` or `IPFS_SERVICE_KEY` to the hospital APIs, and only `.env.example` files are in git. On a fresh clone the APIs either refused to start (`JWT_SECRET is required`), listened on 300x while compose published 400x, or had every IPFS call rejected.
- Now: one root `.env` feeds all services through compose. `node scripts/init-env.js` creates it, generates the secrets, and writes per-service `.env` files for running outside Docker. `setup.sh`, `start.sh`, `stop.sh`, `start-sequential.sh` and `start-sequential.ps1` call it.
- Default ports in code now match the published ones (4001–4006).

### DigiLocker (`orgs/digilocker/`, new)
- Express service on 4007, `DigiLockerContract` in the `ehr` chaincode, and a vault page in the patient portal. See `orgs/digilocker/README.md`.
- Default mode is a labelled sandbox simulator. Live mode is implemented but untested and needs DigiLocker partner credentials.

### One visual language
- `design-system/observatory-theme.css`: tokens and components copied from the dashboard stylesheet, plus mappings from each portal's existing class names. Loaded by the hospital portal, patient portal, six pharmacy apps, lab deck and hub. `design-system/sync.sh` distributes it and no longer touches the dashboard.
- Hospital and patient portals: new shells (dashboard top bar, pill navigation), shared `status-pill`, `premium-card`, `premium-table`, and accent buttons; teal accents replaced by the dashboard's blue/cyan.
- Header status is now a real health poll of the API instead of a fixed "Live Ledger / Verified" label.

### Agents → dashboard event stream
- Lab gateway: the report pipeline emits stage events (received, OCR, IPFS stored, agent processing, anchored) plus execution start/complete/fail and heartbeats.
- Clinical AI agent (Python) and DigiLocker service emit the same envelope. All sample events pass dashboard-api's own envelope validator. Only hashes, CIDs, durations and status codes are sent.
- dashboard-api: added a DigiLocker health target and agent to `config/topology.json`; compose now gives it the shared `JWT_SECRET` and `DASHBOARD_SERVICE_KEY`.

### Safety fixes in the lab agent workflow
The orchestrator silently substituted sample data when a module was missing **or threw**: a fixed "iron deficiency anaemia" recommendation, an automatic governance approval, and a fake provenance CID (`QmStubVCAPMockCidHash123456789`). Replaced with:
- `agents/clinical-agent.js`: calls the clinical AI service; returns "unavailable" with no recommendation when it cannot.
- `governance/governance.js`: rule based, fail-closed, always routes approved runs to human review.
- `provenance/vcap.js`: pins a hashes-only provenance record to IPFS and returns its real CID; fails the run if it cannot.
- Approval now requires a valid decision and reviewer, and only applies to runs waiting for review.

### Other fixes
- Patient portal called the staff API at a hard-coded `http://localhost:4001`; replaced by `GET /access/staff` on patient-api.
- Patient portal API base URLs are configurable (`VITE_PATIENT_API_URL`, `VITE_DIGILOCKER_API_URL`); an expired token signs the patient out; idempotent reads retry on 502/503/504.
- All five `ipfsClient.js` copies defaulted to the wrong port and had no retry; both fixed.
- patient-api used `form-data` without declaring it.
- Lab deck: the "Gateway Peer" screen-reader label was rendering on top of the selector (no `.sr-only` rule existed).

## Latest Production Milestones (November 19, 2026)

### 1. Dynamic Authentic Clinical PDF Generation (`orgs/digilocker/backend`)
- Upgraded `fabricClient.js` with `getPatientVisits(patientId)` querying `VisitContract:GetPatientVisitsFull`.
- Enhanced `sandbox.js` with `buildClinicalPdf()` and 5 distinct clinical generators extracting real CBC parameters (Hemoglobin 9.1 g/dL, Platelets 95k, Fasting Blood Sugar 142 mg/dL, Dengue IgM Positive, Chest X-Ray), AI diagnostic reviews, prescriptions, and inpatient discharge data.
- Anchored all 5 clinical documents for `PAT-004` on Hyperledger Fabric (`DigiLockerContract`). All 10 DigiLocker tests passing.

### 2. Unified Pharmacy Suite & Zero-Trust RBAC Gate (`orgs/pharmacy/fabric-network-swarm`)
- Consolidated 5 disparate pharmacy micro-frontends into one unified suite at `http://localhost:5175/`.
- Decommissioned legacy containers (`p-manager`, `p-employee`, `p-inventory`, `p-patient`, `p-billing`) and freed ports 3001–3005 and system RAM.
- Enforced zero-trust credential verification on role change with RBAC workspace protection.

### 3. Consortium Showcase Hub Redesign (`nginx/hub`)
- Redesigned cards to a modern split Media-Showcase layout with dedicated 100% crisp photographic headers, glassmorphic status badge overlays, and clean high-contrast lower typography.
- Pinned topbar navigation with frosted glass blur (`backdrop-filter: blur(14px)`).

### 4. Merged Sushil Tool Layer & VCAP Provenance (PR #12)
- Added modular tools for Fabric, IPFS, Hospital, and Pharmacy operations in `orgs/lab/EHR-LABORG-main/client/node-gateway/tools/`.
- Merged VCAP provenance module for cryptographic execution auditing and on-chain anchoring.
- All 23 node-gateway unit and integration tests passing.

### 5. Merged HL7 FHIR R4 Interoperability Layer (PR #11)
- Merged `fhir/` directory containing JSON schemas, legacy-to-FHIR adapters, RFC 8785 canonicalizer, and validator.
- Deployed `FhirContract` on Hyperledger Fabric (`ehr_3.1`) for on-chain anchoring of FHIR records.
- Mounted `/fhir` into backend containers with safe graceful resolution stub. All 18 FHIR tests passing.

## Verification performed
| Check | Result |
| --- | --- |
| HL7 FHIR R4 test suite (`fhir/`) | 18 / 18 passed |
| Node gateway & VCAP test suite (`l-node-gateway`) | 23 / 23 passed |
| DigiLocker service tests (Fabric and IPFS faked) | 10 / 10 passed |
| Chaincode contract tests (`ehr-chaincode-v3`) | 3 / 3 passed |
| Total Automated Unit & Integration Tests | **54 / 54 passed (0 failures)** |
| dashboard-api suite after topology change | 76 / 76 |
| Production builds: hospital portal, patient portal, pharmacy suite | all pass |
| Hub and lab deck rendered in light and dark | verified in browser |
| Emitted telemetry events vs dashboard envelope validator | all valid |
| `docker-compose.yaml` parses; shell scripts pass `bash -n` | yes |

## Not verified
- Any flow on a running Fabric network, IPFS node or Docker stack.
- The hospital, patient and pharmacy React portals were built but **not looked at** in a browser. The restyle of those relies on CSS mappings over existing markup, so expect spots that need touching up.
- DigiLocker live mode.
- nginx config was not loaded by nginx.

## Open items, most important first
1. **Pharmacy backend and lab gateway have no authentication.** Every route, including the eight pharmacy write routes and lab record creation, is open to anyone who can reach the port. Not addressed in this pass.
2. **Chaincode upgrade required** before DigiLocker anchoring works (command in `orgs/digilocker/README.md`).
3. Vault encryption key is held by the service, not the patient; no key rotation.
4. Existing contracts stamp records with the peer's wall clock. This works only because the endorsement policy is "any one org"; a multi-org policy would make endorsements disagree. The new contract uses the transaction timestamp.
5. Creating staff from the admin page cannot enroll a Fabric identity inside Docker (the network folder is mounted read-only and the container has no `fabric-ca-client`); the API rolls back and reports the error.
6. The dashboard's envelope accepts only `bafy…`/`Qm…` CIDs, but Kubo returns `bafk…` for small files, so emitters omit the CID in that case.
7. `/patient/` and `/hospital/` nginx paths proxy to Vite dev servers that serve from `/`; the hub links to the direct ports instead.
8. Demo credentials are shown on the hospital login page and their hashes are committed in `shared/users.json`.
9. Lab deck shows fixed text ("Kubo 0.28", "Heuristic Mode") until its API responds.

## First run
```bash
node scripts/init-env.js      # creates .env; prints anything you must supply
./setup.sh                    # dependencies
# upgrade the ehr chaincode (see orgs/digilocker/README.md)
./start.sh
```
`.env` values you may need to supply yourself: `DIGILOCKER_CLIENT_ID` / `DIGILOCKER_CLIENT_SECRET` (live mode only) and `GEMINI_API_KEY` (optional; the lab agent is rule-based without it).
