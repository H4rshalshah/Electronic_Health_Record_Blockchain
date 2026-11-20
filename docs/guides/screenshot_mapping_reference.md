# Chaincode, Ledger and Collector Demonstration Commands

Chaincode, ledger design and dashboard event collector for a blockchain-based EHR system. Commands to run one by one on Ubuntu to show the complete work.

Himanshu · PBL, NIT Warangal · Ubuntu 22.04 / 24.04 or WSL2 · 20 November 2026

## How to use this document

- Run the steps in order, in **one terminal**. Later steps use shell variables and helper functions set by earlier ones. If you open a new terminal, run B1, B2 and B3 again and set PID, VID and LID by hand.
- No project file is changed. The helpers are typed in the terminal only; response copies go to `~/ehr-demo`, outside the project.
- The project is assumed at `~/projects/Electronic_Health_Record_Blockchain`. Change the `cd` line in A2 and B1 if yours is elsewhere.
- Rule checks use `peer chaincode query` with the identity of each role. A query runs the contract function inside the peer but never sends the result to the orderer, so a refused call proves the chaincode rule and writes nothing.
- The flow writes demo records to the local ledger (one patient and visit, plus 10 trial patients in D7). To start clean afterwards: `./stop.sh --reset`, then `./start.sh`.
- Every command was written from the chaincode, network scripts and dashboard-api code in the repository. They were not run against your live network from here, so the first full pass is the check.

### Demo accounts used

| Variable | Username | Password | Role | Signs in on |
| --- | --- | --- | --- | --- |
| REC | receptionist | recpw | receptionist | peer0-api |
| ADMIN | hospitaladmin | hadminpw | admin | peer0-api |
| DOC | doctor | docpw | doctor | peer1-api |
| PHARM | pharmacist | pharmpw | pharmacist | peer2-api |
| LABREC / LABTECH / LABSUP | labreceptionist / labtechnician / labsupervisor | recpw | laboratory roles | extorg-api |

### Screenshot map

| Report figure | Step | What it shows |
| --- | --- | --- |
| Commands box in Phase 5, and Figure 5 | A2 | Bring the network up and deploy the chaincode |
| Figure 4 | A3 | Fabric containers |
| Command output box after Figure 5 | A4 | Peer environment, channel and committed chaincode |
| Figure 5 | A5 | Chaincode is current (life cycle check) |
| Figure 6 | A6 | Enrolled identities and the role inside the certificate |
| Figure 3 | A7 | Chaincode unit tests |
| Figure 7 | C1 | Register a patient; read the world state from the peer |
| Rule-checks table (extra screenshot) | C3 | Rule checks 1: disease code and laboratory order |
| Figure 9 | C4 | Doctor changes the code with a reason; code history |
| Rule-checks table (extra screenshot) | C6 | Rule checks 2: verification of the result |
| Figure 10 | C7 | Supervisor approves; the laboratory request record |
| Figure 8 | C8 | Finalize and dispense; the DID and its entries |
| Extra screenshot (Phase 6.1) | C9 | Read-only observer identity and the statistics contract |
| Extra screenshot (collector) | D1 | Collector status against the ledger height |
| Extra screenshot (collector) | D2 | Collector stays connected: 30 checks |
| Extra screenshot (zero-PHI events) | D3 | Events carry no patient data |
| Figure 13 | D4 | Block explorer data from the collector |
| Figure 14 and the two tables after it | D5 | Ledger figures and latency from the dashboard API |
| Figures 11, 12, 13 and 14 | D6 | Dashboard pages in the browser |
| Table 6.1 | D7 | Ten trials for Table 6.1 (latency per chaincode function) |

## Part A. Network, chaincode life cycle and unit tests

### A1. Check the tools

Docker, Compose, Node.js, curl, jq and openssl must be present.

```bash
docker --version && docker compose version
node -v && jq --version && openssl version
sudo apt-get update && sudo apt-get install -y jq curl openssl
```

**Expected:** Docker 24 or newer, Node 20 or newer, jq and OpenSSL version lines.

### A2. Bring the network up and deploy the chaincode

start.sh inspects what it finds: no identities, build the network; identities but no channel, rebuild; otherwise reuse the ledger. It then runs ensure-chaincode.sh, which redeploys only when the source hash changed.

```bash
cd ~/projects/Electronic_Health_Record_Blockchain
node scripts/init-env.js
./setup.sh
./start.sh
```

**Expected:** Steps 1/5 to 5/5, the channel join and chaincode lines, then 'All services are healthy.'

**Screenshot for:** Commands box in Phase 5, and Figure 5

### A3. Fabric containers

Orderer, five peers, four CAs and the IPFS node with their ports.

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
  | grep -E 'NAMES|docker-|ipfs\.ehr'
```

**Expected:** Eleven rows: one orderer, peer0/1/2.hospital, peer0.diagnostic, peer0.provider, four CAs and ipfs.ehr.local, all 'Up'.

**Screenshot for:** Figure 4

### A4. Peer environment, channel and committed chaincode

Sets the peer CLI to act as the hospital admin on peer0.hospital, then reads the channel list, the ledger height and the committed chaincode definition.

```bash
cd ~/projects/Electronic_Health_Record_Blockchain
export PATH=$PWD/bin:$PATH
NET=$PWD/orgs/hospital/EHR_hospitalOrg-main/ehr-network
ORGS=$NET/organizations/peerOrganizations
export FABRIC_CFG_PATH=$NET/configtx CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=HospitalMSP CORE_PEER_ADDRESS=localhost:7051
H=$ORGS/hospital.example.com
export CORE_PEER_TLS_ROOTCERT_FILE=$H/peers/peer0.hospital.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=$H/users/hospitaladmin/msp
peer channel list
peer channel getinfo -c ehrchannel
peer lifecycle chaincode querycommitted -C ehrchannel -n ehr
```

**Expected:** ehrchannel in the list, the block height, and the chaincode version, sequence and the three approving organisations.

**Screenshot for:** Command output box after Figure 5

### A5. Chaincode is current (life cycle check)

Runs the same check start.sh runs. It compares the hash of index.js, package.json and lib/ with the hash saved at the last deploy and does nothing when they match.

```bash
bash $NET/scripts/ensure-chaincode.sh
cat $NET/.generated/ehr-chaincode.sha256
```

**Expected:** '[chaincode] ehr is committed at sequence N and matches the source. Nothing to do.' and the saved source hash.

**Screenshot for:** Figure 5

### A6. Enrolled identities and the role inside the certificate

Lists the users of the three organisations, then prints the role attribute that the CA embedded in each enrolment certificate.

```bash
for o in hospital diagnostic provider; do
  echo "$o: $(ls $ORGS/$o.example.com/users | tr '\n' ' ')"
done
for u in hospital/doctor hospital/nurse hospital/receptionist hospital/dashboardobserver \
         diagnostic/labtechnician diagnostic/labsupervisor provider/claimsauditor; do
  f=$ORGS/${u%/*}.example.com/users/${u#*/}/msp/signcerts/cert.pem
  printf '%-30s ' "$u"; openssl x509 -in $f -noout -text | grep -o '"role":"[a-z]*"'
done
```

**Expected:** Three lines of user names (dashboardobserver among the hospital users), then one line per identity with its role, for example "role":"doctor" and "role":"observer".

**Screenshot for:** Figure 6

### A7. Chaincode unit tests

Runs the tests against a mock stub with Node's built-in runner.

```bash
( cd orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3 && node --test test/*.test.js )
```

**Expected:** The test names and '# pass 15', '# fail 0'.

**Screenshot for:** Figure 3

## Part B. Session helpers, tokens and peer identities

### B1. Define the API helpers

Shell shortcuts for the gateway calls that drive the ledger. API points at the nginx routes.

```bash
cd ~/projects/Electronic_Health_Record_Blockchain
mkdir -p ~/ehr-demo
API=http://localhost/api/hospital
J='Content-Type: application/json'
auth()  { printf 'Authorization: Bearer %s' "$1"; }
code()  { curl -s -o /dev/null -w '%{http_code}\n' "$@"; }
login() { curl -s -X POST "$1/auth/login" -H "$J" \
            -d "{\"username\":\"$2\",\"password\":\"$3\"}" | jq -r '.data.token'; }
```

**Expected:** No output.

### B2. Log in as each staff role

Each login returns a JWT for that role.

```bash
REC=$(login $API/peer0 receptionist recpw)
ADMIN=$(login $API/peer0 hospitaladmin hadminpw)
DOC=$(login $API/peer1 doctor docpw)
PHARM=$(login $API/peer2 pharmacist pharmpw)
LABREC=$(login $API/extorg labreceptionist recpw)
LABTECH=$(login $API/extorg labtechnician recpw)
LABSUP=$(login $API/extorg labsupervisor recpw)
for t in REC ADMIN DOC PHARM LABREC LABTECH LABSUP; do
  echo "$t = $(echo "${!t}" | cut -c1-30)..."
done
```

**Expected:** Seven lines, each starting with 'eyJ'. A value of 'null' means that login failed.

### B3. Define the peer identity helpers

as switches the peer CLI to one enrolled identity. fn builds the JSON call. q evaluates it inside the peer and never writes.

```bash
as() {  # as <hospital|diagnostic|provider> <user>
  case $1 in
    hospital)   export CORE_PEER_LOCALMSPID=HospitalMSP    CORE_PEER_ADDRESS=localhost:7051 ;;
    diagnostic) export CORE_PEER_LOCALMSPID=DiagnosticsMSP CORE_PEER_ADDRESS=localhost:8051 ;;
    provider)   export CORE_PEER_LOCALMSPID=ProviderMSP    CORE_PEER_ADDRESS=localhost:11051 ;;
  esac
  export CORE_PEER_TLS_ROOTCERT_FILE=$ORGS/$1.example.com/peers/peer0.$1.example.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=$ORGS/$1.example.com/users/$2/msp
}
fn() { jq -nc --arg f "$1" '{function:$f, Args:$ARGS.positional}' --args "${@:2}"; }
q()  { peer chaincode query -C ehrchannel -n ehr -c "$1" 2>&1; }
as hospital hospitaladmin; q "$(fn CodeContract:GetTemplate)" | jq
```

**Expected:** The template pointer on the ledger: cid, version, sha256 and codeSystem.

## Part C. Ledger flow and chaincode rule checks

### C1. Register a patient; read the world state from the peer

The gateway submits RegisterPatient, InitEHR, AppendDocument and AssignProvisionalCode. The peer query then shows what the ledger holds for PATIENT:<id>.

```bash
PID="PAT-$(date +%H%M%S)"; echo "patientId = $PID"
curl -s -X POST $API/peer0/patients -H "$(auth $REC)" -H "$J" -d "{
    \"patientId\":\"$PID\", \"name\":\"Ramesh Verma\", \"age\":55, \"gender\":\"male\",
    \"bloodGroup\":\"O+\", \"contact\":\"9876543210\", \"address\":\"Hanamkonda, Warangal\",
    \"symptoms\":\"central chest pain radiating to left arm, sweating, breathlessness\"
  }" | jq '.data | {patientId, did, provisional: .intake.provisional, intakeError}'
as hospital hospitaladmin; q "$(fn PatientContract:GetPatient $PID)" | jq
```

**Expected:** The DID and provisional code, then the ledger record: patientId, did, profileCID, profileHash, visitIds, ehrCID. No name, age, contact or address.

**Screenshot for:** Figure 7

### C2. Open the visit, assign the doctor, diagnosis, prescription, laboratory order

OpenVisit, AssignDoctor, UpdateDiagnosisNotes, UpdatePrescription and ForwardToLab, which creates the LABREQ record in state REQUESTED.

```bash
VID="$PID-V1"; LID="$VID-L1"; D=$API/peer1/doctor; L=$API/extorg/lab
curl -s -X POST $API/peer0/visits -H "$(auth $REC)" -H "$J" \
  -d "{\"patientId\":\"$PID\",\"chiefComplaint\":\"chest pain on exertion\"}" \
  | jq -c '.data | {visitId, status}'
curl -s -X PUT $API/peer0/visits/$VID/doctor -H "$(auth $REC)" -H "$J" \
  -d '{"doctorId":"doctor"}' | jq -c '.data | {status, assignedDoctor}'
curl -s -X PUT $D/visits/$VID/diagnosis -H "$(auth $DOC)" -H "$J" \
  -d '{"notes":"Exertional chest pain. ECG and bloods ordered."}' | jq -c '.data | {status}'
curl -s -X PUT $D/visits/$VID/prescription -H "$(auth $DOC)" -H "$J" \
  -d '{"medications":["Aspirin 75 mg once daily"],"instructions":"After food"}' \
  | jq -c '.data | {status}'
curl -s -X PUT $D/visits/$VID/forward/lab -H "$(auth $DOC)" -H "$J" \
  -d '{"tests":["CBC"],"instructions":"Fasting sample"}' | jq -c '.data | {status}'
VCID=$(curl -s $API/peer0/visits/$VID -H "$(auth $REC)" | jq -r '.data.visitCID')
as diagnostic labreceptionist
q "$(fn LabContract:GetLabRequest $LID)" | jq -c '{labRequestId, status}'
```

**Expected:** Status OPEN, WITH_DOCTOR, WITH_DOCTOR, WITH_DOCTOR, WITH_LAB, then the lab request in state REQUESTED.

### C3. Rule checks 1: disease code and laboratory order

Each call is evaluated inside the peer with the named identity and is refused by the chaincode. The last line is the gateway's template check.

```bash
echo '1 receptionist calls UpdateDiseaseCode:'
as hospital receptionist
q "$(fn CodeContract:UpdateDiseaseCode $PID I21.9 'Acute myocardial infarction' 'test' $VID)"
echo '2 doctor changes the code without a reason:'
as hospital doctor
q "$(fn CodeContract:UpdateDiseaseCode $PID I21.9 'Acute myocardial infarction' '' $VID)"
echo '3 doctor sends a value that is not an ICD-10 code:'
q "$(fn CodeContract:UpdateDiseaseCode $PID NOTACODE 'x' 'test reason' $VID)"
echo '4 technician submits a result before the sample is acknowledged:'
as diagnostic labtechnician
q "$(fn LabContract:SubmitLabResult $VID $LID $VCID $(printf 'a%.0s' $(seq 1 64)))"
echo '5 nurse calls a doctor-only function:'
as hospital nurse
q "$(fn ClinicalContract:UpdatePrescription $VID $VCID)"
echo '6 code outside the published template (gateway check):'
curl -s -X PUT $D/visits/$VID/disease-code -H "$(auth $DOC)" -H "$J" \
  -d '{"code":"Z99.9","reason":"test reason"}' | jq -c .
```

**Expected:** 1 'Access denied: role receptionist not permitted'; 2 'A reason is required when changing the code'; 3 'is not a valid ICD-10 code'; 4 'is REQUESTED; this step needs ACKNOWLEDGED or REJECTED'; 5 'Access denied: role nurse not permitted'; 6 'not in the published template'.

**Screenshot for:** Rule-checks table (extra screenshot)

### C4. Doctor changes the code with a reason; code history

UpdateDiseaseCode appends a CHANGED entry. Nothing is overwritten.

```bash
curl -s -X PUT $D/visits/$VID/disease-code -H "$(auth $DOC)" -H "$J" \
  -d '{"code":"I21.9","reason":"ECG changes and positive troponin"}' \
  | jq -c '.data | {currentCode, status}'
curl -s $API/peer0/patients/$PID/disease-code -H "$(auth $REC)" \
  | jq '.data | {currentCode, currentName, status, history: [.history[] | {seq, action,
        oldCode, newCode, by, reason, templateCid, aiSuggestedCodes,
        matchesAiSuggestion, matchesProvisional}]}'
```

**Expected:** currentCode I21.9, status CONFIRMED, and a history of PROVISIONAL entries followed by one CHANGED entry with old code, new code, reason, template CID and the match flags.

**Screenshot for:** Figure 9

### C5. Laboratory: acknowledge and submit

AcknowledgeLabRequest by lab reception, SubmitLabResult by the technician with the report hash.

```bash
curl -s -X PUT $L/visits/$VID/request/$LID/acknowledge -H "$(auth $LABREC)" \
  | jq -c '.data | {status, acknowledgedBy}'
curl -s -X PUT $L/visits/$VID/request/$LID/submit -H "$(auth $LABTECH)" -H "$J" -d '{
  "specimen":"Whole blood (EDTA)", "parameters":[
    {"name":"Hemoglobin","value":"11.2","unit":"g/dL","refLow":13.0,"refHigh":17.0},
    {"name":"Platelet Count","value":"250","unit":"10^3/uL","refLow":150,"refHigh":450}]}' \
  | tee ~/ehr-demo/lab.json | jq -c '.data | {status, submittedBy, resultsHash}'
RHASH=$(jq -r '.data.report.resultsHash' ~/ehr-demo/lab.json)
VCID=$(curl -s $API/peer0/visits/$VID -H "$(auth $REC)" | jq -r '.data.visitCID')
```

**Expected:** status ACKNOWLEDGED, then RESULT_SUBMITTED with submittedBy labtechnician and a 64-character resultsHash.

### C6. Rule checks 2: verification of the result

Evaluated inside the diagnostics peer. The fourth check runs the unit test for the rule that the person who entered a result cannot verify it, even as lab admin.

```bash
echo '1 supervisor approves with a different hash:'
as diagnostic labsupervisor
q "$(fn LabContract:ApproveLabResult $VID $LID $VCID $(printf '0%.0s' $(seq 1 64)))"
echo '2 supervisor rejects without a reason:'
q "$(fn LabContract:RejectLabResult $VID $LID $VCID '')"
echo '3 technician tries to approve:'
as diagnostic labtechnician
q "$(fn LabContract:ApproveLabResult $VID $LID $VCID $RHASH)"
echo '4 separation of duties (unit test):'
( cd orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3 && \
  node --test --test-reporter=tap --test-name-pattern='cannot verify' test/labWorkflow.test.js \
  | grep -E '^(ok|not ok|# pass|# fail)' )
```

**Expected:** 1 'resultsHash does not match the submitted result'; 2 'A reason is required to reject a result'; 3 'Access denied: role labtechnician not permitted'; 4 one 'ok' line and '# pass 1', '# fail 0'.

**Screenshot for:** Rule-checks table (extra screenshot)

### C7. Supervisor approves; the laboratory request record

ApproveLabResult with the reviewed hash by a different user. The record is then read from the ledger.

```bash
curl -s -X PUT $L/visits/$VID/request/$LID/approve -H "$(auth $LABSUP)" -H "$J" \
  -d "{\"resultsHash\":\"$RHASH\"}" | jq -c '.data | {status, approvedBy, visitStatus}'
as diagnostic labsupervisor; q "$(fn LabContract:GetLabRequest $LID)" | jq
```

**Expected:** status APPROVED and visitStatus WITH_DOCTOR, then the record with acknowledgedBy, submittedBy, approvedBy (a different user), resultsHash and the times.

**Screenshot for:** Figure 10

### C8. Finalize and dispense; the DID and its entries

FinalizeVisit and DispenseMedication, then the patient's single DID with every numbered entry the chaincode appended.

```bash
curl -s -X PUT $D/visits/$VID/finalize -H "$(auth $DOC)" -H "$J" \
  -d '{"finalDiagnosis":"Acute myocardial infarction, unspecified"}' | jq -c '.data | {status}'
curl -s -X PUT $API/peer2/pharmacist/visits/$VID/dispense -H "$(auth $PHARM)" -H "$J" \
  -d '{"medicationDetails":"Aspirin 75 mg x 30"}' | jq -c '.data | {status}'
as hospital hospitaladmin; q "$(fn DidContract:GetDID $PID)" | tee ~/ehr-demo/did.json | jq
q "$(fn DidContract:ListCIDs $(jq -r '.did' ~/ehr-demo/did.json))" \
  | jq -r '.entries[] | [.seq, .type, .role, .mspId, .timestamp, .cid[0:16], .txId[0:12]] | @tsv'
```

**Expected:** VISIT_FINALIZED twice, the DID record with entryCount, then one line per entry from REGISTRATION to DISPENSE with seq, type, role, organisation, time, CID and txId.

**Screenshot for:** Figure 8

### C9. Read-only observer identity and the statistics contract

dashboardobserver can read counts with StatsContract:GetStats and cannot read a patient record.

```bash
as hospital dashboardobserver
q "$(fn StatsContract:GetStats)" | jq
q "$(fn PatientContract:GetPatient $PID)"
as hospital hospitaladmin
```

**Expected:** Counts of patients, visits by status, DIDs, documents, lab requests and code decisions, with no patient data; then 'Access denied' for the patient read.

**Screenshot for:** Extra screenshot (Phase 6.1)

## Part D. Collector, dashboard and latency

### D1. Collector status against the ledger height

The dashboard-api health route reports the collector. Its last processed block should be the ledger height minus one.

```bash
curl -s http://localhost:4010/health | jq '{dependencies, collector}'
peer channel getinfo -c ehrchannel
```

**Expected:** fabric CONNECTED, lastProcessedBlock and currentHeight, then the same height from the peer.

**Screenshot for:** Extra screenshot (collector)

### D2. Collector stays connected: 30 checks

One check every two seconds for a minute.

```bash
for i in $(seq 1 30); do
  curl -s http://localhost:4010/health | jq -r '.collector.status'; sleep 2
done | sort | uniq -c
```

**Expected:** '30 CONNECTED'.

**Screenshot for:** Extra screenshot (collector)

### D3. Events carry no patient data

Reads the latest committed-transaction events and searches all of them for the patient's name, phone and address.

```bash
E=http://localhost/api/dashboard
curl -s "$E/logs/events?type=TRANSACTION_COMMITTED&limit=100" -H "$(auth $ADMIN)" \
  | tee ~/ehr-demo/events.json | jq '.data.items[0]'
echo "events read: $(jq '.data.items | length' ~/ehr-demo/events.json)"
echo "matches for name, phone or address: $(grep -c -i -E 'Ramesh|9876543210|Hanamkonda' \
  ~/ehr-demo/events.json)"
```

**Expected:** One event with channel, txId, block number, chaincode, function name and organisation; the number of events read; and 0 matches.

**Screenshot for:** Extra screenshot (zero-PHI events)

### D4. Block explorer data from the collector

The latest blocks, one block in detail, and a transaction looked up by ID.

```bash
curl -s "$E/explorer/blocks?limit=5" -H "$(auth $ADMIN)" | tee ~/ehr-demo/blocks.json \
  | jq '.data | {total, collector: .collector.status, items}'
BN=$(jq -r '.data.items[0].blockNumber' ~/ehr-demo/blocks.json)
curl -s $E/explorer/blocks/$BN -H "$(auth $ADMIN)" | tee ~/ehr-demo/block.json | jq '.data'
TX=$(jq -r '.data.transactions[0].txId' ~/ehr-demo/block.json)
curl -s $E/explorer/transactions/$TX -H "$(auth $ADMIN)" | jq '.data'
```

**Expected:** Five blocks, then the newest block with its hashes and its transaction (function type, organisation, valid true), then the same transaction found by its ID.

**Screenshot for:** Figure 13

### D5. Ledger figures and latency from the dashboard API

The figures of the ledger table and the latency table, computed from collected blocks and from the gateways' timing events. Latency values are in milliseconds.

```bash
curl -s $E/analytics/summary -H "$(auth $ADMIN)" | tee ~/ehr-demo/summary.json | jq '.data | {
    fabric: .sources.fabric, overview,
    transactions: (.transactions | {total, committed, failed, successRate, byType,
                                    byOrganization}),
    blocks: (.blocks | {count, averageTxPerBlock, averageSizeBytes, maxSizeBytes,
                        medianIntervalSec}),
    submitToCommitMs: (.latency | {count, min, median, avg, p95, max})}'
jq -r '.data.latency.byFunction[] | [.name, .count, .min, .median, .avg, .max] | @tsv' \
  ~/ehr-demo/summary.json
```

**Expected:** Block height, patients and records, committed against failed, transactions by function and organisation, block sizes and interval, then one latency line per chaincode function.

**Screenshot for:** Figure 14 and the two tables after it

### D6. Dashboard pages in the browser

Open each address and sign in as hospitaladmin / hadminpw.

```bash
echo 'http://localhost/dashboard/overview'
echo 'http://localhost/dashboard/network'
echo 'http://localhost/dashboard/explorer'
echo 'http://localhost/dashboard/analytics'
```

**Expected:** Overview, Network, Explorer with one block opened, and Analytics.

**Screenshot for:** Figures 11, 12, 13 and 14

### D7. Ten trials for Table 6.1 (latency per chaincode function)

Paste the whole block in the same terminal. Each trial runs one full visit and then reads the submit-to-commit time of each function for that trial's time window. Takes about six minutes.

```bash
s() { curl -s -o /dev/null "$@"; }
: > ~/ehr-demo/lat.tsv
for i in $(seq 1 10); do
  P="TL-$(date +%H%M%S)-$i"; V="$P-V1"; Q="$V-L1"; T0=$(date -u +%FT%TZ)
  s -X POST $API/peer0/patients -H "$(auth $REC)" -H "$J" -d "{\"patientId\":\"$P\",
    \"name\":\"Trial Patient\",\"age\":50,\"gender\":\"male\",\"bloodGroup\":\"B+\",
    \"contact\":\"9000000000\",\"address\":\"Warangal\"}"
  s -X POST $API/peer0/visits -H "$(auth $REC)" -H "$J" -d "{\"patientId\":\"$P\"}"
  s -X PUT $API/peer0/visits/$V/doctor -H "$(auth $REC)" -H "$J" -d '{"doctorId":"doctor"}'
  s -X PUT $D/visits/$V/diagnosis -H "$(auth $DOC)" -H "$J" -d '{"notes":"trial"}'
  s -X PUT $D/visits/$V/disease-code -H "$(auth $DOC)" -H "$J" \
    -d '{"code":"I20.9","reason":"trial run"}'
  s -X PUT $D/visits/$V/forward/lab -H "$(auth $DOC)" -H "$J" -d '{"tests":["CBC"]}'
  s -X PUT $L/visits/$V/request/$Q/acknowledge -H "$(auth $LABREC)"
  curl -s -o ~/ehr-demo/t.json -X PUT $L/visits/$V/request/$Q/submit -H "$(auth $LABTECH)" \
    -H "$J" -d '{"parameters":[{"name":"Hemoglobin","value":"14.1","unit":"g/dL",
    "refLow":13,"refHigh":17}]}'
  s -X PUT $L/visits/$V/request/$Q/approve -H "$(auth $LABSUP)" -H "$J" \
    -d "{\"resultsHash\":\"$(jq -r '.data.report.resultsHash' ~/ehr-demo/t.json)\"}"
  s -X PUT $D/visits/$V/finalize -H "$(auth $DOC)" -H "$J" -d '{"finalDiagnosis":"trial"}'
  s -X PUT $API/peer2/pharmacist/visits/$V/dispense -H "$(auth $PHARM)" -H "$J" \
    -d '{"medicationDetails":"trial"}'
  sleep 3; T1=$(date -u +%FT%TZ)
  curl -s "$E/analytics/summary?from=$T0&to=$T1" -H "$(auth $ADMIN)" \
    | jq -r '.data.latency.byFunction[] | [.name, .avg] | @tsv' >> ~/ehr-demo/lat.tsv
  echo "trial $i done: $(curl -s $API/peer0/visits/$V -H "$(auth $REC)" | jq -r '.data.status')"
done
awk -F'\t' '{x=$2/1000; n[$1]++; S[$1]+=x; Q[$1]+=x*x;
      if(n[$1]==1||x<m[$1])m[$1]=x; if(n[$1]==1||x>M[$1])M[$1]=x}
  END{k=split("RegisterPatient OpenVisit UpdateDiagnosisNotes UpdateDiseaseCode ForwardToLab " \
              "SubmitLabResult ApproveLabResult DispenseMedication",f," ");
      printf "%-22s %3s %7s %7s %7s %7s\n","Function","n","Mean","StdDev","Min","Max";
      for(j=1;j<=k;j++){a=f[j]; if(!n[a]){printf "%-22s   0\n",a; continue}
        u=S[a]/n[a]; v=n[a]>1?(Q[a]-n[a]*u*u)/(n[a]-1):0; if(v<0)v=0;
        printf "%-22s %3d %7.2f %7.2f %7.2f %7.2f\n",a,n[a],u,sqrt(v),m[a],M[a]}}' \
  ~/ehr-demo/lat.tsv
```

**Expected:** Ten 'trial N done: VISIT_FINALIZED' lines, then a table with n, Mean, StdDev, Min and Max in seconds for the eight functions of Table 6.1. n should be 10 on every row.

**Screenshot for:** Table 6.1

## Part E. Stop

### E1. Stop the stack (data is kept)

Stops the containers. Identities, the ledger and the volumes stay.

```bash
./stop.sh
```

**Expected:** 'All EHR services stopped successfully.'

## If a step does not give the expected result

| What you see | Likely cause | What to do |
| --- | --- | --- |
| A token variable prints null | Gateway still installing packages, or wrong password | Wait until start.sh reports healthy, then run B2 again |
| peer: command not found | PATH not set in this terminal | Run A4 again |
| q prints a TLS or certificate error | Identity folder or peer address differs on your machine | Check the path printed by: echo $CORE_PEER_MSPCONFIGPATH; ls it; run A4 then B3 again |
| A rule check prints a JSON record instead of an error | The record was in a different state than the step expects | Run the C steps in order on a new patient (C1 makes a new PID) |
| HTTP 429 or "Too many requests" | Each gateway allows 100 requests a minute | Wait one minute and repeat |
| D1 shows NOT_CONNECTED | Dashboard started with --no-dashboard, or the observer identity is missing | bash scripts/setup-dashboard-identity.sh, then ./start.sh |
| D7 table shows n below 10 | A timing event arrived after the 3 second wait | Raise sleep 3 to sleep 6 and run D7 again |
| A5 prints "No such file" for the hash | The state file has another name on your machine | ls $NET/.generated and cat the .sha256 file there |
