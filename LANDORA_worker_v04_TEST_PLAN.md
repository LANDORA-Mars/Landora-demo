# LANDORA Worker v0.4 — quota and deployment acceptance tests

Status: **NOT production-approved**. This file records required tests; it does not claim they have passed.

## Quota atomicity (D1 staging database only)

1. Seed a trial subscription with `quota_limit=1`, `quota_used=0`, a valid member, and a test organization.
2. Send one authenticated `POST /api/cases` with a valid HTTPS listing URL. Expect HTTP 201, exactly one new case, and `quota_used=1`.
3. Send another request. Expect HTTP 429, no second case, and `quota_used=1`.
4. Reset quota to 1 and send 10 concurrent requests using distinct request IDs. Expect **exactly one** case created and quota_used=1. Repeat at least 100 times.
5. Simulate an insert failure after quota reservation. Verify D1 batch transaction behavior and compensation; neither a phantom charge nor an orphan case may remain.
6. Simulate an audit insert failure. Current audit write occurs **after** the batch, so this must be fixed or explicitly addressed before paid usage.
7. Test two organizations with identical listing URLs; cross-organization reads must return 404.
8. Test absent/invalid/expired JWT, missing JWKS, mismatched issuer/audience, and invalid CORS origin. All must fail closed.

## Configuration / deploy gate

- Verify Cloudflare Workers Builds root directory, build command, deploy command, and branch.
- Add a Wrangler config only after confirming the actual Worker name, D1 database ID, and binding name; never guess IDs.
- Use a **separate staging Worker and staging D1**. Do not deploy v0.4 to the existing production Worker.
- Keep AUTH_ISSUER, AUTH_AUDIENCE, AUTH_JWKS_URL, and ALLOWED_ORIGIN in Worker configuration. Never commit secrets.
- Verify live matching is **not** advertised: the current API queues cases but does not resolve legal parcel/address sources.
- Deploy only after authentication provisioning, authorization, quota, backup, rate limit, and source licensing gates are met.

## Known limitation of this fix

The case insert now uses SQLite `changes()=1` after the conditional quota UPDATE in the same D1 batch. This is a defense against the prior full-quota bypass, **not** proof of concurrency safety or full transaction rollback in all failure paths. Validate against actual D1 staging before production.
