# ArticleManager Presentor

A user-friendly, survey-first research manager with a **database-backed GUI**, structured article understanding, captures, notes, comparison table maker, and LaTeX render preview.

## Key features

- Project workspace with taxonomy + writing outline.
- Dashboard intelligence: article counts, read/included stats, cluster distribution, missing BibTeX/analysis.
- Management tab dedicated to article CRUD + bulk file-driven article add.
- Separate Analysis tab for structured article analysis and capture/source memory.
- Article decision system fields:
  - role, task, method tags,
  - evidence strength,
  - relevance score,
  - read status,
  - decision flag.
- Structured article analysis form:
  - problem, setting, dataset, algorithm,
  - baselines, metrics, findings,
  - limitations, assumptions, future work,
  - commentary, extracted figures/equations/tables.
- Capture system with provenance:
  - source URL, page title, selected text, screenshot, tag, comment, timestamp, linked article.
- Noter tab for side-by-side note taking with pinning and anchor metadata.
- Comparison matrix builder:
  - preview rows,
  - LaTeX table export,
  - CSV output.
- BibTeX workflow:
  - article link,
  - validation warnings (missing author/year/title/venue, malformed).
- Export:
  - project CSV,
  - project `.bib`,
  - full database snapshot (`.db`) save/load from UI.
- LaTeX render tab using MathJax (live preview).
- Presenter upgrades:
  - full-screen toggle for center preview pane (Esc to exit),
  - zoom enable/disable with wheel + keyboard shortcuts,
  - fit-width zoom preset,
  - file tree search/filter,
  - direct `main.tex` render from Presenter,
  - bulk multi-file add into `SourceArticles/`.
- Project bootstrap defaults:
  - `SourceArticles/` and `.bib/` directories,
  - `main.tex` + `.bib/references.bib` created automatically,
  - each new article gets its own folder under `SourceArticles/`.
- NLP auto-tagging now combines stemming-aware keywords, keyphrase extraction, and weighted topic clustering.

## Run

```bash
python app.py
```

Open: `http://localhost:5000`

### LaTeX PDF rendering

`/api/latex/render` uses `pdflatex` from `PATH` by default. If the server process cannot see `PATH` (common on Windows services/IDEs), set `PDFLATEX_PATH` to an absolute executable path before starting the app.

Example (Windows):

```powershell
$env:PDFLATEX_PATH = "C:\Program Files\MiKTeX\miktex\bin\x64\pdflatex.exe"
python app.py
```

### Google Chrome extension (Open + RunT helper)

This repo now includes a Chrome extension in `chrome_extension/`.

What it does:
- Displays the default **RunT** command.
- **Open the Thing** button opens `http://localhost:5000`.
- **ReRun** button copies the RunT command so you can paste and run it in PowerShell.

Load it in Chrome:
1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `chrome_extension` folder.

Default RunT command shown by the extension:

```powershell
$env:PDFLATEX_PATH = "C:\Program Files\MiKTeX\miktex\bin\x64\pdflatex.exe"
& C:/Users/parib/AppData/Local/Programs/Python/Python310/python.exe c:/Users/parib/Desktop/ArticleManager/app.py
```


## API highlights

- `POST /api/projects`
- `GET /api/dashboard?project=...`
- `GET/POST /api/articles`
- `GET/POST /api/analysis`
- `GET/POST /api/bib`
- `GET/POST /api/notes`
- `GET/POST /api/checklist` + `PUT /api/checklist`
- `POST /api/extension/capture`
- `GET /api/comparison?project=...&article_ids=1,2,3`
- `GET /api/export/articles.csv?project=...`
- `GET /api/export/project.bib?project=...`
- `GET /api/database/export`
- `POST /api/database/import`

## Data

- SQLite database: `article_manager.db`
