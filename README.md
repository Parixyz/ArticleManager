# ArticleManager Presentor

A user-friendly, survey-first research manager with a **database-backed GUI**, structured article understanding, captures, notes, comparison table maker, and LaTeX render preview.

## Key features

- Project workspace with taxonomy + writing outline.
- Dashboard intelligence: article counts, read/included stats, cluster distribution, missing BibTeX/analysis.
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
  - project `.bib`.
- LaTeX render tab using MathJax (live preview).

## Run

```bash
python app.py
```

Open: `http://localhost:5000`

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

## Data

- SQLite database: `article_manager.db`
