# Security Configuration - Direct Lake Explorer

**Project Status:** Local Development Only - No External Integrations Required

## Overview

This project is designed to operate entirely **locally** during initial development. It uses synthetic datasets, local file storage (Parquet, Delta Lake), and DuckDB for analytical queries. No Microsoft Fabric account or credentials are required.

## Key Security Principles

### 1. Local-Only Operation
- ✅ All data processing happens locally
- ✅ No network calls to Microsoft services
- ✅ No credentials or API keys needed for initial development
- ✅ Uses synthetic/test datasets only

### 2. Data Management
- **Synthetic Datasets:** Project uses generated data for development and testing
- **Local Storage:** Parquet files and Delta Lake tables stored in `./data/`
- **DuckDB Database:** Local analytical queries executed in-process
- **No Production Data:** Never use real Microsoft Fabric data or Azure credentials

### 3. Simulated Components
The following are **simulations only** and do NOT represent actual Microsoft Fabric behavior:
- Direct Lake column selection and framing
- VertiPaq compression algorithms
- Query transcoding logic
- Metadata caching
- Query optimization

All simulations are clearly marked in code comments as `[SIMULATION]` or `[MOCK]`.

## Environment Variables (.env)

**Do NOT commit `.env` files to Git.** Use `.env.example` as a template.

### Required for Local Development
```
NODE_ENV=development
API_PORT=3000
DATA_DIRECTORY=./data
DUCKDB_DATABASE_PATH=./data/duckdb.db
```

### Optional for Simulation Control
```
SIMULATE_DIRECT_LAKE=true
SIMULATE_TRANSCODING=true
SIMULATE_VERTIPAQ=true
SIMULATE_QUERY_PROCESSING=true
```

### Fabric Integration (Future - DO NOT USE NOW)
Fields like `FABRIC_WORKSPACE_ID`, `FABRIC_CLIENT_ID`, etc. are **placeholders for future use only**. Leave these blank.

## Sensitive Files - DO NOT COMMIT

The following file patterns are excluded by `.gitignore`:
- `.env*` (environment files)
- `*.key`, `*.pem`, `*.pfx` (private keys)
- `credentials.json`, `secrets.json` (credential files)
- `node_modules/` (dependencies)
- `*.log` (logs may contain sensitive data)

## File Access Restrictions

✅ **DO:** Work only within `C:\Users\prath\Projects\DirectLakeExplorer\`

❌ **DO NOT:**
- Access user home directories
- Read browser profiles or password stores
- Access Windows system files
- Read or modify system registry
- Access other users' files

## Credential Handling

### Current Project (Local Only)
- No credentials required
- `.env.example` contains NO real values
- All configuration is simulation-focused

### Future Fabric Integration
If Microsoft Fabric integration is added:
1. Update `.env.example` with placeholder variables only
2. Document credential requirements clearly
3. Implement secure credential loading (e.g., `dotenv` for local dev)
4. Never hardcode credentials in source code
5. Use environment-based configuration for all environments

## Synthetic Data Guidelines

- **Location:** `./data/` directory (Git-ignored)
- **Format:** Parquet or Delta Lake files
- **Size:** Keep synthetic datasets small for development (< 100MB)
- **Generation:** Use deterministic seeds for reproducibility
- **No Real Data:** Never copy actual Microsoft Fabric or Azure data

Example synthetic dataset creation:
```typescript
// [SIMULATION] Generate synthetic customer data
const customers = generateSyntheticCustomers(1000, seed: 42);
saveAsParquet(customers, './data/customers.parquet');
```

## Code Review Checklist

Before committing code, verify:
- ❌ No `.env` files committed
- ❌ No API keys in source code
- ❌ No hardcoded credentials
- ❌ No real Fabric workspace IDs or credentials
- ❌ No real Azure storage credentials
- ✅ Simulation code clearly marked as `[SIMULATION]`
- ✅ Comments explain difference between simulation and actual behavior
- ✅ All external dependencies documented
- ✅ No network calls to production services

## Development Workflow

1. **Setup:**
   ```bash
   cp .env.example .env
   npm install
   ```

2. **Generate Local Data:**
   ```bash
   npm run generate-data
   ```

3. **Run Locally:**
   ```bash
   npm run dev
   ```

4. **Testing:**
   ```bash
   npm test
   ```

## Future: Fabric Integration Roadmap

When Microsoft Fabric integration is implemented in the future:
1. Create feature branch: `feature/fabric-integration`
2. Add conditional compilation flags for Fabric components
3. Implement credential management (Azure SDK patterns)
4. Add integration tests (separate from simulation tests)
5. Document differences between simulation and actual Fabric behavior
6. Add feature flags to toggle Fabric vs. local mode

Until then, **all integration points should be stubbed or mocked**.

## Approval Gates

Before any of the following, request user approval:
- Accessing external services
- Creating Azure resources
- Installing new packages
- Modifying `.gitignore` or security files
- Executing PowerShell commands
- Running potentially destructive operations

## Questions or Concerns?

If you need to:
- Add real Fabric connectivity
- Store credentials securely
- Connect to Azure resources
- Access external APIs

**Stop and request explicit approval first.**

---

**Last Updated:** November 1, 2026  
**Status:** Local Development Only - No External Dependencies
