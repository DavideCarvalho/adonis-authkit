---
"@adonis-agora/authkit-server": patch
---

Redact PII from the audit→diagnostics bridge so a deleted account's data never survives in Telescope's store (LGPD/GDPR completeness).

The diagnostics bridge mirrors every `AuditEvent` onto the `@agora/diagnostics` bus, where Telescope captures it as an independent `diagnostic` entry in its own store — a store the account-deletion cascade's `anonymizeAudit` step does not reach. The bridge now emits a **redacted projection** of each event: `email`, `ip`, and the free-form `metadata` (which can itself carry addresses such as `oldEmail`/`newEmail`) are dropped at the source, leaving only the event `type` and the opaque internal ids (`accountId`/`actorId`/`clientId`) the security dashboard needs. The Telescope dashboard's token-activity table drops its now-empty "IP" column. The `onEvent` callback and outbound `webhook` integrations are unchanged — they still receive the complete event.
