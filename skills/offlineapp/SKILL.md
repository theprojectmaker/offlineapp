---
name: offlineapp
description: "Turn web pages and Claude artifacts from this chat into 4-letter codes for the Offline Artifacts iPhone/iPad app. Use for /offlineapp, 'make that an offline app', or 'save this page offline'."
argument-hint: "[URL ...]"
---

# Offline app

The person wants pages put on their phone. Each page becomes a 4-letter code they type into the
Offline Artifacts app, which downloads it once and keeps it for offline viewing. Do the whole job
yourself; never tell them to paste a URL or run anything.

## 1. Decide which pages

- **URLs were typed after the command** (the arguments): use exactly those. Skip the question.
- **No arguments**: collect every candidate from this conversation, newest first, no duplicates:
  - Claude artifacts published in this chat (`https://claude.ai/artifact/...` or
    `https://claude.ai/code/artifact/...` in an Artifact tool result).
  - Artifact links and any other `http(s)` web page links the person or you wrote in the chat.
  - Leave out things that are not pages to read: API endpoints, repos' git URLs, images, localhost.
  
  Then ask with **AskUserQuestion**, `multiSelect: true`, so they tick the ones they want:
  - One option per page. Label: the page's name in a few words. Description: its address.
  - A question holds at most 4 options. With more than 4 pages, use several questions in the same
    call (up to 4 questions, 16 pages), newest pages first, each headed like "Pages 1–4".
  - Exactly one candidate: still ask, with that page and nothing else needed; they can untick it.
  - No candidates at all: say so in one line and ask which address they want. Stop there.

## 2. Save each chosen page

`upload.mjs` sits next to this file (the base directory shown when this skill loaded). It prints one
line of JSON: `{"code": "ABCD", "title": ...}` or `{"error": ...}`. Run the pages one after another.

**A Claude artifact link** — the uploader cannot log in to claude.ai, so read it first:
1. Call the Artifact tool: `action: "read"`, `url`, `page: true`.
2. If the result says `full HTML saved to <path>`, that file is the page. Otherwise the result's
   HTML is the page: write it, unchanged, to a file in your scratchpad directory.
3. Run `node "<base directory>/upload.mjs" --file "<that file>" --source "<artifact url>"`.
4. If the read returns only a summary (an artifact someone else owns), it cannot be saved. Say so
   for that page and carry on with the rest.

**Any other web page**:
`node "<base directory>/upload.mjs" --url "<address>"` — it downloads the page and folds its
stylesheets and images into it so it shows properly offline.

## 3. Report

Finish with a short list, one line per page: **CODE** — page name. Then one sentence: type a code
into the Offline Artifacts app to download it; codes last 60 days, downloaded pages stay on the
device. Mention a page that failed and why in plain words. Nothing else.
