# Solo Operator

A guide hub and a conversational engine for running a one-person business with ChatGPT.

- **Guide** (`index.html`, `entry.html`): 26 short entries in five parts: setup, offer, build, voice-agent service business, and mindset. All content lives in `data/gub.json`, and the pages render from it.
- **Engine** (`engine.html`): the visitor describes their situation in their own words. The engine asks one clarifying question at a time, then recommends guide entries with a concrete next step. The side cards show the top match, a ranked shortlist with a score gauge, and the details for the selected match.

The guide summarizes, in original wording, two September 2026 courses: *ChatGPT Mastery Bootcamp, Days 1–2* (Justin Burns) and *Start a 1-Person Business with ChatGPT* (Michele Torti). Time-sensitive claims were checked against OpenAI, Retell AI, Vercel and FCC sources on 29 September 2026. Two corrections to the courses are built in: custom GPTs are retiring, and outbound AI-voice calls in the US need prior express consent.

## How it works

```
browser ──POST /api/chat──▶ api/chat.js ──▶ Anthropic Messages API
                               │
                               └─ reads data/gub.json, picks the most relevant entries,
                                  and gives them to the model with a full entry index
```

- The browser only ever calls `/api/chat`. The Anthropic key is read from `process.env` inside the function and is never sent to the browser.
- The model ends each recommendation with lines like `MATCH: {"id":"...","title":"...","score":0-100,"why":"...","details":{...}}`. The frontend removes every `MATCH:` line from the visible reply (even malformed ones), sorts matches by score and fills the side cards. The cards keep the last matches while the engine asks a follow-up question.
- Conversation state is kept in `sessionStorage` and disappears when the tab closes.
- Theme (`pref-theme`) and text size (`pref-font-size`) are saved in `localStorage`. A small inline script in each page's `<head>` restores them before first paint. The Content-Security-Policy allows that script by its sha256 hash.

## Files

| Path | Purpose |
| --- | --- |
| `index.html`, `entry.html` | Guide pages |
| `engine.html` | Engine |
| `assets/css/gub.css`, `assets/css/engine.css` | Styles |
| `assets/js/prefs.js` | Theme and text-size controls (all pages) |
| `assets/js/gub.js` | Renders the guide from `data/gub.json` |
| `assets/js/engine.js` | Chat, MATCH parsing, side cards |
| `api/chat.js` | Serverless function: validation, origin check, rate limit, retrieval, upstream call |
| `data/gub.json` | All guide content (`id`, `title`, `summary`, `body`, `tags`, `details`, plus `steps`, `warning`, `source`) |
| `vercel.json` | Function settings (`includeFiles: data/**`, 30 s max) and security headers |

There are no dependencies and no build step.

## Deploy on Vercel

1. Push this folder to a **private** GitHub repository.
2. In Vercel, import the repository. There is no build command, and the output directory is the project root.
3. Under **Settings → Environment Variables**, add `ANTHROPIC_API_KEY` for Production. Optionally add `ANTHROPIC_MODEL`; it defaults to `claude-sonnet-5-5`.
4. Deploy. Until the key is set, the engine answers every message with a generic "not available" error.

For local development, copy `.env.example` to `.env.local`, fill in a low-limit development key, and run `vercel dev`.

## Editing the guide

Edit `data/gub.json`. Each entry needs `id`, `section` (one of the section ids), `title`, `summary`, `body` (an array of paragraphs), `tags` and `details` (label/value pairs). `steps` (an ordered list), `warning` (shown in coral) and `source` are optional. The engine picks up changes on the next deploy.

If you change the inline `<script>` in any page's `<head>`, recompute its sha256 and update the `Content-Security-Policy` in `vercel.json`, or the theme will stop restoring.

## Security notes

- `/api/chat` accepts POST only (405 otherwise) and requires a JSON content type. Bodies are capped at 32 KB, conversations at 30 messages, and each message at 4,000 characters. Only `user` and `assistant` roles are forwarded. The server alone chooses the model, `max_tokens` and system prompt.
- Requests whose `Origin` isn't this site get a 403. This stops other websites from using your engine, but **not scripts**, which can fake headers. It does not replace rate limits or spend caps.
- The built-in rate limiter (30 requests per visitor per 10 minutes) is per server instance and best effort. Add a Vercel Firewall rate-limit rule as well (see the checklist below).
- The upstream call times out after 25 s, below the function's 30 s limit. Errors return a generic message, and logs record status codes only.
- The system prompt contains nothing private, and it tells the model to treat guide text and user text as data, not instructions.
- The engine takes no real-world actions. It can't send email, book, browse or save anything.

## Do this by hand

- Create a dedicated Claude Console workspace for this project, set a monthly spend limit and spend alerts, and create a Production-only key there. Use a separate low-limit key, or none, for Preview and Development.
- Add `ANTHROPIC_API_KEY` in Vercel's Environment Variables.
- Add a Vercel Firewall rate-limit rule on `/api/chat`, for example 20 requests per 60 seconds per IP, returning 429.
- Keep the GitHub repository private. Turn on secret scanning and push protection under Settings → Code security.
- If a key is ever pasted into a chat, committed, or shown in a screenshot, revoke it in the Console and create a new one. Deleting it from the file isn't enough.
