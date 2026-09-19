const overall = document.getElementById('status-overall');
const dot = document.getElementById('status-dot');
const environment = document.getElementById('status-environment');
const orchestrator = document.getElementById('status-orchestrator');
const build = document.getElementById('status-build');
const updated = document.getElementById('status-updated');
const workloads = document.getElementById('status-workloads');
const refresh = document.getElementById('status-refresh');
const chaosSection = document.getElementById('chaos-experiment-section');
const chaosExperiment = document.getElementById('chaos-experiment');

function labelStatus(value) {
  if (value === 'operational') return 'Alle Systeme betriebsbereit';
  if (value === 'degraded') return 'Eingeschränkter Betrieb';
  return 'Status nicht verfügbar';
}

function formatEnvironment(value) {
  if (value === 'production') return 'Production';
  if (value === 'staging') return 'Staging';
  return 'Unbekannt';
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function renderWorkloads(items) {
  if (!Array.isArray(items) || !items.length) {
    workloads.innerHTML = '<article class="status-card status-card--unavailable"><p>Keine Workload-Daten verfügbar.</p></article>';
    return;
  }

  workloads.innerHTML = items.map((item) => {
    const state = item.status === 'operational' ? 'operational' : 'degraded';
    return `
      <article class="status-card status-workload-card status-card--${state}">
        <div>
          <span class="status-label">${item.name}</span>
          <strong>${item.ready} / ${item.desired} Ready</strong>
        </div>
        <span class="status-pill">${state === 'operational' ? 'Operational' : 'Degraded'}</span>
      </article>
    `;
  }).join('');
}

function formatDuration(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return '–';
  return `${(milliseconds / 1000).toFixed(2)} s`;
}

function renderChaosExperiment(experiment) {
  if (!experiment || experiment.experiment !== 'single-blog-pod-delete') {
    chaosSection.hidden = true;
    chaosExperiment.innerHTML = '';
    return;
  }

  chaosSection.hidden = false;
  const result = experiment.passed ? 'Bestanden' : 'Fehlgeschlagen';
  const search = experiment.searchReachableAfter ? 'Erreichbar' : 'Nicht erreichbar';
  chaosExperiment.innerHTML = `
    <article class="status-card">
      <span class="status-label">Ergebnis</span>
      <strong>${result}</strong>
    </article>
    <article class="status-card">
      <span class="status-label">Recovery</span>
      <strong>${formatDuration(experiment.recoveryTimeMs)}</strong>
    </article>
    <article class="status-card">
      <span class="status-label">HTTP-Fehler</span>
      <strong>${experiment.httpFailures}</strong>
    </article>
    <article class="status-card">
      <span class="status-label">Minimum Ready</span>
      <strong>${experiment.minimumReadyPods} / 3</strong>
    </article>
    <article class="status-card">
      <span class="status-label">Search danach</span>
      <strong>${search}</strong>
    </article>
    <article class="status-card">
      <span class="status-label">Experiment</span>
      <strong>${formatTime(experiment.completedAt)}</strong>
    </article>
  `;
}

async function loadStatus() {
  refresh.disabled = true;
  try {
    const [statusResponse, buildResponse] = await Promise.all([
      fetch('/api/kubernetes-status', { cache: 'no-store' }),
      fetch('/build-info.json', { cache: 'no-store' })
    ]);

    const status = await statusResponse.json();
    const buildInfo = buildResponse.ok ? await buildResponse.json() : {};

    const state = statusResponse.ok ? status.status : 'unavailable';
    overall.textContent = labelStatus(state);
    dot.dataset.state = state;
    environment.textContent = formatEnvironment(status.environment);
    orchestrator.textContent = status.orchestrator || 'K3s';
    build.textContent = buildInfo.version || '–';
    updated.textContent = formatTime(status.updatedAt);
    renderWorkloads(status.workloads);
    renderChaosExperiment(status.lastChaosExperiment);
  } catch (_error) {
    overall.textContent = labelStatus('unavailable');
    dot.dataset.state = 'unavailable';
    updated.textContent = formatTime(new Date().toISOString());
    renderWorkloads([]);
    renderChaosExperiment(null);
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener('click', () => void loadStatus());
void loadStatus();
window.setInterval(() => void loadStatus(), 10_000);
