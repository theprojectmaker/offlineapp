import type { Register } from 'claude-code'

// Cloudflare account's workers.dev subdomain has drifted before (seen
// northmiddleschool -> scriptly -> greatneck). If this URL starts 404ing,
// redeploy tests/offline-artifacts-worker and read the new URL from
// `wrangler deploy`'s own output, then update this constant.
const WORKER_URL = 'https://offline-artifacts.greatneck.workers.dev'

const ARTIFACT_URL_RE = /^https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9-]+/
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title>([^<]*)<\/title>/i)
  return match ? match[1].trim() : undefined
}

function looksLikeRawHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 200).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html')
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'offlineapp',
      description: 'Save a Claude Artifact or any webpage as a 4-letter code for the Offline Artifacts app',
      argumentHint: '<URL>',
    })

    return next(e)
  })

  on('command.run', { command: 'offlineapp' }, async ($, e) => {
    const url = e.args.trim()

    if (!url) {
      return {
        text:
          'Usage: /offlineapp <URL>\n\n' +
          'Works best on one of your own claude.ai Artifacts (gets the exact page back). ' +
          'Also works on any other http(s) page — it saves that page\'s current HTML. ' +
          'Either way you get a 4-letter code to type into the Offline Artifacts app for fully offline viewing.',
      }
    }

    const isArtifactUrl = ARTIFACT_URL_RE.test(url)

    if (!isArtifactUrl && !HTTP_URL_RE.test(url)) {
      return { text: `That doesn't look like a URL. Got: ${url}` }
    }

    let html: string
    let sourceLabel: string

    if (isArtifactUrl) {
      let readResult
      try {
        readResult = await $.tool.call({ tool: 'Artifact', action: 'read', url, page: true })
      } catch (err) {
        return { text: `Could not read that artifact: ${err instanceof Error ? err.message : String(err)}` }
      }

      html = (readResult as { text?: string }).text ?? ''

      if (!looksLikeRawHtml(html)) {
        return {
          text:
            "This artifact doesn't look like it's your own — `read` only returned a summary, not the raw page, so there isn't enough here to fully recreate it offline. " +
            'A claude.ai artifact only works with /offlineapp when you own it (where the raw HTML comes back). ' +
            'If this is one of yours, open it on claude.ai once to confirm you can edit it, then try again.',
        }
      }
      sourceLabel = 'artifact'
    } else {
      let pageResponse
      try {
        pageResponse = await $.http.fetch(url)
      } catch (err) {
        return { text: `Could not fetch that page: ${err instanceof Error ? err.message : String(err)}` }
      }

      if (!pageResponse.ok) {
        return { text: `That page answered with ${pageResponse.status}, so there's nothing to save.` }
      }

      html = pageResponse.text

      if (!looksLikeRawHtml(html)) {
        return { text: "That URL didn't return an HTML page, so there's nothing to save offline." }
      }
      sourceLabel = 'page'
    }

    const title = extractTitle(html) ?? (isArtifactUrl ? 'Untitled artifact' : hostnameOf(url))

    let response
    try {
      response = await $.http.fetch(`${WORKER_URL}/api/store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/html',
          'X-Title': title,
          'X-Source-Url': url,
        },
        body: html,
      })
    } catch (err) {
      return { text: `Upload failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    if (!response.ok) {
      let detail = response.text
      try {
        detail = JSON.parse(response.text).error ?? response.text
      } catch {
        // keep raw text
      }
      return { text: `Upload failed (${response.status}): ${detail}` }
    }

    let parsed: { code?: string; expiresInDays?: number }
    try {
      parsed = JSON.parse(response.text)
    } catch {
      return { text: `Upload succeeded but the response was not understood: ${response.text}` }
    }

    const { code, expiresInDays = 60 } = parsed
    if (!code) {
      return { text: `Upload succeeded but no code came back: ${response.text}` }
    }

    const caveat = isArtifactUrl
      ? ''
      : " (this page's own images/styles/scripts hosted elsewhere will still need a connection to load — only self-contained pages are fully offline)"

    return {
      text: `Saved "${title}" ${sourceLabel} offline${caveat}. Code: ${code}\n\nType ${code} into the Offline Artifacts app to download it for offline viewing (the code expires in ~${expiresInDays} days).`,
    }
  })
}
