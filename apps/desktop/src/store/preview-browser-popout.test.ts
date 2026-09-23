// Regression for #119850: popping a Browser tab out opened a native window
// whose content never painted. A `?win=browser` renderer has no focused
// session to drive `setPreviewScope`, so its `$previewTabs` stayed empty and
// `PreviewTilePane` found no target to hand the webview. `hydrateBrowserPopoutTab`
// resolves the window's `?tab=` id straight from the persisted per-profile
// buckets instead.
import { beforeEach, describe, expect, it } from 'vitest'

import {
  $previewTabs,
  commitBrowserTabLocation,
  hydrateBrowserPopoutTab,
  openPreview,
  type PreviewTarget,
  setPreviewScope
} from '@/store/preview'

function urlTarget(url: string): PreviewTarget {
  return {
    kind: 'url',
    label: url,
    source: url,
    url
  }
}

describe('browser pop-out tab hand-off', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setPreviewScope('default')
    $previewTabs.set([])
  })

  it('adopts the popped-out tab from the profile bucket that holds it', () => {
    setPreviewScope('popout-owner')
    openPreview(urlTarget('http://127.0.0.1:9119/kanban'))
    const [tab] = $previewTabs.get()

    // The pop-out renderer boots with an empty rail and no scope of its own.
    setPreviewScope('default')
    $previewTabs.set([])

    expect(hydrateBrowserPopoutTab(tab.id)?.target.url).toBe('http://127.0.0.1:9119/kanban')
    expect($previewTabs.get().some(item => item.id === tab.id)).toBe(true)
  })

  it('keeps hand-off commits landing in the tab own bucket', () => {
    setPreviewScope('popout-writer')
    openPreview(urlTarget('http://127.0.0.1:1234/start'))
    const [tab] = $previewTabs.get()

    setPreviewScope('default')
    $previewTabs.set([])
    hydrateBrowserPopoutTab(tab.id)

    // What the pop-out writes back on close must reach storage where the
    // docked window reads the tab - not some other profile's bucket.
    commitBrowserTabLocation(tab.id, 'http://127.0.0.1:1234/moved', 'Moved')

    const raw = window.localStorage.getItem('hermes.desktop.previewTabs.v2')
    const buckets = raw
      ? (JSON.parse(raw) as Record<string, { id: string; target: { url?: string } }[]>)
      : {}
    const stored = (buckets['popout-writer'] ?? []).find(item => item.id === tab.id)

    expect(stored?.target.url).toBe('http://127.0.0.1:1234/moved')
  })

  it('hands back the in-memory tab when the rail already shows it', () => {
    setPreviewScope('popout-nowner')
    openPreview(urlTarget('http://localhost:41001/'))
    const [tab] = $previewTabs.get()

    expect(hydrateBrowserPopoutTab(tab.id)?.id).toBe(tab.id)
  })

  it('reports an unknown id as missing and leaves the rail untouched', () => {
    setPreviewScope('popout-nobody')
    openPreview(urlTarget('http://localhost:41002/'))
    const before = $previewTabs.get()

    expect(hydrateBrowserPopoutTab('url:browser-nope')).toBeNull()
    expect($previewTabs.get()).toBe(before)
    expect(hydrateBrowserPopoutTab('')).toBeNull()
  })
})
