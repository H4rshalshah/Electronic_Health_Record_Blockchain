# Current System Architecture

This document describes the complete multi-organization, multi-agent, and blockchain architecture of the Electronic Health Record (EHR) Consortium workspace. It details the runtime topology, communication flows, trust boundaries, and agentic pipelines across all 20 containerized services.

---

## 1. High-Level Consortium Architecture

```mermaid
flowchart TB
  subgraph ClientLayer ["Client & Ingress Layer (Port 80)"]
    Browser["Clinicians, Patients, Admins in Browser"] --> Nginx["Nginx Reverse Proxy & API Gateway (:80)"]
    Nginx --> Hub["Workspace Hub (/)"]
    Nginx --> PatientUI["Hospital Patient Portal (/patient/ → :5174)"]
    Nginx --> DashboardUI["System Dashboard (/dashboard/ → :5176)<br/>Obsidian Glass UI & Block Inspector"]
    Nginx --> LabUI["Lab Console (/lab/ → :3006)"]
    Nginx --> PharmUI["Pharmacy Portals (/pharmacy/*)<br/>Main :5175, Mgr :3001, Emp :3002,<br/>Inv :3003, Patient :3004, Bill :3005"]
    Nginx --> AIAgentUI["Clinical AI Swagger & REST (/ai-agent/ → :8000)"]
    Browser --> HospitalUI["Hospital Staff Portal (:5173)"]
  end

  subgraph MicroservicesLayer ["Microservices & Multi-Agent Layer"]
    HospitalUI --> P0["peer0-api :4001 (Auth / Reception)"]
    HospitalUI --> P1["peer1-api :4002 (Doctor Workflows)"]
    HospitalUI --> P2["peer2-api :4003 (Nurse / Pharmacy / Records)"]
    PatientUI --> PatientAPI["patient-api :4005 (Patient Self-Service)"]
    PharmUI --> PharmAPI["p-backend :3000 (Pharmacy REST API)"]
    AIAgentUI --> AIAgent["clinical-ai-agent :8000<br/>FastAPI Medical RAG & Trend Analyzer"]
    LabUI --> LabGateway["l-node-gateway :3006"]

    subgraph LabAgenticSubsystem ["Lab Multi-Agent Subsystem"]
      LabGateway --> LabAgent["Lab Agent (lab-agent.js)<br/>Biomarker Parsing & Anomaly Flags"]
      LabGateway --> HistoryAgent["History Agent (history-agent.js)<br/>Longitudinal Trajectory Analysis"]
      LabGateway --> LabOrchestrator["Human-in-the-Loop Orchestrator<br/>orchestrator.js (Review State Machine)"]
      LabGateway --> IntegrityEngine["Ledger Integrity Rechecker<br/>4-Hour Raw-Byte SHA-256 vs Fabric"]
    end
  end

  subgraph BlockchainLayer ["Hyperledger Fabric Consortium (ehrchannel)"]
    P0 --> FabricHospital[("peer0.hospital :7051<br/>HospitalMSP")]
    P1 --> FabricDoctor[("peer1.hospital :9051<br/>HospitalMSP")]
    P2 --> FabricNurse[("peer2.hospital :10051<br/>HospitalMSP")]
    PatientAPI --> FabricHospital
    ExtOrg["extorg-api :4004"] --> FabricExt[("peer0.provider :11051<br/>ProviderMSP")]
    LabGateway --> FabricDiag[("peer0.diagnostic :8051<br/>DiagnosticsMSP")]
    OrdererNode[("orderer.example.com :7050<br/>Raft CFT Consensus")]

    FabricHospital --- OrdererNode
    FabricDoctor --- OrdererNode
    FabricNurse --- OrdererNode
    FabricExt --- OrdererNode
    FabricDiag --- OrdererNode
  end

  subgraph StorageLayer ["Decentralized & Persistent Storage"]
    IPFSService["ipfs-service :4006"] --> Kubo[("Kubo IPFS Node<br/>ipfs.ehr.local:5001 / :8090")]
    PharmAPI --> Kubo
    PharmAPI <--> PharmStore[("Pharmacy Persistent Store<br/>store.js & JSON State")]
    LabGateway --> Kubo
    IntegrityEngine -.->|Fetch Raw Bytes| Kubo
    IntegrityEngine -.->|Compare On-Chain Digests| FabricDiag
  end

  subgraph ObservabilityLayer ["Group 1 Observatory (Zero-PHI Compliant)"]
    FabricHospital -.->|Committed Block Stream| Collector["Dashboard Block Collector"]
    OrdererNode -.->|Operations /healthz :9443| HealthPoll["HTTP Health Monitor"]
    FabricHospital -.->|Operations /healthz :9444| HealthPoll
    FabricDoctor -.->|Operations /healthz :9445| HealthPoll
    FabricDiag -.->|Operations /healthz :9446| HealthPoll
    FabricExt -.->|Operations /healthz :9447| HealthPoll
    AIAgent -.->|Health /health| HealthPoll
    LabGateway -.->|Telemetry /health| HealthPoll
    PharmAPI -.->|Health /health| HealthPoll
    IPFSService -.->|Health /health| HealthPoll
    PatientAPI -.->|Health /health| HealthPoll

    Collector --> Normalizer["Zero-PHI Event Normalizer"]
    Normalizer --> NDJSONStore[("Append-Only NDJSON Cache<br/>& Checkpoint Store")]
    HealthPoll --> AggregationAPI["REST Aggregation API (:4010)"]
    NDJSONStore --> AggregationAPI
    NDJSONStore --> RealtimeWS["WebSocket /ws & SSE /stream"]
    AggregationAPI --> DashboardUI
    RealtimeWS --> DashboardUI
  end
```

---

## 2. Lab Multi-Agent Orchestration & Verification Flow

The diagnostic workflow incorporates automated intelligence agents with mandatory human clinician governance before committing records to the blockchain ledger and decentralized storage.

```mermaid
sequenceDiagram
  autonumber
  actor Tech as Lab Technician
  participant Gateway as Lab Gateway (:3006)
  participant LabAg as Lab Agent (lab-agent.js)
  participant HistAg as History Agent (history-agent.js)
  participant Orch as Orchestrator (orchestrator.js)
  actor Clinician as Reviewing Clinician
  participant IPFS as Kubo IPFS Node (:5001)
  participant Fabric as Fabric DiagnosticsMSP (:8051)
  participant Recheck as Integrity Checker (4-Hr Loop)

  Tech->>Gateway: Upload Unstructured Lab Report (JSON/Text)
  Gateway->>LabAg: Invoke Biomarker Extraction
  LabAg-->>Gateway: Parsed Biomarkers & Out-of-Range Flags
  Gateway->>HistAg: Query Longitudinal Patient Trajectory
  HistAg-->>Gateway: Trend Deltas & Chronic Marker Correlation
  Gateway->>Orch: Initialize Job (Status: PENDING_REVIEW)
  Orch-->>Clinician: Surface in Review Deck (Web Console)
  Clinician->>Orch: Review & Approve Diagnostic Packet
  Orch->>IPFS: Pin Approved Diagnostic Report
  IPFS-->>Orch: Return IPFS Multihash (CID)
  Orch->>Fabric: Invoke recordDiagnosticReport(CID, SHA256_Digest)
  Fabric-->>Orch: Transaction Committed (TxID, Block #)
  Orch-->>Gateway: Update Job (Status: APPROVED, VCAP Anchored)

  Note over Recheck,Fabric: Background 4-Hour Verification Loop
  Recheck->>Fabric: Fetch Committed Report Hashes
  Recheck->>IPFS: Fetch Raw Report Bytes
  Recheck->>Recheck: Compute SHA-256(RawBytes)
  Recheck-->>Gateway: Verify Hash Match & Update Integrity Registry
```

---

## 3. Clinical AI & Medical RAG Architecture

The `clinical-ai-agent` microservice provides autonomous medical intelligence, vital signs trend monitoring, and offline PubMed retrieval-augmented generation:

```mermaid
flowchart LR
  subgraph InputData ["Clinical Inputs"]
    VitalsInput["Patient Vital Signs<br/>(BP, HR, SpO2, Temp, Glucose)"]
    ClinicianQuery["Clinician Clinical Query<br/>(Diagnosis, Contraindication)"]
  end

  subgraph AIAgent ["Clinical AI Microservice (clinical-ai-agent :8000)"]
    FastAPIApp["FastAPI REST Interface<br/>(main.py / Pydantic v2 Schemas)"]

    subgraph RuleEngine ["Deterministic Rule Engine"]
      TrendAnalyzer["Trend Analyzer<br/>(trend_analyzer.py)"]
      GovernanceAlerts["Threshold Governance<br/>Crisis / Hypoxia / Hypoglycemia"]
    end

    subgraph RAGSubsystem ["Retrieval-Augmented Generation"]
      PubMedCorpus[("Curated PubMed Literature<br/>pubmed_articles.json")]
      RAGEngine["Hybrid RAG Engine<br/>(rag_engine.py)"]
      CitationsEngine["Scientific Citation &<br/>Confidence Scorer (High/Med/Low)"]
    end
  end

  subgraph Consumers ["Consumers & Observability"]
    HospitalDoctor["Hospital Doctor Workflow"]
    LabTechnician["Lab Diagnostic Console"]
    Observatory["Dashboard Telemetry (/health)"]
  end

  VitalsInput --> FastAPIApp
  ClinicianQuery --> FastAPIApp
  FastAPIApp --> TrendAnalyzer
  TrendAnalyzer --> GovernanceAlerts
  FastAPIApp --> RAGEngine
  PubMedCorpus --> RAGEngine
  RAGEngine --> CitationsEngine

  GovernanceAlerts --> HospitalDoctor
  CitationsEngine --> HospitalDoctor
  GovernanceAlerts --> LabTechnician
  FastAPIApp -.->|Telemetry| Observatory
```

---

## 4. Consortium Network & Port Mapping

| Component | Container Name | Host Port | Ingress Route | Technology Stack |
|:---|:---|:---:|:---|:---|
| **Reverse Proxy** | `nginx` | `80` | `/`, `/api/*` | Nginx Alpine Gateway |
| **Hospital Staff Portal** | `hospital-portal` | `5173` | `/hospital/` | Vite, React 18, CareGrid UI |
| **Hospital Patient Portal** | `patient-portal` | `5174` | `/patient/` | Vite, React 18, CareGrid UI |
| **System Dashboard UI** | `h-dashboard-portal` | `5176` | `/dashboard/` | Vite, React 18, Obsidian Glass |
| **Pharmacy Main UI** | `p-frontend` | `5175` | `/pharmacy/` | Vite, React 18 |
| **Pharmacy Sub-Portals** | `p-manager`..`p-billing` | `3001`–`3005` | `/pharmacy/*` | Vite, React 18 (Dedicated Portals) |
| **Pharmacy Patient Portal** | `p-patient` | `3004` | `/pharmacy/patient/` | Vite, React 18, Interactive Self-Gov |
| **Lab Web Console** | `l-node-gateway` | `3006` | `/lab/` | Node.js, Express, Vanilla JS |
| **Clinical AI Agent** | `clinical-ai-agent` | `8000` | `/ai-agent/` | Python 3.11, FastAPI, Pydantic v2 |
| **Hospital Peer0 API** | `h-peer0-api` | `4001` | `/api/hospital/peer0/` | Node.js, Express, Fabric Gateway |
| **Hospital Peer1 API** | `h-peer1-api` | `4002` | `/api/hospital/peer1/` | Node.js, Express, Fabric Gateway |
| **Hospital Peer2 API** | `h-peer2-api` | `4003` | `/api/hospital/peer2/` | Node.js, Express, Fabric Gateway |
| **External Org API** | `h-extorg-api` | `4004` | `/api/hospital/extorg/` | Node.js, Express, Fabric Gateway |
| **Hospital Patient API** | `h-patient-api` | `4005` | `/api/hospital/patient/` | Node.js, Express, Fabric Gateway |
| **IPFS Bridge Service** | `h-ipfs-service` | `4006` | `/api/hospital/ipfs/` | Node.js, Express, Kubo Client |
| **Dashboard API** | `h-dashboard-api` | `4010` | `/api/dashboard/` | Node.js, NDJSON, WebSocket/SSE |
| **Pharmacy Backend** | `p-backend` | `3000` | `/api/pharmacy/` | Node.js, Express, `store.js` |
| **Kubo IPFS Node** | `ipfs` | `5001`, `8090` | Direct / Internal | Kubo Go-IPFS 0.22 |
| **Fabric Peers** | `peer0.*` | `7051`–`11051` | Fabric gRPC | Hyperledger Fabric 2.5 |
| **Fabric Orderer** | `orderer.example.com` | `7050` | Fabric Raft | Hyperledger Fabric 2.5 CFT |

---

## 5. Trust, Privacy & Data Boundaries

1. **Zero-PHI Observability**:
   - The Observatory Dashboard collects blockchain transaction envelopes and node health only.
   - Raw patient identifiers, patient names, diagnoses, prescriptions, and AI narrative are strictly rejected and scrubbed by `Zero-PHI Event Normalizer`.
   - `patientIdHash` is keyed HMAC-SHA256 and only exposed in admin-scoped views.

2. **Decentralized Storage Off-Chain, Cryptographic Anchors On-Chain**:
   - Bulk clinical records, laboratory PDFs, and itemized billing invoices reside on Kubo IPFS.
   - Only cryptographic CIDs (`Qm...`) and SHA-256 byte digests are anchored immutably in Fabric smart contracts on `ehrchannel`.

3. **Autonomous Scheduled Integrity Rechecking**:
   - The Lab Gateway's background integrity checker guarantees that raw records stored in IPFS have not been altered or tampered with by verifying `SHA256(RawBytes) == OnChainDigest` every 4 hours.

4. **Multi-Organization Consensus & Role Isolation**:
   - `HospitalMSP`: Governs patient registration, visits, consultations, and inpatient prescriptions.
   - `DiagnosticsMSP`: Governs diagnostic orders, lab biomarker analysis, and human approval anchoring.
   - `ProviderMSP`: Governs claims settlement, insurance coverage, and cross-organization audits.
