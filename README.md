# offlineapp

A Claude Code slash command: `/offlineapp <URL>`.

Reads one of your own published claude.ai Artifacts (gets the exact page back), or any other
`http(s)` page (saves its current HTML), uploads it to a small Cloudflare Worker, and hands you
back a 4-letter code. Type that code into the companion **Offline Artifacts** iOS app to download
and view it with zero network dependency from then on.

## Install

At the prompt of a terminal session:

```
/plugin install offlineapp --marketplace theprojectmaker/offlineapp
```

From a shell:

```bash
claude plugin install offlineapp --marketplace theprojectmaker/offlineapp
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace**
with `theprojectmaker/offlineapp`, then **Add plugin**.

## Notes

- Works best on your own Claude Artifacts — a shared artifact you don't own only returns an
  AI-written summary, not the raw page, so there isn't enough to recreate it offline.
- On any other URL, only that page's own HTML is saved; images/CSS/JS it loads from elsewhere
  still need a connection unless the page is fully self-contained.
- Backend: a Cloudflare Worker + KV store (`tests/offline-artifacts-worker` in the main project),
  codes expire after ~60 days.
