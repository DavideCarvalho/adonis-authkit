import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

const GITHUB_URL = 'https://github.com/DavideCarvalho/adonis-authkit'

/**
 * Mono "status pill" wordmark — the same console branding the landing header
 * uses: a live violet dot followed by the package name in a monospace face.
 * Keeps the home → docs transition visually continuous.
 */
function NavTitle() {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[15px] font-semibold tracking-tight">
      <span
        aria-hidden
        className="size-2 rounded-full bg-[#625fff] shadow-[0_0_8px_2px] shadow-[#625fff]/50"
      />
      AuthKit
    </span>
  )
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <NavTitle />,
    },
    links: [
      {
        text: 'Documentation',
        url: '/docs',
        active: 'nested-url',
      },
    ],
    githubUrl: GITHUB_URL,
  }
}
