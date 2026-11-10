# offlineapp

A Claude Code skill: `/offlineapp`.

Run it with nothing after it and Claude lists every web page and Claude artifact from the chat
with checkboxes. Tick the ones you want; each becomes a 4-letter code for the **Offline Artifacts**
iOS app, which downloads the page once and keeps it for offline viewing. `/offlineapp <url> ...`
skips the question.

Web pages have their stylesheets and images folded in so they display offline. Scripts that load
from elsewhere still need a connection. A Claude artifact must be one you own.

## Install

Copy `skills/offlineapp` into `~/.claude/skills/` and restart Claude Code, or:

```
/plugin install offlineapp --marketplace theprojectmaker/offlineapp
```

Needs Node 18+. Codes expire after 60 days; pages already downloaded stay on the device.
