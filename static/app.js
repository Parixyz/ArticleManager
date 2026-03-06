const $ = (id) => document.getElementById(id);
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(tab.dataset.target).classList.add('active');
  });
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'request failed' }));
    throw new Error(err.error || 'request failed');
  }
  return res.json();
}

function currentProject() {
  return $('projectSelect').value;
}

function syncExportLinks() {
  const p = encodeURIComponent(currentProject() || '');
  $('exportCsvLink').href = `/api/export/articles.csv?project=${p}`;
  $('exportBibLink').href = `/api/export/project.bib?project=${p}`;
}

function parseMethodTags(raw) {
  return raw.split(',').map((x) => x.trim()).filter(Boolean);
}

async function refreshProjects() {
  const projects = await api('/api/projects');
  const select = $('projectSelect');
  select.innerHTML = '';
  for (const p of projects) {
    const o = document.createElement('option');
    o.value = p.name;
    o.textContent = p.name;
    select.appendChild(o);
  }
  if (projects.length) await loadAll();
  syncExportLinks();
}

async function createProject() {
  await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: $('projectName').value,
      description: $('projectDescription').value,
      taxonomy: $('projectTaxonomy').value,
      writing_outline: $('projectOutline').value,
    }),
  });
  $('projectName').value = '';
  $('projectDescription').value = '';
  $('projectTaxonomy').value = '';
  $('projectOutline').value = '';
  await refreshProjects();
}

function articleOptionValue(a) {
  return `${a.id} — ${a.title}`;
}

function fillArticleSelect(selectId, rows) {
  const s = $(selectId);
  s.innerHTML = '';
  for (const a of rows) {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = articleOptionValue(a);
    s.appendChild(o);
  }
}

async function loadDashboard() {
  const data = await api(`/api/dashboard?project=${encodeURIComponent(currentProject())}`);
  const grid = $('dashboardGrid');
  grid.innerHTML = '';
  const cards = [
    ['Articles', data.articles],
    ['Read', data.read],
    ['Included', data.included],
    ['Missing BibTeX', data.missing_bib],
    ['Missing Analysis', data.missing_analysis],
    ['Clusters', (data.cluster_distribution || []).map((x) => `${x.nlp_cluster}:${x.c}`).join(', ') || 'none'],
  ];
  for (const [k, v] of cards) {
    const c = document.createElement('div');
    c.className = 'metric';
    c.innerHTML = `<strong>${k}</strong><div>${v}</div>`;
    grid.appendChild(c);
  }
}

async function loadArticles() {
  const q = new URLSearchParams({ project: currentProject() });
  if ($('searchQuery').value.trim()) q.set('search', $('searchQuery').value.trim());
  if ($('filterDecision').value) q.set('decision_flag', $('filterDecision').value);
  if ($('filterRead').value) q.set('read_status', $('filterRead').value);
  if ($('filterCategory').value.trim()) q.set('category', $('filterCategory').value.trim());
  if ($('filterCluster').value.trim()) q.set('nlp_cluster', $('filterCluster').value.trim());
  if ($('filterTag').value.trim()) q.set('tag', $('filterTag').value.trim());
  const rows = await api(`/api/articles?${q.toString()}`);
  const ul = $('articleList');
  ul.innerHTML = '';
  const groups = {};
  const groupBy = $('groupBy').value;
  $('articleGroups').innerHTML = '';
  for (const a of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>[${a.id}] ${a.title}</strong> <span class='badge'>${a.role}</span> <span class='badge info'>${a.nlp_cluster}</span>
      <div><small>task:${a.research_task || '-'} | methods:${(a.method_tags||[]).join(', ')} | tags:${(a.tags||[]).join(', ')} | evidence:${a.evidence_strength} | relevance:${a.relevance_score}</small></div>
      <div><small>read:${a.read_status} | decision:${a.decision_flag} | venue:${a.venue || '-'} (${a.year || '-'}) | category:${a.category || '-'}</small></div>`;
    ul.appendChild(li);
    const key = groupBy === 'category' ? (a.category || 'uncategorized') : groupBy === 'cluster' ? (a.nlp_cluster || 'general') : '';
    if (key) groups[key] = (groups[key] || 0) + 1;
  }
  if (groupBy !== 'none') {
    const g = $('articleGroups');
    Object.entries(groups).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      const chip = document.createElement('span');
      chip.className = 'badge';
      chip.textContent = `${k}: ${v}`;
      g.appendChild(chip);
    });
  }
  fillArticleSelect('analysisArticleSelect', rows);
  fillArticleSelect('captureArticleSelect', rows);
  loadCaptureDocuments().catch(() => {});
  fillArticleSelect('noteArticleSelect', rows);
}

async function autoFillArticle() {
  const out = await api('/api/articles/autofill', {
    method: 'POST',
    body: JSON.stringify({
      title: $('aTitle').value,
      notes: $('aNotes').value,
      source_url: $('aSource').value,
    }),
  });
  if (!$('aCategory').value) $('aCategory').value = out.category || '';
  if (!$('aVenue').value) $('aVenue').value = out.venue || '';
  if (!$('aYear').value) $('aYear').value = out.year || '';
  if (!$('aTags').value) $('aTags').value = (out.tags || []).join(', ');
}

async function addArticle() {
  const payload = {
    project: currentProject(),
    title: $('aTitle').value,
    source_url: $('aSource').value,
    category: $('aCategory').value,
    research_task: $('aTask').value,
    method_tags: parseMethodTags($('aMethodTags').value),
    tags: parseMethodTags($('aTags').value),
    authors: $('aAuthors').value,
    venue: $('aVenue').value,
    year: $('aYear').value,
    role: $('aRole').value,
    evidence_strength: $('aEvidence').value,
    read_status: $('aRead').value,
    decision_flag: $('aDecision').value,
    relevance_score: Number($('aRelevance').value || 50),
    notes: $('aNotes').value,
  };
  const out = await api('/api/articles', { method: 'POST', body: JSON.stringify(payload) });
  $('addArticleMsg').textContent = `Cluster: ${out.nlp_cluster}; Keywords: ${(out.keywords || []).join(', ')}${out.duplicate_like?.length ? ' | duplicate warning!' : ''}`;
  ['aTitle','aSource','aCategory','aTask','aMethodTags','aAuthors','aVenue','aYear','aNotes','aTags'].forEach((x) => ($(x).value = ''));
  await loadAll();
}

async function uploadArticleDocument() {
  const file = $('articleDocumentFile').files[0];
  const article_id = Number($('analysisArticleSelect').value || 0);
  if (!file || !article_id) throw new Error('select article and file');
  const file_data = await fileToDataUrl(file);
  await api('/api/article-documents', {
    method: 'POST',
    body: JSON.stringify({ article_id, file_name: file.name, mime_type: file.type || 'application/octet-stream', file_data }),
  });
  $('articleDocumentFile').value = '';
  await loadArticleDocuments();
}

async function loadArticleDocuments() {
  const article_id = Number($('analysisArticleSelect').value || 0);
  if (!article_id) return;
  const rows = await api(`/api/article-documents?article_id=${article_id}`);
  const ul = $('articleDocumentList');
  ul.innerHTML = '';
  const capSel = $('captureDocumentSelect');
  capSel.innerHTML = '<option value="">No source file</option>';
  for (const d of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${d.file_name}</strong> <small>${d.mime_type}</small>`;
    ul.appendChild(li);
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.id} - ${d.file_name}`;
    capSel.appendChild(o);
  }
}

async function loadAnalysis() {
  const articleId = $('analysisArticleSelect').value;
  if (!articleId) return;
  const d = await api(`/api/analysis?article_id=${articleId}`);
  const fileData = await api(`/api/article-files?article_id=${articleId}`);
  const map = {
    fProblem: 'problem_statement',
    fSetting: 'setting_domain',
    fDataset: 'dataset_environment',
    fModel: 'model_algorithm',
    fBaselines: 'baseline_methods',
    fMetrics: 'evaluation_metrics',
    fFindings: 'key_findings',
    fLimitations: 'limitations',
    fAssumptions: 'assumptions',
    fFuture: 'future_work',
    fCommentary: 'commentary',
    fFigures: 'extracted_figures',
    fEquations: 'extracted_equations',
    fTables: 'extracted_tables',
  };
  for (const [id, key] of Object.entries(map)) $(id).value = d[key] || '';
  $('afName').value = fileData.file_name || 'primary';
  $('afFullText').value = fileData.full_text || '';
  $('afSections').value = fileData.section_segmentation || '';
  $('afReferences').value = fileData.references_extraction || '';
  $('afMetadata').value = fileData.metadata_extraction || '';
  await loadArticleDocuments();
}

async function saveAnalysis() {
  await api('/api/analysis', {
    method: 'POST',
    body: JSON.stringify({
      article_id: Number($('analysisArticleSelect').value),
      problem_statement: $('fProblem').value,
      setting_domain: $('fSetting').value,
      dataset_environment: $('fDataset').value,
      model_algorithm: $('fModel').value,
      baseline_methods: $('fBaselines').value,
      evaluation_metrics: $('fMetrics').value,
      key_findings: $('fFindings').value,
      limitations: $('fLimitations').value,
      assumptions: $('fAssumptions').value,
      future_work: $('fFuture').value,
      commentary: $('fCommentary').value,
      extracted_figures: $('fFigures').value,
      extracted_equations: $('fEquations').value,
      extracted_tables: $('fTables').value,
    }),
  });
  alert('analysis saved');
}

async function saveArticleFile() {
  await api('/api/article-files', {
    method: 'POST',
    body: JSON.stringify({
      article_id: Number($('analysisArticleSelect').value),
      file_name: $('afName').value,
      full_text: $('afFullText').value,
      section_segmentation: $('afSections').value,
      references_extraction: $('afReferences').value,
      metadata_extraction: $('afMetadata').value,
    }),
  });
  alert('article file saved');
}

function extractDocumentBody(latex) {
  const begin = latex.match(/\\begin\s*\{document\}/i);
  const end = latex.match(/\\end\s*\{document\}/i);
  if (!begin || !end || begin.index >= end.index) return latex;
  const startIdx = begin.index + begin[0].length;
  return latex.slice(startIdx, end.index).trim();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadCaptureDocuments() {
  const article_id = Number($('captureArticleSelect').value || 0);
  const capSel = $('captureDocumentSelect');
  capSel.innerHTML = '<option value="">No source file</option>';
  if (!article_id) return;
  const rows = await api(`/api/article-documents?article_id=${article_id}`);
  for (const d of rows) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.id} - ${d.file_name}`;
    capSel.appendChild(o);
  }
}

async function saveCapture() {
  const file = $('captureFile').files[0];
  const screenshot_data = file ? await fileToDataUrl(file) : '';
  await api('/api/extension/capture', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      article_id: Number($('captureArticleSelect').value || 0) || null,
      document_id: Number($('captureDocumentSelect').value || 0) || null,
      capture_type: screenshot_data ? 'screenshot' : 'selection',
      screenshot_data,
      selected_text: $('captureText').value,
      page_url: $('captureUrl').value,
      page_title: $('captureTitle').value,
      tag: $('captureTag').value,
      comment: $('captureComment').value,
    }),
  });
  $('captureFile').value = '';
  $('captureText').value = '';
  $('captureUrl').value = '';
  $('captureTitle').value = '';
  $('captureTag').value = '';
  $('captureComment').value = '';
  await loadCaptures();
}

async function loadCaptures() {
  const rows = await api(`/api/captures?project=${encodeURIComponent(currentProject())}`);
  const grid = $('captureGrid');
  const gallery = $('captureGallery');
  grid.innerHTML = '';
  gallery.innerHTML = '';
  for (const c of rows) {
    const card = document.createElement('div');
    card.className = 'capture';
    const img = c.screenshot_data ? `<img src="${c.screenshot_data}" alt="capture" />` : '';
    card.innerHTML = `<small>${c.created_at}</small><div><strong>${c.page_title || 'no title'}</strong></div>
      <div><small>${c.page_url || '-'}</small></div>
      <div><small>tag:${c.tag || '-'} | article:${c.article_id || '-'} | file:${c.document_name || c.document_id || '-'}</small></div>
      <p>${c.selected_text || ''}</p><p>${c.comment || ''}</p>${img}`;
    grid.appendChild(card);
    if (c.screenshot_data) {
      const g = document.createElement('div');
      g.className = 'capture';
      g.innerHTML = `<img src="${c.screenshot_data}" alt="capture" /><small>article:${c.article_id || '-'} doc:${c.document_id || '-'} tag:${c.tag || '-'}</small>`;
      gallery.appendChild(g);
    }
  }
}

async function saveNote() {
  await api('/api/notes', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      article_id: Number($('noteArticleSelect').value || 0) || null,
      note_type: $('noteType').value,
      content: $('noteContent').value,
      is_pinned: $('notePinned').checked,
      source_anchor: $('noteAnchor').value,
    }),
  });
  $('noteContent').value = '';
  await loadNotes();
}

async function loadNotes() {
  const q = new URLSearchParams({ project: currentProject() });
  if ($('noteSearch').value.trim()) q.set('search', $('noteSearch').value.trim());
  const rows = await api(`/api/notes?${q.toString()}`);
  const ul = $('notesList');
  ul.innerHTML = '';
  for (const n of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${n.note_type}</strong> ${n.is_pinned ? '📌' : ''}<div>${n.content}</div><small>anchor:${n.source_anchor || '-'} article:${n.article_id || '-'}</small>`;
    ul.appendChild(li);
  }
}

async function buildComparison() {
  const ids = $('comparisonIds').value;
  const out = await api(`/api/comparison?project=${encodeURIComponent(currentProject())}&article_ids=${encodeURIComponent(ids)}`);
  $('comparisonPreview').textContent = JSON.stringify(out.rows, null, 2);
  $('latexTableOut').textContent = out.latex;
  $('csvOut').textContent = out.csv;
}

async function loadChecklist() {
  const rows = await api(`/api/checklist?project=${encodeURIComponent(currentProject())}`);
  const ul = $('checkList');
  ul.innerHTML = '';
  for (const c of rows) {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!c.is_done;
    cb.addEventListener('change', async () => {
      await api('/api/checklist', { method: 'PUT', body: JSON.stringify({ id: c.id, is_done: cb.checked }) });
    });
    li.appendChild(cb);
    li.append(` ${c.item_text}`);
    ul.appendChild(li);
  }
}

async function addChecklist() {
  await api('/api/checklist', {
    method: 'POST',
    body: JSON.stringify({ project: currentProject(), item_text: $('checkItem').value }),
  });
  $('checkItem').value = '';
  await loadChecklist();
}

function selectedLatexPath() {
  return $('latexCurrentPath').value.trim();
}

function latexFileTreeNode(file) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.textContent = `${file.file_type === 'directory' ? '📁' : '📄'} ${file.path}`;
  btn.className = 'link-like';
  btn.addEventListener('click', () => {
    $('latexCurrentPath').value = file.path;
    if (file.file_type === 'file') $('latexInput').value = file.content || '';
  });
  li.appendChild(btn);
  return li;
}

async function loadLatexFiles() {
  const rows = await api(`/api/project-files?project=${encodeURIComponent(currentProject())}`);
  const tree = $('latexFileTree');
  tree.innerHTML = '';
  for (const f of rows) tree.appendChild(latexFileTreeNode(f));

  const firstTex = rows.find((r) => r.file_type === 'file' && r.path.endsWith('.tex'));
  if (!selectedLatexPath() && firstTex) {
    $('latexCurrentPath').value = firstTex.path;
    $('latexInput').value = firstTex.content || '';
  }
}

async function saveLatexPath() {
  const path = $('latexPathInput').value.trim();
  const file_type = $('latexPathType').value;
  if (!path) throw new Error('path is required');
  await api('/api/project-files', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      path,
      file_type,
      content: file_type === 'file' ? (path.endsWith('.tex') ? $('latexInput').value : '') : '',
    }),
  });
  $('latexPathInput').value = '';
  await loadLatexFiles();
}

async function saveCurrentLatexFile() {
  const path = selectedLatexPath() || $('latexPathInput').value.trim();
  if (!path) throw new Error('select or provide a file path');
  await api('/api/project-files', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      path,
      file_type: 'file',
      content: $('latexInput').value,
    }),
  });
  $('latexCurrentPath').value = path;
  await loadLatexFiles();
}

async function renderLatex() {
  $('latexPreview').textContent = extractDocumentBody($('latexInput').value);
  if (window.MathJax?.typesetPromise) {
    await window.MathJax.typesetPromise([$('latexPreview')]);
  }
  const result = await api('/api/latex/render', {
    method: 'POST',
    body: JSON.stringify({ latex: $('latexInput').value }),
  });
  $('latexPdfFrame').src = result.pdf_data || '';
  $('latexRenderLog').textContent = result.log || '';
}

async function loadAll() {
  if (!currentProject()) return;
  syncExportLinks();
  await Promise.all([loadDashboard(), loadArticles(), loadCaptures(), loadNotes(), loadChecklist(), loadLatexFiles()]);
  await loadAnalysis();
}

$('createProjectBtn').addEventListener('click', () => createProject().catch((e) => alert(e.message)));
$('refreshBtn').addEventListener('click', () => refreshProjects().catch((e) => alert(e.message)));
$('projectSelect').addEventListener('change', () => loadAll().catch((e) => alert(e.message)));
$('applyFilterBtn').addEventListener('click', () => loadArticles().catch((e) => alert(e.message)));
$('autoFillArticleBtn').addEventListener('click', () => autoFillArticle().catch((e) => alert(e.message)));
$('addArticleBtn').addEventListener('click', () => addArticle().catch((e) => alert(e.message)));
$('analysisArticleSelect').addEventListener('change', () => loadAnalysis().catch((e) => alert(e.message)));
$('uploadArticleDocumentBtn').addEventListener('click', () => uploadArticleDocument().catch((e) => alert(e.message)));
$('groupBy').addEventListener('change', () => loadArticles().catch((e) => alert(e.message)));
$('saveAnalysisBtn').addEventListener('click', () => saveAnalysis().catch((e) => alert(e.message)));
$('saveArticleFileBtn').addEventListener('click', () => saveArticleFile().catch((e) => alert(e.message)));
$('captureArticleSelect').addEventListener('change', () => loadCaptureDocuments().catch((e) => alert(e.message)));
$('saveCaptureBtn').addEventListener('click', () => saveCapture().catch((e) => alert(e.message)));
$('saveNoteBtn').addEventListener('click', () => saveNote().catch((e) => alert(e.message)));
$('searchNotesBtn').addEventListener('click', () => loadNotes().catch((e) => alert(e.message)));
$('buildTableBtn').addEventListener('click', () => buildComparison().catch((e) => alert(e.message)));
$('addCheckBtn').addEventListener('click', () => addChecklist().catch((e) => alert(e.message)));
$('saveLatexPathBtn').addEventListener('click', () => saveLatexPath().catch((e) => alert(e.message)));
$('saveLatexFileBtn').addEventListener('click', () => saveCurrentLatexFile().catch((e) => alert(e.message)));
$('renderLatexBtn').addEventListener('click', () => renderLatex().catch((e) => { $('latexRenderLog').textContent = e.message; alert(e.message); }));

refreshProjects().catch(() => {});
