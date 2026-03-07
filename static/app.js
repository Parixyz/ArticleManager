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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function saveDatabaseSnapshot() {
  const blob = await fetch('/api/database/export').then((r) => {
    if (!r.ok) throw new Error('failed to export database');
    return r.blob();
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `article_manager_${stamp}.db`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 0);
}

async function loadDatabaseSnapshot() {
  const file = $('loadDbFile').files?.[0];
  if (!file) throw new Error('select a db file first');
  const db_data = await fileToDataUrl(file);
  await api('/api/database/import', { method: 'POST', body: JSON.stringify({ db_data }) });
  await refreshProjects();
  updateProjectLocationInfo();
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
  const payload = await api('/api/projects');
  const projects = Array.isArray(payload) ? payload : (payload.projects || []);
  window._projects = projects;
  window._defaultProjectRoot = Array.isArray(payload) ? '' : (payload.default_project_root || '');

  const select = $('projectSelect');
  select.innerHTML = '';
  for (const p of projects) {
    const o = document.createElement('option');
    o.value = p.name;
    o.textContent = p.name;
    select.appendChild(o);
  }
  if (projects.length) await loadAll();
  updateProjectLocationInfo();
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
      project_root: $('projectRoot').value,
    }),
  });
  $('projectName').value = '';
  $('projectDescription').value = '';
  $('projectTaxonomy').value = '';
  $('projectOutline').value = '';
  $('projectRoot').value = '';
  await refreshProjects();
  updateProjectLocationInfo();
}

function selectedProjectMeta() {
  const name = currentProject();
  return (window._projects || []).find((p) => p.name === name) || null;
}

function updateProjectLocationInfo() {
  const info = $('projectLocationInfo');
  if (!info) return;
  const m = selectedProjectMeta();
  if (!m) {
    const d = window._defaultProjectRoot || '(not set)';
    info.textContent = `Default root: ${d}`;
    return;
  }
  const root = m.project_root || window._defaultProjectRoot || '(not set)';
  const workspace = m.workspace_path || '(not set)';
  info.textContent = `Root: ${root} | Project location: ${workspace}`;
}

async function openProjectLocation() {
  const project = currentProject();
  if (!project) throw new Error('select a project first');
  const out = await api('/api/projects/open-location', {
    method: 'POST',
    body: JSON.stringify({ project }),
  });
  const path = out.workspace_path || selectedProjectMeta()?.workspace_path || '';
  updateProjectLocationInfo();
  alert(path ? `Opened: ${path}` : 'Project location opened');
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

  const tbody = document.querySelector('#articleTable tbody');
  tbody.innerHTML = '';
  for (const a of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.id}</td><td>${a.title}</td><td>${a.read_status}</td><td>${a.decision_flag}</td><td>${a.nlp_cluster}</td><td>${(a.tags || []).join(', ')}</td>`;
    tr.addEventListener('click', () => selectArticleForEdit(a));
    tbody.appendChild(tr);
  }

  renderManagementPlots(rows);
  fillArticleSelect('analysisArticleSelect', rows);
  fillArticleSelect('captureArticleSelect', rows);
  loadCaptureDocuments().catch(() => {});
  fillArticleSelect('noteArticleSelect', rows);
}

function selectArticleForEdit(a) {
  $('editArticleId').value = String(a.id);
  $('aTitle').value = a.title || '';
  $('aSource').value = a.source_url || '';
  $('aCategory').value = a.category || '';
  $('aTask').value = a.research_task || '';
  $('aMethodTags').value = (a.method_tags || []).join(', ');
  $('aAuthors').value = a.authors || '';
  $('aVenue').value = a.venue || '';
  $('aYear').value = a.year || '';
  $('aRole').value = a.role || 'background';
  $('aEvidence').value = a.evidence_strength || 'unclear';
  $('aRead').value = a.read_status || 'unread';
  $('aDecision').value = a.decision_flag || 'maybe';
  $('aRelevance').value = a.relevance_score || 50;
  $('aTags').value = (a.tags || []).join(', ');
  $('aNotes').value = a.notes || '';
  $('analysisArticleSelect').value = String(a.id);
  $('captureArticleSelect').value = String(a.id);
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

function articlePayloadFromEditor() {
  return {
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
}

function resetArticleEditor() {
  $('editArticleId').value = '';
  ['aTitle','aSource','aCategory','aTask','aMethodTags','aAuthors','aVenue','aYear','aNotes','aTags'].forEach((x) => ($(x).value = ''));
  $('aRole').value = 'background';
  $('aEvidence').value = 'unclear';
  $('aRead').value = 'unread';
  $('aDecision').value = 'maybe';
  $('aRelevance').value = '50';
}

async function addArticle() {
  const out = await api('/api/articles', { method: 'POST', body: JSON.stringify(articlePayloadFromEditor()) });
  $('addArticleMsg').textContent = `Cluster: ${out.nlp_cluster}; Keywords: ${(out.keywords || []).join(', ')}${out.duplicate_like?.length ? ' | duplicate warning!' : ''}`;
  resetArticleEditor();
  await loadAll();
}

async function updateArticle() {
  const article_id = Number($('editArticleId').value || 0);
  if (!article_id) throw new Error('select an article from the table first');
  await api('/api/articles/update', { method: 'POST', body: JSON.stringify({ article_id, ...articlePayloadFromEditor() }) });
  $('addArticleMsg').textContent = `Article ${article_id} updated`;
  await loadAll();
}

async function deleteArticle() {
  const article_id = Number($('editArticleId').value || 0);
  if (!article_id) throw new Error('select an article from the table first');
  await api('/api/articles/delete', { method: 'POST', body: JSON.stringify({ article_id, project: currentProject() }) });
  $('addArticleMsg').textContent = `Article ${article_id} deleted`;
  resetArticleEditor();
  await loadAll();
}

async function clearProjectArticles() {
  if (!confirm('Clear all project articles?')) return;
  await api('/api/articles/clear', { method: 'POST', body: JSON.stringify({ project: currentProject() }) });
  resetArticleEditor();
  $('addArticleMsg').textContent = 'All project articles were removed';
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

function hasBeamerFrameEnvironment(latex) {
  return /\\begin\s*\{frame\}/i.test(latex);
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
let presenterScale = 1;
let presenterSelected = { path: '', articleId: null };
let presenterFilesCache = [];

function setPresenterBulkMessage(msg, isError = false) {
  const el = $('presenterBulkAddMsg');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error-text', Boolean(isError));
}

function detectTextFromDataUrl(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const isBase64 = head.includes(';base64');
  const mime = (head.match(/^data:([^;]+)/) || [,''])[1] || 'application/octet-stream';
  if (!(mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('bib') || mime.includes('tex'))) return null;
  try {
    if (isBase64) return atob(body).slice(0, 12000);
    return decodeURIComponent(body).slice(0, 12000);
  } catch {
    return null;
  }
}

function applyPresenterZoom() {
  const zoomEnabled = $('presenterEnableZoom').checked;
  const scale = zoomEnabled ? presenterScale : 1;
  $('presenterPreviewFrameWrap').style.transform = `scale(${scale})`;
  $('presenterPreviewFrameWrap').style.transformOrigin = 'top left';
  $('zoomResetBtn').textContent = `${Math.round(scale * 100)}%`;
}

function renderPresenterFileTree() {
  const tree = $('presenterFileTree');
  tree.innerHTML = '';
  const query = $('presenterFileSearch').value.trim().toLowerCase();
  const sorted = [...presenterFilesCache].sort((a, b) => {
    if (a.file_type !== b.file_type) return a.file_type === 'directory' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
  for (const f of sorted) {
    if (query && !f.path.toLowerCase().includes(query)) continue;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'link-like';
    btn.textContent = `${f.file_type === 'directory' ? '📁' : '📄'} ${f.path}`;
    btn.disabled = f.file_type === 'directory';
    btn.addEventListener('click', async () => openPresenterFile(f));
    li.appendChild(btn);
    tree.appendChild(li);
  }
}

async function openPresenterMainTex() {
  const f = presenterFilesCache.find((x) => x.path === 'main.tex');
  if (!f) {
    alert('main.tex is missing');
    return;
  }
  await openPresenterFile(f);
}

async function openPresenterFile(f) {
  presenterSelected.path = f.path;
  $('presenterCurrentPath').textContent = f.path;

  if (f.path === 'main.tex') {
    const rendered = await api('/api/latex/render', {
      method: 'POST',
      body: JSON.stringify({ project: currentProject(), main_tex_path: 'main.tex' }),
    });
    $('presenterTextPreview').classList.add('hidden');
    $('presenterPdfFrame').classList.remove('hidden');
    $('presenterPdfFrame').src = rendered.pdf_data || '';
    await loadPresenterNotes();
    return;
  }

  const norm = f.path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const articleByNorm = Object.fromEntries((window._presenterArticles || []).map((a) => [a.title.toLowerCase().replace(/[^a-z0-9]/g, ''), a.id]));
  presenterSelected.articleId = articleByNorm[norm] || null;
  const d = await api(`/api/presenter/file-content?project=${encodeURIComponent(currentProject())}&path=${encodeURIComponent(f.path)}`);
  const content = d.content || '';
  const textPreview = detectTextFromDataUrl(content);
  if (textPreview !== null) {
    $('presenterTextPreview').classList.remove('hidden');
    $('presenterTextPreview').textContent = textPreview;
    $('presenterPdfFrame').classList.add('hidden');
  } else {
    $('presenterTextPreview').classList.add('hidden');
    $('presenterPdfFrame').classList.remove('hidden');
    $('presenterPdfFrame').src = content;
  }
  await loadPresenterNotes();
}

async function loadPresenterFiles() {
  const out = await api(`/api/presenter/files?project=${encodeURIComponent(currentProject())}`);
  presenterFilesCache = out.files || [];
  window._presenterArticles = out.articles || [];
  renderPresenterFileTree();
  if (!presenterSelected.path) {
    const main = presenterFilesCache.find((f) => f.path === 'main.tex');
    if (main) await openPresenterFile(main);
  }
}

async function addPresenterFilesToSourceArticles() {
  const files = Array.from($('presenterBulkFiles').files || []);
  if (!files.length) throw new Error('select files first');

  const added = [];
  const failed = [];
  setPresenterBulkMessage('');

  for (const file of files) {
    try {
      const file_data = await fileToDataUrl(file);
      await api('/api/articles/from-file', {
        method: 'POST',
        body: JSON.stringify({ project: currentProject(), file_name: file.name, file_data }),
      });
      added.push(file.name);
    } catch (e) {
      failed.push({ file: file.name, error: e.message || 'failed to add file' });
    }
  }

  $('presenterBulkFiles').value = '';

  if (added.length) {
    $('presenterCurrentPath').textContent = `Added ${added.length} file(s) to SourceArticles`;
  }

  if (failed.length) {
    const first = failed[0];
    const suffix = failed.length > 1 ? ` (+${failed.length - 1} more)` : '';
    setPresenterBulkMessage(`Added ${added.length}/${files.length}. Failed: ${first.file} — ${first.error}${suffix}`, true);
  } else {
    setPresenterBulkMessage(`Successfully added ${added.length} file(s) to SourceArticles.`);
  }

  await loadAll();
}

async function openPresenterSourceLocation() {
  const sourceDir = presenterFilesCache.find((f) => f.path === 'SourceArticles' && f.file_type === 'directory');
  if (!sourceDir) {
    throw new Error('SourceArticles folder is missing in this project');
  }
  presenterSelected.path = sourceDir.path;
  presenterSelected.articleId = null;
  $('presenterCurrentPath').textContent = `${sourceDir.path}/`;
  $('presenterTextPreview').classList.remove('hidden');
  $('presenterTextPreview').textContent = 'SourceArticles location opened. Select a file below this folder from the file list to preview it.';
  $('presenterPdfFrame').classList.add('hidden');
  await loadPresenterNotes();
}


async function togglePresenterFullView() {
  const pane = $('presenterViewerPane');
  pane.classList.toggle('fullscreen');
  if (pane.classList.contains('fullscreen') && document.fullscreenElement !== pane) {
    await pane.requestFullscreen?.().catch(() => {});
  }
  if (!pane.classList.contains('fullscreen') && document.fullscreenElement) {
    await document.exitFullscreen?.().catch(() => {});
  }
}

function fitPresenterWidth() {
  presenterScale = 1.4;
  applyPresenterZoom();
}

async function renderPresenterMainTex() {
  const result = await api('/api/latex/render', {
    method: 'POST',
    body: JSON.stringify({ project: currentProject(), main_tex_path: 'main.tex' }),
  });
  presenterSelected.path = 'main.tex';
  $('presenterCurrentPath').textContent = 'main.tex (rendered)';
  $('presenterTextPreview').classList.add('hidden');
  $('presenterPdfFrame').classList.remove('hidden');
  $('presenterPdfFrame').src = result.pdf_data || '';
}

async function savePresenterNote() {
  await api('/api/notes', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      article_id: presenterSelected.articleId,
      note_type: $('presenterNoteType').value,
      content: $('presenterNoteContent').value,
      source_anchor: `${$('presenterNoteAnchor').value} [${presenterSelected.path || 'general'}]`,
      is_pinned: false,
    }),
  });
  $('presenterNoteContent').value = '';
  await loadPresenterNotes();
}

async function loadPresenterNotes() {
  const rows = await api(`/api/notes?project=${encodeURIComponent(currentProject())}`);
  const ul = $('presenterNotesList');
  ul.innerHTML = '';
  const filtered = rows.filter((n) => {
    if (presenterSelected.articleId && n.article_id === presenterSelected.articleId) return true;
    if (presenterSelected.path && (n.source_anchor || '').includes(`[${presenterSelected.path}]`)) return true;
    return !presenterSelected.path;
  });
  for (const n of filtered) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${n.note_type}</strong><div>${n.content}</div><small>${n.source_anchor || '-'}</small>`;
    ul.appendChild(li);
  }
}

async function addArticleByFile() {
  const files = Array.from($('managementArticleFile').files || []);
  if (!files.length) throw new Error('select at least one file first');
  const clusters = [];
  for (const file of files) {
    const file_data = await fileToDataUrl(file);
    const out = await api('/api/articles/from-file', {
      method: 'POST',
      body: JSON.stringify({ project: currentProject(), file_name: file.name, file_data }),
    });
    clusters.push(`${file.name}: ${out.nlp_cluster}`);
  }
  $('managementArticleFile').value = '';
  $('addArticleMsg').textContent = `Added ${files.length} article file(s). ${clusters.slice(0, 3).join(' | ')}`;
  await loadAll();
}

function renderManagementPlots(rows) {
  const root = $('managementPlots');
  root.innerHTML = '';
  const counters = { tags: {}, decisions: {}, read: {} };
  for (const a of rows) {
    counters.decisions[a.decision_flag] = (counters.decisions[a.decision_flag] || 0) + 1;
    counters.read[a.read_status] = (counters.read[a.read_status] || 0) + 1;
    for (const t of (a.tags || [])) counters.tags[t] = (counters.tags[t] || 0) + 1;
  }
  const blocks = [
    ['Decision', counters.decisions],
    ['Read Status', counters.read],
    ['Top Tags', Object.fromEntries(Object.entries(counters.tags).sort((a,b)=>b[1]-a[1]).slice(0,8))],
  ];
  for (const [title, data] of blocks) {
    const card = document.createElement('div');
    card.className = 'metric';
    card.innerHTML = `<strong>${title}</strong>`;
    const total = Math.max(1, Object.values(data).reduce((x,y)=>x+y,0));
    for (const [k,v] of Object.entries(data)) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = `<span>${k} (${v})</span><i style="width:${Math.round((v/total)*100)}%"></i>`;
      card.appendChild(bar);
    }
    root.appendChild(card);
  }
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
  const source = $('latexInput').value;
  $('latexPreview').textContent = '';

  const result = await api('/api/latex/render', {
    method: 'POST',
    body: JSON.stringify({ latex: source }),
  });
  $('latexPdfFrame').src = result.pdf_data || '';
  $('latexRenderLog').textContent = result.log || '';
}

async function loadAll() {
  if (!currentProject()) return;
  syncExportLinks();
  await Promise.all([loadDashboard(), loadArticles(), loadCaptures(), loadNotes(), loadChecklist(), loadLatexFiles(), loadPresenterFiles(), loadPresenterNotes()]);
  await loadAnalysis();
}

function on(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}

on('createProjectBtn', 'click', () => createProject().then(saveDatabaseSnapshot).catch((e) => alert(e.message)));
on('openProjectLocationBtn', 'click', () => openProjectLocation().catch((e) => alert(e.message)));
on('refreshBtn', 'click', () => refreshProjects().catch((e) => alert(e.message)));
on('saveDbBtn', 'click', () => saveDatabaseSnapshot().catch((e) => alert(e.message)));
on('loadDbBtn', 'click', () => loadDatabaseSnapshot().catch((e) => alert(e.message)));
on('projectSelect', 'change', () => { updateProjectLocationInfo(); loadAll().catch((e) => alert(e.message)); });
on('applyFilterBtn', 'click', () => loadArticles().catch((e) => alert(e.message)));
on('clearArticlesBtn', 'click', () => clearProjectArticles().catch((e) => alert(e.message)));
on('autoFillArticleBtn', 'click', () => autoFillArticle().catch((e) => alert(e.message)));
on('addArticleBtn', 'click', () => addArticle().catch((e) => alert(e.message)));
on('updateArticleBtn', 'click', () => updateArticle().catch((e) => alert(e.message)));
on('deleteArticleBtn', 'click', () => deleteArticle().catch((e) => alert(e.message)));
on('analysisArticleSelect', 'change', () => loadAnalysis().catch((e) => alert(e.message)));
on('uploadArticleDocumentBtn', 'click', () => uploadArticleDocument().catch((e) => alert(e.message)));
on('saveAnalysisBtn', 'click', () => saveAnalysis().catch((e) => alert(e.message)));
on('saveArticleFileBtn', 'click', () => saveArticleFile().catch((e) => alert(e.message)));
on('captureArticleSelect', 'change', () => loadCaptureDocuments().catch((e) => alert(e.message)));
on('saveCaptureBtn', 'click', () => saveCapture().catch((e) => alert(e.message)));
on('saveNoteBtn', 'click', () => saveNote().catch((e) => alert(e.message)));
on('searchNotesBtn', 'click', () => loadNotes().catch((e) => alert(e.message)));
on('addCheckBtn', 'click', () => addChecklist().catch((e) => alert(e.message)));
on('saveLatexPathBtn', 'click', () => saveLatexPath().catch((e) => alert(e.message)));
on('saveLatexFileBtn', 'click', () => saveCurrentLatexFile().catch((e) => alert(e.message)));
on('renderLatexBtn', 'click', () => renderLatex().catch((e) => { $('latexRenderLog').textContent = e.message; alert(e.message); }));
on('zoomInBtn', 'click', () => { presenterScale = Math.min(3, presenterScale + 0.1); applyPresenterZoom(); });
on('zoomOutBtn', 'click', () => { presenterScale = Math.max(0.4, presenterScale - 0.1); applyPresenterZoom(); });
on('zoomResetBtn', 'click', () => { presenterScale = 1; applyPresenterZoom(); });
on('savePresenterNoteBtn', 'click', () => savePresenterNote().catch((e) => alert(e.message)));
on('addArticleByFileBtn', 'click', () => addArticleByFile().catch((e) => alert(e.message)));
on('presenterBulkAddBtn', 'click', () => addPresenterFilesToSourceArticles().catch((e) => { setPresenterBulkMessage(e.message, true); alert(e.message); }));
on('presenterOpenSourceBtn', 'click', () => openPresenterSourceLocation().catch((e) => { setPresenterBulkMessage(e.message, true); alert(e.message); }));
on('presenterFileSearch', 'input', () => renderPresenterFileTree());
on('presenterFullViewBtn', 'click', () => togglePresenterFullView());
on('zoomFitBtn', 'click', () => fitPresenterWidth());
on('presenterEnableZoom', 'change', () => applyPresenterZoom());
on('presenterRenderMainBtn', 'click', () => renderPresenterMainTex().catch((e) => alert(e.message)));
on('presenterOpenMainBtn', 'click', () => openPresenterMainTex().catch((e) => alert(e.message)));

$('presenterPreviewFrameWrap').addEventListener('wheel', (e) => {
  if (!$('presenterEnableZoom').checked || !e.ctrlKey) return;
  e.preventDefault();
  presenterScale = Math.max(0.4, Math.min(3, presenterScale + (e.deltaY < 0 ? 0.1 : -0.1)));
  applyPresenterZoom();
}, { passive: false });

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) $('presenterViewerPane').classList.remove('fullscreen');
});

document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') { $('presenterViewerPane').classList.remove('fullscreen'); if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {}); }
  if (e.key === '+' && $('presenterEnableZoom').checked) { presenterScale = Math.min(3, presenterScale + 0.1); applyPresenterZoom(); }
  if (e.key === '-' && $('presenterEnableZoom').checked) { presenterScale = Math.max(0.4, presenterScale - 0.1); applyPresenterZoom(); }
});

applyPresenterZoom();
refreshProjects().catch(() => {});
