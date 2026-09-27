# Enterprise Blockchain Electronic Health Record (EHR) System 🏥⚡

> **Decentralized Multi-Organization Healthcare Federation powered by Hyperledger Fabric v2.5, IPFS Kubo, Attribute-Based Access Control (ABAC), and Gemini Agentic AI.**

## What is this project?

The **Blockchain Electronic Health Record (EHR) System** is an enterprise-grade, federated healthcare network designed to solve the critical challenges of data fragmentation, unauthorized medical record access, single points of failure, and data tampering in traditional hospital IT systems.

It connects independent healthcare stakeholders (Hospital, Pharmacy, Lab, and Digilocker) into a single, unified Hyperledger Fabric blockchain network. The system strictly enforces Attribute-Based Access Control (ABAC) and Patient Sovereignty, meaning patients cryptographically own their data and clinicians cannot view patient records without explicit on-chain consent grants. 

## Quickstart Setup for Team Members 🚀 (Zero Dependency Hell)

We have fully dockerized this project using **GitHub Container Registry (GHCR)**. 
**You do NOT need to install Node.js or run `npm install`.** Dependencies are baked directly into pre-built cloud images, and everything routes cleanly through a single Nginx entry point.

### Step 1: Open Docker
Before doing anything, open your start menu, search for **Docker Desktop**, and open it. Wait for the icon to turn green (Engine Running).

### Step 2: Download the Code & Fabric Binaries
Open a terminal in the project root. (Windows users: open a WSL Ubuntu terminal or Git Bash. Do not use standard PowerShell/CMD if possible).

Make sure your Fabric Binaries are installed per the setup guide. Then run the orchestrator script to initialize the blockchain networks:
```bash
bash start-all.sh
```

### Step 3: Pull the Pre-Built Images & Run
```bash
# Pull the latest dependencies/images from GitHub (fast!)
docker compose pull

# Start everything in the background
docker compose up -d
```

### Step 4: Access the System
Everything is now unified under a single localhost port. **Do not use ports like :5173 or :3001 anymore.**
Open these links directly in your browser:

* **Hospital Reception UI:** [http://localhost/](http://localhost/)
* **Hospital Patient UI:** [http://localhost/patient/](http://localhost/patient/)
* **Pharmacy Main UI:** [http://localhost/pharmacy/](http://localhost/pharmacy/)
* **Pharmacy Manager UI:** [http://localhost/pharmacy/manager/](http://localhost/pharmacy/manager/)
* **Pharmacy Employee UI:** [http://localhost/pharmacy/employee/](http://localhost/pharmacy/employee/)
* **Pharmacy Patient UI:** [http://localhost/pharmacy/patient/](http://localhost/pharmacy/patient/)
* **Pharmacy Billing UI:** [http://localhost/pharmacy/billing/](http://localhost/pharmacy/billing/)
* **Pharmacy Inventory UI:** [http://localhost/pharmacy/inventory/](http://localhost/pharmacy/inventory/)
* **Lab Gateway UI:** [http://localhost/lab/](http://localhost/lab/)

*(Note: API backend endpoints are also routed via `http://localhost/api/hospital/` and `http://localhost/api/pharmacy/`)*

---

## 🛠 For Developers: How to Work on the Project

### Modifying Code
Your local folders (`orgs/hospital/`, `orgs/pharmacy/`, etc.) are actively "bind-mounted" into the running Docker containers. 
- You can freely edit `.js`, `.jsx`, `.css` files in your code editor.
- The browser will **auto-reload instantly** (Vite HMR is fully supported through Nginx).

### What if I add a new npm package?
If you add a new package (e.g., modifying `package.json`), you **do not** need to manually push images!
1. Just commit your `package.json` changes to the `main` branch on GitHub.
2. Our **GitHub Actions CI/CD** will automatically detect it and rebuild the cloud images.
3. Tell your teammates to run `docker compose pull && docker compose up -d` to sync up.

---

## Module Ownership Table
We are a team of 18 dividing the work across modules:

| Module | Location |
| :--- | :--- |
| **Hospital Organization** | `orgs/hospital/` |
| **Pharmacy Organization** | `orgs/pharmacy/` |
| **Lab Organization** | `orgs/lab/` |
| **Digilocker System** | `orgs/digilocker/` |
| **Agentic AI Integration** | (Cross-module) |

Please refer to [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming conventions and PR requirements.
