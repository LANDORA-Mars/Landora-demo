-- LANDORA commercial schema draft v0.1 for Cloudflare D1 (SQLite)
-- REVIEW ONLY. Apply via a reviewed migration; never overwrite existing pandora-db tables.
-- Authentication MUST be provided by a verified external identity provider.
-- Do not expose D1 directly to the browser; tenant checks belong in Worker endpoints.
CREATE TABLE IF NOT EXISTS ld_organizations (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ld_members (
 id TEXT PRIMARY KEY, auth_subject TEXT NOT NULL UNIQUE, email TEXT,
 organization_id TEXT NOT NULL REFERENCES ld_organizations(id),
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ld_members_org ON ld_members(organization_id);
CREATE TABLE IF NOT EXISTS ld_subscriptions (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES ld_organizations(id),
 plan TEXT NOT NULL CHECK(plan IN ('trial','individual','team','enterprise')),
 status TEXT NOT NULL CHECK(status IN ('trialing','active','past_due','cancelled','expired')),
 trial_starts_at TEXT, trial_ends_at TEXT, period_ends_at TEXT,
 quota_limit INTEGER NOT NULL DEFAULT 0 CHECK(quota_limit>=0),
 quota_used INTEGER NOT NULL DEFAULT 0 CHECK(quota_used>=0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ld_subs_org ON ld_subscriptions(organization_id);
CREATE TABLE IF NOT EXISTS ld_cases (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES ld_organizations(id),
 created_by TEXT NOT NULL REFERENCES ld_members(id),
 listing_url TEXT NOT NULL, listing_domain TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','processing','partial','completed','failed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ld_cases_tenant ON ld_cases(organization_id,created_at);
CREATE TABLE IF NOT EXISTS ld_candidates (
 id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES ld_cases(id) ON DELETE CASCADE,
 candidate_address TEXT, land_section TEXT, land_number TEXT, building_number TEXT,
 score INTEGER CHECK(score BETWEEN 0 AND 100), score_version TEXT,
 verification TEXT NOT NULL CHECK(verification IN ('unverified','candidate','verified','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ld_candidates_case ON ld_candidates(case_id);
CREATE TABLE IF NOT EXISTS ld_evidence (
 id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES ld_candidates(id) ON DELETE CASCADE,
 field_name TEXT NOT NULL, assertion TEXT NOT NULL,
 evidence_type TEXT NOT NULL CHECK(evidence_type IN ('support','conflict','unknown')),
 source_url TEXT, source_name TEXT NOT NULL, source_observed_at TEXT,
 license_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ld_evidence_candidate ON ld_evidence(candidate_id);
CREATE TABLE IF NOT EXISTS ld_source_permissions (
 id TEXT PRIMARY KEY, source_name TEXT NOT NULL UNIQUE,
 access_status TEXT NOT NULL CHECK(access_status IN ('unreviewed','requested','approved','rejected','expired')),
 commercial_saas_allowed INTEGER NOT NULL DEFAULT 0 CHECK(commercial_saas_allowed IN (0,1)),
 redistribution_allowed INTEGER NOT NULL DEFAULT 0 CHECK(redistribution_allowed IN (0,1)),
 terms_url TEXT, valid_until TEXT, reviewed_at TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS ld_audit_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, actor_id TEXT,
 action TEXT NOT NULL, object_type TEXT, object_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ld_audit_org_time ON ld_audit_events(organization_id,created_at);
-- REQUIRED SERVER INVARIANTS:
-- 1) Derive auth_subject from VERIFIED session/JWT, never request JSON.
-- 2) Resolve organization_id from ld_members for each request; never trust client tenant IDs.
-- 3) Every SELECT/UPDATE/DELETE on cases must filter organization_id.
-- 4) Candidate/evidence access must join through ld_cases and filter organization_id.
-- 5) Enforce quotas with one atomic transaction / conditional UPDATE; fail closed.
-- 6) Only query approved sources whose commercial SaaS scope is verified.
-- 7) Never store access tokens, credentials or registry-owner PII in client or logs.
-- 8) Add migrations, retention/deletion policy, backups and abuse monitoring before production.
