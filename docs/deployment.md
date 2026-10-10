# Deployment and company integrations

## Development and production are separate

Use the provided demo on a private development machine. It contains synthetic data and a visible role switcher. Do not load real payroll into a publicly accessible demo. For company use, start with a **new empty database**, `SEED_SAMPLE=false`, `APP_ENV=production`, and `AUTH_MODE=entra`. Synthetic database classification cannot be switched off to disguise the sample as real data.

The portable deployment is a single Docker image serving the React build and FastAPI, backed by a managed PostgreSQL database. Azure App Service for Linux containers plus Azure Database for PostgreSQL is the preferred candidate if the company already uses Azure. No subscription, tenant, hostname, or cloud resources are assumed/provisioned here. The PostgreSQL adapter and container have passed local tests; validate managed-service networking, TLS and identity against the chosen host before production.

## Container and database

1. Build with `docker build -t divergent-org-explorer:local .`.
   If the build network uses an approved enterprise CA, pass its PEM bundle without disabling TLS: `docker build --secret id=build_ca,src=/path/to/approved-ca-bundle.pem -t divergent-org-explorer:local .`. The optional secret is used during dependency installation and is not retained in the image. In this cloud workspace, `BUILDX_CONFIG=/tmp/divergent-buildx` avoids writing the build cache under a read-only home directory.
2. Provision a private managed PostgreSQL database and a least-privilege app account. Supply `DATABASE_URL=postgresql+psycopg://...?...` through your host's secret manager. Use `sslmode=verify-full` and the provider's CA trust chain; never disable TLS verification. Percent-encode credential characters in URLs.
3. Set the production environment values and Entra configuration below. Set host health checking to `/api/health`, container port 8000, HTTPS-only ingress, a 12 MB request-body limit, and normal host request/connection rate limits. Private access is recommended for initial rollout.
4. Schema v1 initializes at startup. For a predeployment migration, run `python -m backend.migrate` inside the image with the database binding. `migrations/001_initial.postgresql.sql` is the equivalent one-time SQL for an empty PostgreSQL database. Do not run both against a populated database.
5. Use one backend worker/replica initially so only one Graph poller runs. Concurrent writes are still protected by database version checks. Plan a separate scheduled Graph worker before horizontal scaling.
6. Import the real workbook as an assigned administrator. Confirm field mappings, owners and unit budgets with Finance before rollout.

SQLite is supported for local development or an isolated pilot with a durable `/app/data` volume and one instance. Do not store a production SQLite file on an ephemeral container layer. PostgreSQL is the intended managed company database.

## Microsoft Entra sign-in

The client uses MSAL's interactive sign-in and in-memory browser token cache. The API validates RS256 signatures against tenant JWKS plus issuer, audience, expiry and required object ID. No static bearer token entry or development role switching is used in Entra mode.

IT configuration:

1. Register a single-tenant API application. Expose a delegated `access_as_user` scope. Configure v2 access tokens.
2. Register a SPA client. Add the exact HTTPS application origin as its SPA redirect URI, and grant the API delegated scope with tenant consent as appropriate. Pop-up sign-in returns to that origin. No SPA client secret is used.
3. Set `ENTRA_TENANT_ID` to the tenant UUID, `ENTRA_CLIENT_ID` to the SPA client UUID, `ENTRA_AUDIENCE` to the API application UUID, and `ENTRA_SCOPE` to the full exposed scope URI.
4. Supply `ENTRA_ACCESS_MAP` as JSON keyed by approved Entra **user object IDs**. Values use `role` (`admin`, `finance`, `owner`, `viewer`) and, for owners, the exact `unit` ID. Example with placeholders:

   ```json
   {"ADMIN_OBJECT_ID":{"role":"admin"},"OWNER_OBJECT_ID":{"role":"owner","unit":"eng"}}
   ```

5. Set `APP_ENV=production`, `AUTH_MODE=entra`, `SEED_SAMPLE=false`, `COOKIE_SECURE=true`. Keep app settings and user mappings in the host's secure configuration. No access mapping means no access. Test every role with real tenant accounts before rollout.
6. Permit outbound HTTPS to `login.microsoftonline.com` for signing keys and browser authentication. Follow the tenant's Conditional Access rules. The app does not manage Entra enrollment, MFA, licensing or consent itself.

Live sign-in has not been exercised without a corporate tenant. The adapter has local unit tests with signed tokens; those tests do not establish real tenant access.

## SharePoint / OneDrive refresh

Manual `.xlsx` imports work without Microsoft credentials. Optional polling uses Microsoft Graph application credentials and the **same import validation pipeline**.

1. Register a separate confidential app or select a managed company integration app. Grant the narrowest suitable Graph application access (prefer `Sites.Selected` plus an explicit read grant for the selected SharePoint site). Use broader file permissions only if the company explicitly chooses them. Obtain administrator consent and verify read access to the workbook drive item.
2. Set `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_DRIVE_ID`, `GRAPH_ITEM_ID`, and optionally `GRAPH_POLL_SECONDS` (minimum 60; default 300). The client secret must be a real runtime secret supplied securely, not a proxy placeholder that cannot be used in the OAuth form body. Rotate it through the host secret manager.
3. Permit HTTPS to `login.microsoftonline.com`, `graph.microsoft.com`, and the configured tenant's SharePoint/OneDrive download host. Graph's temporary download URL is used in memory only, without forwarding the OAuth bearer token to it.
4. Restart the application, open Data & imports → SharePoint, and run **Check for changes**. Verify source filename, errors and last check. A changed workbook produces **Review pending workbook**; an administrator confirms it. `lastSuccessfulRefresh` changes only after the reviewed import is committed.
5. A poll never auto-commits. Every changed workbook is reviewed, including ordinary updates, conflicting app-owned data and potentially destructive changes. Refresh currently uses canonical template headers and incremental policy. Use manual import for custom column mapping or explicit full snapshots.

These settings are absent in the demo; its status remains **Not configured**. Mock transport tests verify the OAuth/download/preview boundary and failure preservation, not access to a live company workbook.

## Backups and restoration

Production: enable managed PostgreSQL automated backups and point-in-time restore with retention approved by IT. Monitor successful backups, storage and error rates. Encrypt storage and backups. Take an on-demand backup before schema upgrades. A manual logical backup can use `pg_dump --format=custom --file=explorer.dump` with credentials injected securely through the supported PostgreSQL configuration; do not put secrets in shell history. Restore to a **new database** with `pg_restore`, point a maintenance instance at it, run `/api/health`, validate employee counts, a known import, role isolation and audit history, then switch configuration during a planned maintenance window. Keep the previous database recoverable until acceptance.

Local SQLite: use `python3 scripts/backup.py path/to/backup.db`. It uses SQLite's online backup API for a consistent snapshot. The destination must be new and outside the repository's tracked files. Test it in a separate database before replacing active data. Database backups contain compensation and identity data and require the same access controls as production.

User-facing restore: Data & imports → Import history → Preview restore. This reimports the older workbook snapshot incrementally and preserves app-owned units, budgets, objectives and KRs. It does not hard-delete newer employees or undo later planning edits. Conflicts are presented for acknowledgement. This is distinct from whole-database disaster recovery.

## Remaining production work

Choose the company's cloud and private hostname, supply a managed database, configure Entra accounts/permissions, optionally grant Graph workbook access, verify TLS/backup monitoring, and run the live tenant and database acceptance checks. The app is implemented locally; no public deployment or external integration is claimed as completed.
