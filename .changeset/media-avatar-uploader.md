---
"@adonis-agora/authkit-server": minor
---

Avatar storage can now delegate to `@adonis-agora/media` when it is installed (declared as an optional peer). New `uploads.avatars` config: `storage` (`'auto'` | `'builtin'` | `'media'`, default `'auto'`), `collection` (default `'avatar'`), and `ownerType` (default `'AuthAccount'`). When media is present it stores the avatar via media's `single-file` helper and persists the returned URL; otherwise it falls back to the built-in `@adonisjs/drive` uploader (behavior unchanged). Adds an exported `isAvatarUploadSupported()` used to gate the avatar file input on whichever backend is actually available.
