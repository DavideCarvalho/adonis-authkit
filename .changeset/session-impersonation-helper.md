---
"@adonis-agora/authkit-server": minor
---

Add RP-side session-impersonation helpers (`rememberAccessToken`, `startImpersonation`, `impersonationState`, `stopImpersonation`) in `src/host/impersonation_session.ts`.

These give a relying party a reusable, ergonomic way to impersonate a user and browse as them. The flow is routed through the IdP's existing RFC 8693 token-exchange, so it inherits the IdP's central audit trail and the `act` claim — the IdP stays the sole authorization gatekeeper (a non-admin `subject_token` is rejected, so the session is only swapped on a successful exchange). The helpers are pure session glue over the `account_user_id` key, with anti-fixation session regeneration on start/stop.
