# ArticleManager Pro

A user-friendly GUI for research workflows with **projects**, **articles**, **BibTeX**, **captures/screenshots**, and **NLP clustering**.

## What it does

- Create project workspaces (stored in SQLite).
- Add articles with title/source/notes and auto-inferred NLP cluster + keywords.
- Store BibTeX entries in a per-project database table.
- Save highlighted text and screenshot captures from the GUI or a browser extension.
- Preview captures directly in the app.

## Extension connectivity

Use this API from a browser extension content script:

- `POST /api/extension/capture`
  - `project` (required)
  - `capture_type` (`selection` or `screenshot`)
  - `selected_text` (optional)
  - `screenshot_data` (optional `data:image/...;base64,...`)
  - `page_url` (optional)

## Run

```bash
python app.py
```

Open: `http://localhost:5000`

## Data

- SQLite DB file: `article_manager.db`
