#!/usr/bin/env node
// Uploads one page to the Offline Artifacts worker and prints {code,title,source,bytes} as JSON.
//   node upload.mjs --file <saved.html> [--title "T"] [--source <url>]
//   node upload.mjs --url <https://any.page>
// For --url the page's stylesheets and images are folded into the HTML so it works with no network.

// This account's workers.dev subdomain has moved before; if uploads fail, redeploy
// tests/offline-artifacts-worker and put the URL wrangler prints here and in the app's src/config.ts.
const WORKER_URL = 'https://offline-artifacts.greatneck.workers.dev';
const MAX_BYTES = 2_900_000;
const IMAGE_BUDGET = 1_900_000;
const MAX_ONE_IMAGE = 450_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(message) {
  console.log(JSON.stringify({ error: message }));
  process.exit(1);
}

async function get(url, as = 'text') {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return { res, body: as === 'text' ? await res.text() : Buffer.from(await res.arrayBuffer()) };
}

const abs = (ref, base) => {
  try { return new URL(ref, base).href; } catch { return null; }
};

async function inlineStyles(html, base) {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].filter(m => /rel\s*=\s*["']?[^"'>]*stylesheet/i.test(m[0]));
  for (const m of links) {
    const href = m[0].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    const url = href && abs(href.replace(/&amp;/g, '&'), base);
    if (!url) continue;
    try {
      const { body } = await get(url);
      const css = body
        .replace(/url\(\s*(["']?)(?!data:|https?:|\/\/)([^"')]+)\1\s*\)/gi, (_, q, ref) => `url(${abs(ref, url) ?? ref})`)
        .replace(/<\/style/gi, '<\\/style');
      html = html.replace(m[0], () => `<style>${css}</style>`);
    } catch { /* leave the link; it loads when online */ }
  }
  return html;
}

async function inlineImages(html, base) {
  let spent = 0;
  const seen = new Map();
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)];
  for (const m of tags) {
    const src = m[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || src.startsWith('data:')) continue;
    const url = abs(src.replace(/&amp;/g, '&'), base);
    if (!url) continue;
    if (!seen.has(url)) {
      let data = null;
      try {
        const { res, body } = await get(url, 'bytes');
        const type = (res.headers.get('content-type') || '').split(';')[0];
        const cost = Math.ceil(body.length * 1.37);
        if (type.startsWith('image/') && body.length <= MAX_ONE_IMAGE && spent + cost <= IMAGE_BUDGET) {
          data = `data:${type};base64,${body.toString('base64')}`;
          spent += cost;
        }
      } catch { /* keep the remote address */ }
      seen.set(url, data);
    }
    const data = seen.get(url);
    if (!data) continue;
    const tag = m[0].replace(src, () => data).replace(/\s(?:srcset|sizes|loading)\s*=\s*["'][^"']*["']/gi, '');
    html = html.replace(m[0], () => tag);
  }
  return html;
}

function withBase(html, base) {
  if (/<base\b/i.test(html)) return html;
  const tag = `<base href="${base.replace(/"/g, '&quot;')}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + tag) : tag + html;
}

async function fromUrl(url) {
  const { res, body } = await get(url);
  const type = res.headers.get('content-type') || '';
  if (!/html/i.test(type) && !/^\s*<(!doctype|html)/i.test(body)) throw new Error('that address did not return a web page');
  const base = res.url || url;
  const styled = await inlineStyles(withBase(body, base), base);
  const full = await inlineImages(styled, base);
  return Buffer.byteLength(full) <= MAX_BYTES ? full : styled;
}

const file = arg('file');
const url = arg('url');
if (!file && !url) fail('give --file <path> or --url <address>');

let html;
try {
  html = file ? (await import('node:fs/promises').then(fs => fs.readFile(file, 'utf8'))) : await fromUrl(url);
} catch (e) {
  fail(`could not get the page: ${e.message}`);
}
if (!/<(!doctype|html|body|div|title)/i.test(html.slice(0, 4000))) fail('that is not an HTML page (a summary of an artifact you do not own cannot be saved)');
if (Buffer.byteLength(html) > 3_000_000) fail('page is larger than 3 MB');

const source = arg('source') || url || '';
const title = (arg('title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || (source ? new URL(source).hostname : 'Untitled page')).trim().slice(0, 200);

try {
  const res = await fetch(`${WORKER_URL}/api/store?title=${encodeURIComponent(title)}&sourceUrl=${encodeURIComponent(source)}`, {
    method: 'POST',
    headers: { 'content-type': 'text/html' },
    body: html,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok || !data.code) fail(`upload failed (${res.status}): ${data.error || 'no code returned'}`);
  console.log(JSON.stringify({ code: data.code, title, source, bytes: Buffer.byteLength(html), expiresInDays: data.expiresInDays }));
} catch (e) {
  fail(`upload failed: ${e.message}`);
}
