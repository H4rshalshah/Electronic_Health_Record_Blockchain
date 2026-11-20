# Setup and run guide (WSL2 and Ubuntu)

How to get the whole EHR Blockchain system running from a fresh machine, on
either **Windows with WSL2** or **native Ubuntu** (22.04 or 24.04).

The steps in Parts 1 and 2 differ by platform. Parts 3 onward are identical.

> Status note: these steps follow the scripts in this repository. The latest
> integration changes (root `.env`, DigiLocker service) have been tested with
> unit tests and builds but not yet on a live network, so treat the first run
> as a verification run and use the troubleshooting table in Part 8.

---

## What you need

| Requirement | Minimum |
| --- | --- |
| RAM | 8 GB (16 GB recommended; about 25 containers run) |
| Free disk | 15 GB |
| Docker Engine + Compose plugin v2 | Docker 24 or newer |
| Node.js and npm | Node 20 or newer (22 recommended) |
| Tools | `git`, `curl`, `jq` |
| Ports free | 80, 3000-3006, 4001-4007, 4010, 5001, 5173-5176, 7050-7057, 8000, 8051, 8090, 9051, 10051, 11051 |

The Fabric command-line tools (`peer`, `configtxgen`, `osnadmin`,
`fabric-ca-client`) are already in the repository's `bin/` folder as Linux
x86-64 binaries; the scripts add that folder to `PATH` themselves.

---

## Part 1A — Windows: prepare WSL2

Skip to Part 1B if you are on native Ubuntu.

1. **Install WSL2 with Ubuntu.** Open PowerShell as Administrator:

   ```powershell
   wsl --install -d Ubuntu-22.04
   ```

   Restart when asked, then open "Ubuntu" from the Start menu and create your
   Linux username and password.

2. **Confirm it is WSL version 2.**

   ```powershell
   wsl -l -v
   ```

   The VERSION column must show `2`. If it shows `1`, run
   `wsl --set-version Ubuntu-22.04 2`.

3. **Install Docker Desktop for Windows** and enable the WSL integration:
   Docker Desktop → Settings → General → tick *Use the WSL 2 based engine*;
   then Settings → Resources → WSL Integration → enable it for
   `Ubuntu-22.04` → Apply & Restart.

4. **Give WSL enough memory.** Create or edit `C:\Users\<you>\.wslconfig`:

   ```ini
   [wsl2]
   memory=8GB
   processors=4
   ```

   Then run `wsl --shutdown` in PowerShell and reopen Ubuntu.

5. **Work inside the Linux filesystem, not on `C:`.** Running the project from
   `/mnt/c/...` is very slow and breaks file permissions on the Fabric
   certificates. Put the project in your Linux home folder:

   ```bash
   mkdir -p ~/projects && cd ~/projects
   # Option A: clone fresh (recommended; line endings are handled for you)
   git clone <your repository URL> Electronic_Health_Record_Blockchain
   # Option B: copy your existing Windows folder
   cp -r "/mnt/c/Users/<you>/Desktop/pbl/Electronic_Health_Record_Blockchain" .
   ```

   If you used Option B, fix Windows line endings and permissions once:

   ```bash
   cd ~/projects/Electronic_Health_Record_Blockchain
   sudo apt-get update && sudo apt-get install -y dos2unix
   find . -path ./node_modules -prune -o -type f \( -name "*.sh" -o -name "*.yaml" -o -name "*.yml" \) -print0 | xargs -0 dos2unix -q
   chmod +x *.sh bin/* scripts/*.sh design-system/sync.sh
   find orgs -name "*.sh" -exec chmod +x {} +
   ```

All remaining commands are typed in the **Ubuntu (WSL) terminal**. Open the
portals in your normal Windows browser at `http://localhost:...`.

---

## Part 1B — Native Ubuntu: install Docker

Skip if you are on WSL with Docker Desktop.

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

**Log out and log back in** (or reboot) so the group change takes effect, then
get the project:

```bash
mkdir -p ~/projects && cd ~/projects
git clone <your repository URL> Electronic_Health_Record_Blockchain
```

---

## Part 2 — Common tools (both platforms)

```bash
# Node.js 22 and the small tools
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git curl jq

# Check everything
docker --version && docker compose version
docker ps                 # must work WITHOUT sudo
node -v && npm -v && jq --version
```

If `docker ps` says permission denied: on Ubuntu, log out and in again; on WSL,
check that Docker Desktop is running and WSL integration is enabled.

---

## Part 3 — One-time project setup

```bash
cd ~/projects/Electronic_Health_Record_Blockchain

# 1. Create .env with generated secrets (safe to run again at any time)
node scripts/init-env.js

# 2. Install dependencies and pull Docker images (takes several minutes)
./setup.sh
```

`init-env.js` prints an `ACTION:` line for anything you must supply yourself.
For a normal local run nothing is required:

| Variable in `.env` | When you need it |
| --- | --- |
| `GEMINI_API_KEY` | Optional. Enables Gemini for lab report analysis; without it the agent is rule-based |
| `DIGILOCKER_CLIENT_ID`, `DIGILOCKER_CLIENT_SECRET` | Only if you set `DIGILOCKER_MODE=live`. Leave empty for the built-in sandbox |

---

## Part 4 — Create the blockchain network (first time only)

Do this once per machine. It creates the certificate authorities, all
identities, the orderer, five peers, IPFS and the channel `ehrchannel`.

```bash
cd ~/projects/Electronic_Health_Record_Blockchain/orgs/hospital/EHR_hospitalOrg-main/ehr-network
bash scripts/network-up.sh
```

Wait for the final status summary. Then install the smart contract:

```bash
bash scripts/deployChaincode.sh --channel ehrchannel --chaincode-name ehr \
  --chaincode-path ../ehr-chaincode-v3 --version 1.0 --sequence 1
```

Return to the project root:

```bash
cd ~/projects/Electronic_Health_Record_Blockchain
```

> **Already had a network from before?** Do not run `network-up.sh` again (it
> recreates identities). Only upgrade the contract so the new
> `DigiLockerContract` is included: run `deployChaincode.sh` with a new
> `--version` (for example `3.1`) and `--sequence` set to the current sequence
> plus one. See `orgs/digilocker/README.md`.

---

## Part 5 — Start the applications

```bash
./start.sh            # add --build the first time or after changing a Dockerfile
```

The script starts, in order: certificate authorities, peers and orderer,
hospital and patient services (including DigiLocker and the clinical AI
agent), the dashboard, the pharmacy services, and the Nginx gateway. It ends
with a table of every service and its address.

The first start is slow because each container installs its own npm packages.
Watch progress with:

```bash
docker compose --profile dashboard ps
docker compose logs -f h-peer0-api      # Ctrl+C to stop following
```

---

## Part 6 — Check that it is running

### Health checks

```bash
for u in 4001 4002 4003 4004 4005 4006 4007 4010; do
  printf "%s -> " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:$u/health"
done
curl -s -o /dev/null -w "lab 3006 -> %{http_code}\n"      http://localhost:3006/api/health
curl -s -o /dev/null -w "ai 8000 -> %{http_code}\n"       http://localhost:8000/health
curl -s -o /dev/null -w "pharmacy 3000 -> %{http_code}\n" http://localhost:3000/health
```

Every line should end in `200`.

### Open the portals

| Portal | Address |
| --- | --- |
| Workspace hub (start here) | http://localhost/ |
| Hospital portal | http://localhost:5173 |
| Patient portal | http://localhost:5174 |
| Observability dashboard | http://localhost/dashboard/ |
| Lab deck | http://localhost/lab/ |
| Pharmacy hub | http://localhost:5175 |
| Pharmacy manager / employee / inventory / patient / billing | http://localhost:3001 to :3005 |
| IPFS gateway | http://localhost:8090/ipfs/&lt;CID&gt; |

### Demo logins (hospital portal)

| Role | Username | Password |
| --- | --- | --- |
| Receptionist | `receptionist` | `recpw` |
| Doctor | `doctor` | `docpw` |
| Nurse | `nurse` | `nursepw` |
| Pharmacist | `pharmacist` | `pharmpw` |
| Records officer | `medrecordofficer` | `medpw` |
| Hospital admin | `hospitaladmin` | `hadminpw` |

These are local demo accounts only. Change them before any shared use.

### First test

1. Log in as **receptionist**, register a patient, note the patient ID, open a visit.
2. Log in as **nurse**, record vitals.
3. Log in as **doctor**, add notes and a prescription, finalise the visit.
4. In the **patient portal**, create an account with the patient ID and view the visit.
5. In the patient portal open **DigiLocker Vault**, link (sandbox), pull a document, verify it.
6. Open the **dashboard** and confirm new blocks and events appear.

---

## Part 7 — Daily use

```bash
cd ~/projects/Electronic_Health_Record_Blockchain

./start.sh     # start everything (keeps all data)
./stop.sh      # stop everything (keeps identities, ledger and volumes)
```

Useful commands:

```bash
docker compose --profile dashboard ps            # what is running
docker compose logs --tail 80 <service>          # read one service's log
docker compose restart <service>                 # restart one service
docker compose up -d --build <service>           # rebuild one service
```

On WSL, start Docker Desktop first each time you boot Windows.

### Run the automated tests

```bash
( cd orgs/digilocker/backend && npm install && npm test )
( cd orgs/hospital/EHR_hospitalOrg-main/ehr-chaincode-v3 && npm install && node --test test/digilockerContract.test.js )
( cd orgs/lab/EHR-LABORG-main/client/node-gateway && npm install && node --test tests/workflow-safety.test.js )
( cd orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api && npm install && npm test )
```

### Start again from nothing

This **destroys the ledger and every identity**. Use only when you want a
clean network.

```bash
./stop.sh
cd orgs/hospital/EHR_hospitalOrg-main/ehr-network
bash scripts/network-down.sh
cd ~/projects/Electronic_Health_Record_Blockchain
# then repeat Part 4 and Part 5
```

---

## Part 8 — Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `JWT_SECRET is not set. Run: node scripts/init-env.js` | `.env` missing | Run `node scripts/init-env.js` |
| `permission denied while trying to connect to the Docker daemon` | User not in the `docker` group, or Docker Desktop not running | Ubuntu: `sudo usermod -aG docker $USER`, log out and in. WSL: start Docker Desktop, enable WSL integration |
| `bad interpreter: /usr/bin/env: 'bash\r'` | Windows line endings in scripts | Run the `dos2unix` commands in Part 1A step 5 |
| `Permission denied` running `./start.sh` or a file in `bin/` | Execute bit lost when copying from Windows | Run the `chmod` commands in Part 1A step 5 |
| `start.sh` says Fabric identity material was not found | Network never created on this machine | Do Part 4 |
| `port is already allocated` | Another program uses the port | `sudo lsof -i :<port>` to find it; stop it or stop the old containers with `./stop.sh` |
| An API log shows `MSP for '<role>' incomplete` | Identities not enrolled or folder copied without keys | Recreate the network (Part 7, start again from nothing) |
| DigiLocker pull fails with an error naming `DigiLockerContract` | Chaincode on the channel is older than the code | Upgrade the chaincode (note in Part 4) |
| IPFS calls return 401 | A service has an old `.env` with a different key | Delete that service's `.env`, run `node scripts/init-env.js`, restart the service |
| Dashboard not started | `dashboard-api/.env` missing | Run `node scripts/init-env.js`, then `./start.sh` |
| Containers killed or very slow on WSL | Too little memory, or project on `/mnt/c` | Raise memory in `.wslconfig`; move the project into `~/projects` |
| `network ehr_network not found` | Shared Docker network missing | `docker network create ehr_network`, then `./start.sh` |
| Portal opens but shows "API unreachable" | Backend still installing packages | Wait, then check `docker compose logs <service>` |

If a problem is not in this table, collect the output of
`docker compose --profile dashboard ps` and the last 80 log lines of the
failing service before asking for help.
