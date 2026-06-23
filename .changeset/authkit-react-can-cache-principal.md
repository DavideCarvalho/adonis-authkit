---
"@adonis-agora/authkit-react": minor
---

fix: invalidate can-permission cache on principal change (stale authz after logout/org-switch)

The in-memory `useCan`/`checkCan` cache was process-global and keyed only by
`(path, permission, resource)`, so resolved permission decisions kept being
served across logout / user-switch / org-switch — a decision could outlive the
session that authorized it. The current principal (`useAuth().user?.id`, or an
`anon` sentinel when logged out) is now folded into the cache key, so a new
principal naturally misses the previous principal's answers and re-checks.

Also: `UseCanResult` now exposes an optional `error?: Error` (fail-closed:
`allowed` stays `false` on error), symmetric with `ResourceState<T>`; a public
`invalidateCanCache()` is exported to force a global refetch; and the warm-cache
render no longer triggers a redundant second `setState`.
