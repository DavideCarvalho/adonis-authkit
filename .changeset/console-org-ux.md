---
'@dudousxd/adonis-authkit-server': minor
---

Admin console UX: real forms for org settings, user search everywhere, interactive charts

- **Organization settings got a real UI**: `organizations_policy` is now a proper form (self-create toggle, invitation TTL, role chips editor) and `roles_catalog` an inline role list editor (name + description, ADMIN locked) — no more raw JSON textareas. A read-only summary of the effective value shows even when not editing.
- **Linking users to an org no longer requires a UUID**: "Add member" and the create-org "Owner" field are now a user search (by email/name, debounced) with a picker; member/invite roles are selects instead of free-text.
- **Overview charts are interactive**: sign-ins/sign-ups per day rebuilt with Recharts — gradient area, dotted grid, hover tooltip with per-day values (shadcn-style), replacing the static SVG sparkline.
