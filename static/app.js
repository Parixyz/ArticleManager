const storeKey = 'latexArticleManagerStore';

const projectNameInput = document.getElementById('projectName');
const createProjectBtn = document.getElementById('createProjectBtn');
const projectSelect = document.getElementById('projectSelect');
const articleTitleInput = document.getElementById('articleTitle');
const articleCategoryInput = document.getElementById('articleCategory');
const articleSourceInput = document.getElementById('articleSource');
const addArticleBtn = document.getElementById('addArticleBtn');
const articlesList = document.getElementById('articlesList');
const bibContent = document.getElementById('bibContent');
const bibSaveMsg = document.getElementById('bibSaveMsg');
const saveBibBtn = document.getElementById('saveBibBtn');
const screenshotFile = document.getElementById('screenshotFile');
const uploadShotBtn = document.getElementById('uploadShotBtn');
const screenshotsList = document.getElementById('screenshotsList');

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

function sanitize(name) {
  return name.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

function loadStore() {
  const raw = localStorage.getItem(storeKey);
  if (!raw) return { projects: {} };
  return JSON.parse(raw);
}

function saveStore(store) {
  localStorage.setItem(storeKey, JSON.stringify(store));
}

function currentProjectName() {
  return projectSelect.value;
}

function ensureProject(store, name) {
  if (!store.projects[name]) {
    store.projects[name] = {
      articles: [],
      bib: '% BibTeX entries\n',
      screenshots: [],
    };
  }
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    panels.forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.target).classList.add('active');
  });
}

function refreshProjects() {
  const store = loadStore();
  const names = Object.keys(store.projects).sort();
  projectSelect.innerHTML = '';

  for (const name of names) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    projectSelect.appendChild(option);
  }

  if (names.length > 0) {
    loadProjectData();
  } else {
    articlesList.innerHTML = '';
    bibContent.value = '';
    screenshotsList.innerHTML = '';
  }
}

function createProject() {
  const rawName = projectNameInput.value;
  const name = sanitize(rawName);
  if (!name) return;

  const store = loadStore();
  ensureProject(store, name);
  saveStore(store);
  projectNameInput.value = '';

  refreshProjects();
  projectSelect.value = name;
  loadProjectData();
}

function loadArticles(project) {
  articlesList.innerHTML = '';
  for (const a of project.articles) {
    const li = document.createElement('li');
    li.textContent = `[${a.category}] ${a.title}${a.source ? ` — ${a.source}` : ''}`;
    articlesList.appendChild(li);
  }
}

function addArticle() {
  const title = articleTitleInput.value.trim();
  if (!title) return;

  const store = loadStore();
  const projectName = currentProjectName();
  ensureProject(store, projectName);

  store.projects[projectName].articles.push({
    title,
    category: articleCategoryInput.value.trim() || 'General',
    source: articleSourceInput.value.trim(),
  });

  saveStore(store);
  articleTitleInput.value = '';
  articleCategoryInput.value = '';
  articleSourceInput.value = '';
  loadProjectData();
}

function saveBib() {
  const store = loadStore();
  const projectName = currentProjectName();
  ensureProject(store, projectName);
  store.projects[projectName].bib = bibContent.value;
  saveStore(store);
  bibSaveMsg.textContent = `Saved to ${projectName}/references.bib`;
}

function loadScreenshots(projectName, project) {
  screenshotsList.innerHTML = '';
  for (const shot of project.screenshots) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = shot.dataUrl;
    link.download = shot.filename;
    link.textContent = `${projectName}/screenshots/${shot.filename}`;
    li.appendChild(link);
    screenshotsList.appendChild(li);
  }
}

function uploadScreenshot() {
  if (!screenshotFile.files.length) return;

  const file = screenshotFile.files[0];
  const reader = new FileReader();

  reader.onload = () => {
    const store = loadStore();
    const projectName = currentProjectName();
    ensureProject(store, projectName);

    store.projects[projectName].screenshots.push({
      filename: `${Date.now()}_${file.name}`,
      dataUrl: reader.result,
    });

    saveStore(store);
    screenshotFile.value = '';
    loadProjectData();
  };

  reader.readAsDataURL(file);
}

function loadProjectData() {
  const store = loadStore();
  const projectName = currentProjectName();
  if (!projectName) return;

  const project = store.projects[projectName];
  if (!project) return;

  loadArticles(project);
  bibContent.value = project.bib;
  bibSaveMsg.textContent = '';
  loadScreenshots(projectName, project);
}

createProjectBtn.addEventListener('click', createProject);
projectSelect.addEventListener('change', loadProjectData);
addArticleBtn.addEventListener('click', addArticle);
saveBibBtn.addEventListener('click', saveBib);
uploadShotBtn.addEventListener('click', uploadScreenshot);

refreshProjects();
