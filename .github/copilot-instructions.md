# Copilot Security Instructions - Direct Lake Explorer

**Project Scope:** Local Development Only - No External Services

---

## 1. Workspace Boundaries

✅ **Work within this workspace:**
- `<project-root>\` and all subdirectories
- `.github/` for configuration files
- `src/`, `data/`, `tests/` directories

❌ **Do NOT access:**
- Files outside the workspace
- User profile directories (Documents, Desktop, AppData, etc.)
- System directories (`C:\Windows\`, `C:\Program Files\`, etc.)
- Other users' files or shared network drives

---

## 2. Credential and Secret Protection

**This is a LOCAL-ONLY project. No credentials are required.**

✅ **Safe Operations:**
- Use `.env.example` as a template only
- Reference environment variables by name (never commit values)
- Work with synthetic/generated data

❌ **Forbidden Operations:**
- Never hardcode credentials in source code
- Never read `.env` files and expose their contents
- Never request Microsoft Fabric credentials
- Never attempt to connect to real Fabric workspaces
- Never access browser profiles or password stores
- Never read Windows credential manager
- Never commit API keys, tokens, or secrets

### If .env is Needed
```bash
cp .env.example .env
# Edit .env locally (Git-ignored, never committed)
```

---

## 3. Microsoft Fabric - Strictly Simulation Only

❌ **FORBIDDEN:**
- Connect to any Microsoft Fabric workspace
- Use real Fabric credentials
- Query live Fabric datasets
- Access Azure resources
- Authenticate with Microsoft services

✅ **REQUIRED:**
- All Fabric operations must be **simulated locally**
- Mark all simulations with code comments: `[SIMULATION]` or `[MOCK]`
- Use synthetic datasets in `./data/` directory
- Process data locally with DuckDB
- Distinguish simulation behavior from actual Fabric internals

### Example Simulation Pattern
```typescript
// [SIMULATION] This is mock Direct Lake behavior, not actual Fabric
async function simulateDirectLakeQuery(query: string) {
  // Simulate transcoding, VertiPaq operations, query processing
  // Use local DuckDB instead of Fabric
}
```

---

## 4. Data Handling

✅ **Allowed:**
- Synthetic/generated datasets
- Local Parquet files in `./data/`
- DuckDB queries on local data
- Test datasets for simulation
- Small sample data (< 100MB)

❌ **Forbidden:**
- Real Microsoft Fabric datasets
- Production data from any source
- Copy/paste sensitive data for testing
- Network calls to external services
- Storing data in cloud services (Azure, etc.)

---

## 5. External Services - NO CONNECTIONS

❌ **Do NOT:**
- Connect to Microsoft Fabric
- Connect to Azure services
- Call external APIs without explicit approval
- Download scripts or code from the internet and execute them
- Upload files to external services
- Access cloud storage accounts
- Authenticate with any online service

This project operates entirely **offline/locally**.

---

## 6. Package Management

⚠️ **Before Installing Packages:**
1. Review the package thoroughly
2. Check for suspicious dependencies
3. Verify the package is from a trusted source
4. Request user approval before running `npm install`

**Approved for Initial Setup:**
- TypeScript
- DuckDB
- Express (if API needed)
- Parquet libraries (Apache Arrow, etc.)

**Requires Approval:**
- Any authentication packages (Azure SDK, OAuth, etc.)
- Cloud provider SDKs
- Network request libraries that could be misused
- File upload/cloud storage packages

---

## 7. PowerShell and Shell Commands

⚠️ **Request approval before executing:**
- Registry modifications
- System configuration changes
- File operations outside the workspace
- Installation of software or tools
- Network commands
- Any command that could affect the system

✅ **Safe to execute (within workspace):**
- `npm install`, `npm start`, `npm test`
- `git status`, `git add`, `git commit` (workspace only)
- Directory navigation and file listing within workspace
- Node.js script execution

---

## 8. Code Changes and Commits

✅ **Before committing any code:**
- Review all changes carefully
- Verify no `.env` or credential files included
- Confirm no hardcoded secrets
- Check that simulations are marked `[SIMULATION]`
- Document any external dependencies
- Ensure changes are within project scope

⚠️ **Do NOT:**
- Create commits with sensitive data
- Force push to any repository
- Modify `.gitignore` without approval
- Delete security configuration files
- Disable security protections

---

## 9. Potentially Destructive Operations

⚠️ **ALWAYS explain before executing:**
- Deletion of directories or files
- Database schema modifications
- Configuration file changes
- Dependency version changes
- Test database clearing
- Cache invalidation

**Format for explanation:**
```
Operation: [Clear test database]
Affected files: ./data/duckdb.db
Effect: Deletes all test data (safe, can be regenerated)
Approval needed? YES/NO
```

---

## 10. System-Level Changes

❌ **Do NOT:**
- Modify Windows registry
- Install system software
- Change environment variables globally
- Modify firewall settings
- Disable antivirus or security tools
- Run privileged commands (`runas`, `sudo`, etc.)
- Modify VS Code global settings

✅ **Workspace-only configuration:**
- Create `.vscode/settings.json` (workspace only)
- Use `.env` for project configuration
- Modify `.github/` files for project rules

---

## 11. Synthetic Data and Simulation Clarity

✅ **Always include:**
- Clear code comments marking simulations
- Documentation of what's real vs. simulated
- Assumptions in simulation logic
- Differences from actual Fabric behavior

Example documentation:
```typescript
/**
 * [SIMULATION] Direct Lake Query Engine
 * 
 * This is a MOCK implementation that simulates Direct Lake behavior.
 * It does NOT represent actual Microsoft Fabric internals.
 * 
 * Real Direct Lake in Fabric:
 * - Queries live Fabric datasets
 * - Uses proprietary VertiPaq engine
 * - Applies real transcoding rules
 * 
 * This simulation:
 * - Queries local Parquet/Delta files
 * - Simulates transcoding with simple rules
 * - Uses DuckDB for query execution
 */
```

---

## 12. No Production Dependencies

❌ **FORBIDDEN:**
- Require Fabric account creation before use
- Require Azure subscription
- Require API keys to function
- Require external network access
- Require authentication setup

✅ **REQUIRED:**
- Project must work entirely offline
- All demos use local synthetic data
- Optional Fabric integration (future only)
- All configuration local to workspace

---

## Summary: Approval Required For

📋 Request approval BEFORE:
- Installing packages → `npm install [package-name]`
- Running PowerShell commands (outside safe list)
- Executing downloaded scripts
- Modifying security files (`.gitignore`, `SECURITY.md`, `copilot-instructions.md`)
- Accessing external services
- Creating directories outside workspace
- Deleting files or directories

---

## Questions to Ask Before Acting

Before any action, ask yourself:

1. ✅ Am I working within `<project-root>\`?
2. ✅ Could this expose credentials or secrets?
3. ✅ Does this require user approval per the rules above?
4. ✅ Could this modify system settings?
5. ✅ Am I clearly marking simulations as `[SIMULATION]`?
6. ✅ Am I staying offline/local-only?
7. ✅ Is this potentially destructive?
8. ✅ Have I documented the operation?

If you answer **NO** to any question → **STOP and request approval**.

---

**Last Updated:** November 1, 2026  
**Status:** LOCAL DEVELOPMENT ONLY - NO EXTERNAL INTEGRATIONS  
**Fabric Integration Status:** Future-ready, but NOT required for initial development
