import { docs } from '@/.source'
import { loader } from 'fumadocs-core/source'
import { createElement, type ComponentType } from 'react'
import * as lucide from 'lucide-react'

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  icon(name) {
    if (!name) return
    const Icon = (lucide as Record<string, unknown>)[name]
    if (Icon) return createElement(Icon as ComponentType)
  },
})
