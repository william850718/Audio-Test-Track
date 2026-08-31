# AudioTracker

Internal record-keeping for the audio certification lab: platform notices,
per-project test logs, and the instrument inventory. Around fifteen people use
it. It is a static page on GitHub Pages talking to Supabase — there is no
application server and no build step.

## Running it locally

**Double-clicking `index.html` does not work.** The page loads its code as ES
modules, and a browser refuses to fetch a module over `file://` — its origin is
`null`, so the CORS check can never pass. Nothing runs, and every button is dead
with nothing in the console to explain it.

```
aclab-start.bat
```

That serves the folder on <http://127.0.0.1:8765/> and opens it. Leave the window
open while you work. Needs Python on PATH.

## Layout

```
index.html                  markup, and one <script type="module">
aclab-start.bat             local server

frontend/src/
  main.js                   entry point: theme, initApp, listeners, wiring
  state.js                  the mutable state more than one module touches
  domain/                   the rules - no DOM, no network, testable on their own
  services/                 Supabase: rows, auth, storage, push, offline queue
  components/               reusable UI: cards, filters, uploaders, gauge, toasts
  views/                    the three modes, plus login
  export/                   PDF and JSON report builders
  utils/                    dates, formatting, downloads
  assets/app.css

backend/                    schema, RLS, and the deployment notes - see its README
supabase/functions/         Edge Function (must stay here; the CLI deploys by path)
.github/workflows/          weekly report (must stay here; GitHub requires it)
tests/selfCheck.js          72 assertions over the certification and archive rules
docs/weekly/                generated development reports
```

The dependency rule is one-way: `views` may use anything below them, `domain` and
`utils` import nothing but each other. `services` never imports a view — when the
data layer needs the screen redrawn it calls a function `main.js` gave it.

## Tests

Open the app and run `runSelfCheck()` in the console. It covers the certification
rules, the archive boundary and who may delete what — the parts where a mistake
is silent, because a wrong percentage still looks like a percentage.

## Two things that will bite you

**Deleting is real.** Closed items leave the list after 30 days but stay in the
database; only an admin removes them, and only on purpose. Nothing is on a timer.

**The repository is public.** Before pushing, check the diff for company email
addresses, keys, and anything from `專案規劃/` (which is gitignored because it
lists this system's open weaknesses). The Supabase anon key in the source is
meant to be there — RLS is the defence, not secrecy.
