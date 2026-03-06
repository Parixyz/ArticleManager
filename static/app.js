const ui = {
  projectName: document.getElementById('projectName'),
  projectDescription: document.getElementById('projectDescription'),
  createProjectBtn: document.getElementById('createProjectBtn'),
  projectSelect: document.getElementById('projectSelect'),
  refreshBtn: document.getElementById('refreshBtn'),
  articleTitle: document.getElementById('articleTitle'),
  articleCategory: document.getElementById('articleCategory'),
  articleSource: document.getElementById('articleSource'),
  articleNotes: document.getElementById('articleNotes'),
  addArticleBtn: document.getElementById('addArticleBtn'),
  clusterHint: document.getElementById('clusterHint'),
  articlesList: document.getElementById('articlesList'),
  bibKey: document.getElementById('bibKey'),
  bibContent: document.getElementById('bibContent'),
  saveBibBtn: document.getElementById('saveBibBtn'),
  bibList: document.getElementById('bibList'),
  screenshotFile: document.getElementById('screenshotFile'),
  captureUrl: document.getElementById('captureUrl'),
  uploadCaptureBtn: document.getElementById('uploadCaptureBtn'),
  selectedText: document.getElementById('selectedText'),
  saveTextCaptureBtn: document.getElementById('saveTextCaptureBtn'),
  capturesGrid: document.getElementById('capturesGrid'),
  extensionSnippet: document.getElementById('extensionSnippet'),
};

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

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
  return ui.projectSelect.value;
}

function setExtensionSnippet() {
  ui.extensionSnippet.textContent = `// Chrome extension content script example\nconst selectedText = window.getSelection().toString();\nconst payload = {\n  project: '${currentProject() || 'YOUR_PROJECT'}',\n  capture_type: 'selection',\n  selected_text: selectedText,\n  page_url: window.location.href\n};\nfetch('http://localhost:5000/api/extension/capture', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify(payload)\n});`;
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
  });
}

async function refreshProjects() {
  const projects = await api('/api/projects');
  ui.projectSelect.innerHTML = '';
  for (const p of projects) {
    const option = document.createElement('option');
    option.value = p.name;
    option.textContent = p.name;
    ui.projectSelect.appendChild(option);
  }
  if (projects.length) {
    await loadAll();
  } else {
    ui.articlesList.innerHTML = '';
    ui.bibList.innerHTML = '';
    ui.capturesGrid.innerHTML = '';
  }
  setExtensionSnippet();
}

async function createProject() {
  await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: ui.projectName.value,
      description: ui.projectDescription.value,
    }),
  });
  ui.projectName.value = '';
  ui.projectDescription.value = '';
  await refreshProjects();
}

async function loadArticles() {
  const rows = await api(`/api/articles?project=${encodeURIComponent(currentProject())}`);
  ui.articlesList.innerHTML = '';
  for (const a of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${a.title}</strong> <span class="badge">${a.category}</span> <span class="badge info">${a.nlp_cluster}</span><br/><small>${a.source_url || ''}</small><br/><small>keywords: ${(a.keywords || []).join(', ')}</small>`;
    ui.articlesList.appendChild(li);
  }
}

async function addArticle() {
  const out = await api('/api/articles', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      title: ui.articleTitle.value,
      category: ui.articleCategory.value,
      source_url: ui.articleSource.value,
      notes: ui.articleNotes.value,
    }),
  });
  ui.clusterHint.textContent = `NLP cluster: ${out.nlp_cluster} | keywords: ${(out.keywords || []).join(', ')}`;
  ui.articleTitle.value = '';
  ui.articleCategory.value = '';
  ui.articleSource.value = '';
  ui.articleNotes.value = '';
  await loadArticles();
}

async function loadBib() {
  const rows = await api(`/api/bib?project=${encodeURIComponent(currentProject())}`);
  ui.bibList.innerHTML = '';
  for (const b of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${b.bib_key}</strong><pre>${b.bib_content.replace(/</g, '&lt;')}</pre>`;
    ui.bibList.appendChild(li);
  }
}

async function saveBib() {
  await api('/api/bib', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      bib_key: ui.bibKey.value,
      bib_content: ui.bibContent.value,
    }),
  });
  ui.bibKey.value = '';
  ui.bibContent.value = '';
  await loadBib();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadScreenshotCapture() {
  const file = ui.screenshotFile.files[0];
  if (!file) return;
  const screenshotData = await fileToDataUrl(file);
  await api('/api/extension/capture', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      capture_type: 'screenshot',
      screenshot_data: screenshotData,
      page_url: ui.captureUrl.value,
    }),
  });
  ui.screenshotFile.value = '';
  ui.captureUrl.value = '';
  await loadCaptures();
}

async function saveTextCapture() {
  await api('/api/extension/capture', {
    method: 'POST',
    body: JSON.stringify({
      project: currentProject(),
      capture_type: 'selection',
      selected_text: ui.selectedText.value,
      page_url: ui.captureUrl.value,
    }),
  });
  ui.selectedText.value = '';
  await loadCaptures();
}

async function loadCaptures() {
  const rows = await api(`/api/captures?project=${encodeURIComponent(currentProject())}`);
  ui.capturesGrid.innerHTML = '';
  for (const c of rows) {
    const card = document.createElement('div');
    card.className = 'capture';
    const text = c.selected_text ? `<p>${c.selected_text}</p>` : '';
    const img = c.screenshot_data ? `<img src="${c.screenshot_data}" alt="capture" />` : '';
    card.innerHTML = `<small>${c.capture_type} • ${c.page_url || 'no-url'}</small>${text}${img}`;
    ui.capturesGrid.appendChild(card);
  }
}

async function loadAll() {
  if (!currentProject()) return;
  await Promise.all([loadArticles(), loadBib(), loadCaptures()]);
  setExtensionSnippet();
}

ui.createProjectBtn.addEventListener('click', () => createProject().catch((e) => alert(e.message)));
ui.refreshBtn.addEventListener('click', () => refreshProjects().catch((e) => alert(e.message)));
ui.projectSelect.addEventListener('change', () => loadAll().catch((e) => alert(e.message)));
ui.addArticleBtn.addEventListener('click', () => addArticle().catch((e) => alert(e.message)));
ui.saveBibBtn.addEventListener('click', () => saveBib().catch((e) => alert(e.message)));
ui.uploadCaptureBtn.addEventListener('click', () => uploadScreenshotCapture().catch((e) => alert(e.message)));
ui.saveTextCaptureBtn.addEventListener('click', () => saveTextCapture().catch((e) => alert(e.message)));

refreshProjects().catch(() => {
  setExtensionSnippet();
});
