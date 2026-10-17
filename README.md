# Little by little

A sketchbook-style **life in weeks**, built as a static website for GitHub Pages.

Enter a birthday, see the weeks you've lived, and color the seasons that shaped you. Import journals and bring your own AI API key to suggest chapters, or write chapters yourself. No server or account is required.

## Run locally

Requires Node.js 22.13+ (or a current Node.js LTS release).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The initial map is explicitly labeled as an example. Set your birthday to start your own map.

## Host on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch. Keep `node_modules/` and `dist/` ignored; never commit personal journals or API keys.
2. In the repository, go to **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**.
3. The included [workflow](.github/workflows/pages.yml) builds, checks, and deploys the site on every push to `main`. You can also run **Deploy to GitHub Pages** from the Actions tab.
4. When the workflow succeeds, open the Pages URL shown in the deployment. No custom domain or backend is required.

The Vite base is relative (`./`), so assets work at both a repository path such as `/life-in-weeks/` and a root domain. If your default branch has a different name, change the workflow's branch filter.

For manual hosting, run `npm run build` and upload the **contents of `dist/`** to any static host. Do not open `index.html` directly from the filesystem; use HTTP hosting.

## Journals and AI

- Import `.md`, `.markdown`, `.txt`, `.docx`, text-based `.pdf`, `.odt`, `.html`, or `.htm`; multiple documents and drag-and-drop are supported.
- Google Docs: **File → Download → Microsoft Word (.docx)**. Old `.doc`, `.docs`, Pages, and scanned PDFs should be exported to a supported text format first. Scanned PDFs need OCR.
- Files are read on the device. Preview and edit the extracted text before sending it. Dates in entries or filenames help the model identify grounded time ranges.
- Select **OpenAI**, **DeepSeek**, or an **OpenAI-compatible endpoint**, enter your own key and model, then explicitly send the journal for analysis. Custom endpoints can use HTTPS or an HTTP model running on localhost.
- Your provider must permit browser requests via CORS. This app cannot bypass a provider's CORS restrictions. For a provider that blocks browser requests, use an endpoint you control or add chapters manually. Never embed a shared API key in this public site.
- The integration uses `/chat/completions` and JSON output. The model name is editable. The model picker includes GPT-6.1 Sol, GPT-6 Astra, GPT-5.5, GPT-5.4, GPT-4.1 mini, DeepSeek V4 Pro, DeepSeek Flash, and a custom model name. Defaults are GPT-6.1 Sol and DeepSeek V4 Pro with high reasoning effort. Larger models and deeper reasoning can cost more and take longer; availability depends on your provider and account.
- Analysis supports journals of 100,000+ words, up to 5 million characters per analysis and 50 MB per file. Word, ODT, and PDF limits also accommodate long journals (PDFs up to 1,500 pages). The entire journal is read in sections of up to 20,000 characters, with four requests running concurrently by default. DeepSeek can use up to twelve concurrent requests. The UI shows word count, section count, a progress bar, and the percentage complete. Nothing at the end is silently discarded.
- You can pause reading, close the dialog, and continue in the same tab. Completed sections are tracked individually, even when responses arrive out of order, and retained in memory; a provider failure retries only the unfinished sections when you choose Continue. You can also review completed sections before the whole analysis finishes. Refreshing or closing the tab clears progress. No full journal or active checkpoint is written to disk. Applied entry fingerprints can be saved with the map. A failure stops new requests and cancels outstanding requests; completed sections remain available. There are no automatic paid retries.
- A content fingerprint prevents an old checkpoint being reused after changing the journal, birthday, model, or provider. Date and source headings are carried across section boundaries, and existing chapter names help keep repeated themes consistent.
- Date headings are resolved before any AI request. This includes yearless headings such as `Sept. 13 Note`, `Apr. 14`, `2.9`, English month names, ISO dates, and Chinese month/day headings. Missing years are inferred in chronological order, including December-to-January rollovers. Written years take priority. With no written years, the last entry defaults to its most recent occurrence on or before today; **Year of the last entry** makes this assumption visible and editable. Inspect the resolved date table before analysis.
- Every AI quote is bound to its actual entry ID and resolved date. A real quote with a made-up date is insufficient. A phase requires at least two supporting entries at least 14 days apart, and its endpoints are derived from those source dates instead of the model's claimed endpoints. Milestone dates must match a supporting entry. Undated text and conflicting chronology are not silently assigned today's date. AI can still interpret a passage or its dates incorrectly. Review every chapter; titles, dates, and summaries are editable before applying. The app does not diagnose mental health conditions.
- Major life events can become little pencil notes: a handwritten caption, a curved arrow, and a circle around the exact week. AI suggestions require dated evidence, and you can add or edit these yourself by clicking a week or using **Little landmarks**. The **Pencil notes** toggle hides the overlay. Only substantial turning points qualify as AI milestones: importance 4–5, with at most two per year and at least 90 days between them. Ordinary moods, meals, gestures, games, political opinions and brief conversations do not qualify. The map shows at most three widely spaced captions, with small circles for every dated milestone; select a landmark to bring its caption forward. All notes remain in the landmarks list and week details.
- Different chapters may overlap. Their colors share a square, and clicking a week displays all its chapters.

## Multiple DeepSeek keys and speed

In connection settings, add up to three additional DeepSeek keys (four total). Keys are masked, deduplicated, and kept only in tab memory; switching providers clears the key fields. No key is included in browser saving, map exports, or analysis checkpoints.

Auto starts four workers per unique key, capped at twelve total. **Sections at once** can instead be set to 4, 8, or 12, even with one key. Workers distribute requests across the supplied keys, without sending any section twice. Pause/resume tracks exact completed sections across all workers. On a provider error, new work stops and active requests are canceled; the error identifies the key by number without revealing it. There is no automatic key failover or paid retry.

DeepSeek concurrency limits apply per account, regardless of which API key is used. Multiple keys from one account do not multiply its quota; increasing request concurrency is what may shorten total ingestion time. [Provider concurrency documentation](https://api-docs.deepseek.com/quick_start/rate_limit/).

## Mood graph

Journal analysis also estimates the feelings expressed in each dated entry on a 1–5 scale, from heavier to lighter. It runs in the same concurrent request pool, without a separate analysis pass. Each estimate requires an exact quote bound to its source entry. Entries without sufficient personal emotional evidence are omitted.

Review the estimates and their evidence before applying; you can exclude individual entries or the entire mood graph. Weekly points align with the birthday-based calendar, and monthly points average the same entry estimates. Each entry gets one vote, including entries split across requests. Missing weeks/months remain gaps. Select a point or use the dropdown to read the underlying entries and jump to their calendar week.

These are interpretations of writing, not mental health measurements or diagnoses. Old analyses need a new pass to generate mood data. Mood estimates and their approved excerpts are included in JSON backups and optional browser saving. The example map uses clearly labeled illustrative data.

## Privacy and saving

There is no app database, analytics, or server-side journal processing. Fonts and dependencies are bundled locally.

API keys and imported journal text stay in tab memory and are cleared by refreshing or closing the tab. Requests go directly to the selected endpoint. API charges and the provider's data and retention policies apply. OpenAI requests set `store: false`, which does not override other provider retention rules.

By default, the map is temporary too. Turn on **Remember my map on this browser** under **Privacy & your data** to save your birthday, chapters, pencil notes, mood estimates, and approved journal excerpts in local storage. It does not save the API key or full journal. Local storage is not encrypted; anyone using the same browser profile can read it.

**Save my map** exports a restorable JSON backup or a printable SVG poster. JSON backups include approved excerpts, so keep them private. Restore a backup from the same menu or the privacy dialog. Restoring asks before replacing the current map. Browser data can be cleared from the privacy dialog.

## Year view and corrections

Choose **A year** above the map to explore a roomier grid of week squares. Each theme has its own colored pencil line beneath the weeks it covers, so several themes can run alongside each other. Continuation arrows carry long themes between rows. Click a square for all its chapters, or a line or label to edit that theme. Select a calendar year or use the arrows; arrow keys navigate week squares. Boundary weeks may touch two calendar years. On narrow screens, scroll the grid horizontally. Milestones remain circled on their weeks, with their captions below the grid.

AI analysis can suggest independent overlapping themes, including themes supported by the same journal entries. Existing overlaps appear immediately. To have the revised analysis look for additional threads in entries already processed, choose **Re-analyze every entry**; importing again in update mode only processes new or changed entries.

In the mood graph, open an entry and choose **Correct this estimate** to set your own rating and explanation. These corrections are marked as yours and survive journal updates. Chapter titles, dates, and summaries can be edited from their pencil button. Edited AI chapters/notes become manual corrections, and editing suggestions during review also marks them manual. The graph shows clickable milestone markers and event buttons within its displayed date range. The selected year filters mood data too.

## Updating your journal

Re-import the same journal file, using the default **Replace the text below** import mode. The preview reports new/changed entries, unchanged entries skipped, and the actual number of requests. Only changed/new entries are sent; there is no request when everything is unchanged. Choose **Append** when bringing in a different journal alongside the current text.

Processed entries are recognized by source filename, resolved date, occurrence on that date, and a SHA-256 content fingerprint. Inserting an earlier entry does not shift identities of later dates. Whitespace changes are ignored. Renaming a source file, changing inferred years, or moving between file import and pasted text can require a new pass. New entries alone may not provide enough evidence to suggest a sustained chapter; mood estimates can still be added.

Apply the review even when there are no suggested chapters to remember those processed entries. A partial review remembers only completely read entries; unfinished split entries remain pending. Changes refresh affected AI results while preserving manual chapters, notes, and mood corrections. Entries absent from an import do not erase another journal's history. **Re-analyze every entry** bypasses fingerprints for the imported journal, still preserving corrections.

Fingerprints and their date/source identifiers are part of JSON backups and optional browser saving. No full journal or API key is stored. Download your map or enable browser saving to carry update history and corrections between visits. Older maps have no fingerprints and need one initial pass to establish update history. Earlier unverified AI dates remain hidden until corrected or replaced.

## Calendar behavior

Weeks are consecutive seven-day intervals from the birthday, calculated with date-only UTC arithmetic so daylight-saving changes cannot shift them. The current week is filled and outlined. The “weeks lived” count reports completed weeks.

Rows group weeks by age at the start of the week, so a row can contain 52 or 53 week starts. A February 29 birthday is observed on February 28 in non-leap years. The canvas length is adjustable and is not a life expectancy prediction.

## Verification

```sh
npm run check
npm test
npm run build
npm audit
```

Tests cover overlapping theme lanes, continuation markers, theme focus, shared evidence with manual corrections, interval continuity, leap days, current-week boundaries, overlapping phases, invalid dates, journal chunking, verifiable excerpts, provider request payloads, malformed output, cancellation, API errors, a journal with more than 100,000 words, failure recovery without duplicate requests, content fingerprint invalidation, section boundary context, a four-request concurrency limit, out-of-order checkpoints, cancellation of sibling requests, exact-section resume, older checkpoint compatibility, yearless chronology, evidence-to-entry date binding, retrospective-date safety, and major-event curation. Browser verification uses synthetic entries, including a 100,000-word journal, and a local mock endpoint. A live DeepSeek V4 Pro check also validated early, spring, and recent samples from the user-authorized journal, with dates confined to each sample's source range. Private journal text is not included in the repository or test fixtures. No API key is included in the project.

## Sources and licenses

- [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [OpenAI JSON output guidance](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)
- [DeepSeek API documentation](https://api-docs.deepseek.com/)
- Caveat and DM Sans are bundled under the SIL Open Font License; licenses are in `public/fonts/`.
- Interface icons: [Lucide](https://lucide.dev/), ISC license.
- PDF text extraction: [PDF.js](https://github.com/mozilla/pdf.js), Apache 2.0 license. Office document ZIP extraction: [fflate](https://github.com/101arrowz/fflate), MIT license.

The pencil doodles and paper styling are drawn in SVG and CSS.

Model references: [OpenAI GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/).
