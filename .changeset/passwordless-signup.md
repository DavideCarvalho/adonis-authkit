---
"@adonis-agora/authkit-server": minor
---

Add passwordless public signup (`passwordless.signup`)

When `passwordless: { signup: true }` (and the account store implements
`MagicLinkCapability`), the public signup asks for e-mail + name only — no
password. It creates the account with an unusable random password (same
precedent as social-identity accounts), issues a magic link, and e-mails it;
opening the link finishes the login through the existing magic-link flow. The
response is uniform ("link sent") whether or not the account already exists
(anti-enumeration), and an existing e-mail simply gets a login link. The
password-based signup is unchanged when the flag is off.
