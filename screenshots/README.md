# Screenshots Index — EHR Blockchain Report

This folder contains the demonstration screenshots named by their step codes (`A1`, `A3`, ..., `D7`). Multi-part outputs for a step are numbered as `X(1)`, `X(2)`, and so on.

---

## Complete Screenshot Mapping

| Filename | Step Code | What it Shows | Report Target / Figure |
|---|---|---|---|
| `A1.png` | **A1** | Tooling check: Docker, Docker Compose, Node.js, jq, OpenSSL versions | Prerequisites Check |
| `A3.png` | **A3** | Fabric containers (Orderer, 5 peers, 4 CAs, IPFS daemon) | **Figure 4** |
| `A4.png` | **A4** | Peer CLI: channel list, block height, committed chaincode definition | Command output box after Fig. 5 |
| `A5.png` | **A5** | Chaincode lifecycle: SHA-256 source hash integrity match | **Figure 5** |
| `A6.png` | **A6** | Enrolled identities & X.509 certificate `"role"` attributes | **Figure 6** |
| `A7.png` | **A7** | Chaincode unit test suite: 15 passing, 0 failing | **Figure 3** |
| `B1&B2.png` | **B1 & B2** | API helper functions & JWT authentication for 7 staff roles | Gateway Tokens Check |
| `B3.png` | **B3** | Peer identity CLI functions (`as`, `fn`, `q`) & ICD-10 template query | Peer CLI Setup |
| `C1.png` | **C1** | Patient registration (DID generated) & world state query (Zero-PHI) | **Figure 7** |
| `C2.png` | **C2** | Visit workflow: Assign doctor, diagnosis, prescription, lab order | Clinical Workflow States |
| `C3.png` | **C3** | Rule checks 1: RBAC refusals, missing reason & invalid ICD-10 errors | **Rule-checks table 1** |
| `C4(1).png` | **C4** | Doctor updates disease code to `I21.9` with clinical reason | **Figure 9 (Part 1)** |
| `C4(2).png` | **C4** | Complete disease code history on ledger (provisional + changed) | **Figure 9 (Part 2)** |
| `C5.png` | **C5** | Lab reception sample acknowledge & technician result submission | Lab Submission |
| `C6.png` | **C6** | Rule checks 2: Hash tamper check, rejection reason & separation of duties | **Rule-checks table 2** |
| `C7.png` | **C7** | Lab supervisor approval & complete `LABREQ` audit asset on ledger | **Figure 10** |
| `C8.png` | **C8** | Visit finalization, pharmacy dispense, and patient DID chronicle | **Figure 8** |
| `C9.png` | **C9** | Read-only observer stats query & patient record read refusal | **Extra Screenshot (Phase 6.1)** |
| `D1.png` | **D1** | Dashboard collector status matching peer channel ledger height | **Extra Screenshot (Collector)** |
| `D2.png` | **D2** | Collector connection stability: 30 continuous `CONNECTED` samples | **Extra Screenshot (Collector)** |
| `D3.png` | **D3** | Zero-PHI verification: 0 matches for patient demographics in event stream | **Extra Screenshot (Zero-PHI)** |
| `D4(1).png` | **D4** | Block explorer API: latest 5 blocks list from collector | **Figure 13 (CLI Part 1)** |
| `D4(2).png` | **D4** | Detailed block headers, dataHash, and previousHash | **Figure 13 (CLI Part 2)** |
| `D4(3).png` | **D4** | Transaction lookup by TxID with payload and `VALID` validation code | **Figure 13 (CLI Part 3)** |
| `D5(1).png` | **D5** | Ledger overview & transaction success rate from `/analytics/summary` | **Figure 14 (Overview)** |
| `D5(2).png` | **D5** | Transaction distribution by function and by organization | **Figure 14 (Tx Distribution)** |
| `D5(3).png` | **D5** | Block size statistics and median block intervals | **Figure 14 (Block Stats)** |
| `D5(4).png` | **D5** | Submit-to-commit latency statistics per chaincode function | **Figure 14 (Latency Table)** |
| `D7(1).png` | **D7** | Execution of 10 automated end-to-end patient visit trials | **Table 6.1 (Trials Progress)** |
| `D7(2).png` | **D7** | Aggregated latency benchmark table ($n=10$, Mean, StdDev, Min, Max) | **Table 6.1 (Final Table)** |

---

## Web Browser Dashboard Screenshots (Step D6)

| Filename | Equivalent Code | Page Captured | Report Target / Figure |
|---|---|---|---|
| `Overview Dashboard.png` | **D6(1)** | `http://localhost/dashboard/overview` | **Figure 11** |
| `Network Topology.png` | **D6(2)** | `http://localhost/dashboard/network` | **Figure 12** |
| `Block Explorer Page.png` | **D6(3)** | `http://localhost/dashboard/explorer` | **Figure 13 (UI)** |
| `Analytics & Performance.png` | **D6(4)** | `http://localhost/dashboard/analytics` | **Figure 14 (UI)** |
