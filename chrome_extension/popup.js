const runCommandText = `$env:PDFLATEX_PATH = "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe"\n& C:/Users/parib/AppData/Local/Programs/Python/Python310/python.exe c:/Users/parib/Desktop/ArticleManager/app.py`;

const runCommand = document.getElementById('runCommand');
const openThingBtn = document.getElementById('openThingBtn');
const rerunBtn = document.getElementById('rerunBtn');
const status = document.getElementById('status');

runCommand.value = runCommandText;

openThingBtn.addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'http://localhost:5000' });
});

rerunBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(runCommandText);
    status.textContent = 'RunT command copied. Paste it into PowerShell to re-run.';
  } catch (error) {
    status.textContent = 'Could not access clipboard. Copy the command manually.';
  }
});
