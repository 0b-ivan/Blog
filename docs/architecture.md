# Architektur

Kernel Notes ist eine selbst gehostete Publishing- und Knowledge-Plattform. Der Blog ist weiterhin Markdown-zentriert, besteht zur Laufzeit aber aus mehreren getrennten Komponenten für Rendering, semantische Suche, Wissensnetz, Status und Betrieb.

Diese Seite beschreibt das aktuelle Zielbild. Branching und Promotion stehen in [deployment.md](deployment.md), Reliability und Chaos Engineering in [reliability.md](reliability.md).

## Runtime-Komponenten

### Blog

Der öffentliche Webdienst ist eine Node.js-/Express-Anwendung. Die Server-Schichten bauen aufeinander auf:

```text
server.js
  -> enhanced-server.js
  -> privacy-server.js
  -> seo-server.js
```

`seo-server.js` ist der Production-Einstiegspunkt. Er ergänzt Rendering und APIs unter anderem um Canonicals, Social-Metadaten und strukturierte Daten.

`privacy-server.js` ist eine Hardening-Schicht und kein eigener Production-Einstiegspunkt. Sie kapselt Security-/Privacy-Header, lokal ausgelieferte Browser-Dependencies und interne Proxy-Endpunkte.

Staging startet dasselbe Blog-Image mit `staging-server.js`. Dadurch bleibt die Anwendung technisch vergleichbar, die Umgebung ist im Browser aber eindeutig als Staging markiert.

### Kernel Grep

Kernel Grep läuft als eigener Search-Service. Artikel werden in Chunks zerlegt, mit E5 eingebettet und in DuckDB indexiert.

Die gleiche semantische Grundlage wird für mehrere Funktionen verwendet:

- Kernel Grep
- semantische Artikelbeziehungen
- Knowledge Graph
- GraphRAG-Retrieval

Raw Embeddings werden nicht an Browser-Clients ausgegeben. Details stehen in [knowledge-graph.md](knowledge-graph.md).

### Analytics und Leserinteraktion

Ein eigener Analytics-Dienst sammelt ausschließlich aggregierte Nutzungssignale. Der Blog proxyt die öffentlichen Endpunkte unter `/api/analytics/*`; Browser sprechen den internen Dienst nicht direkt an. Artikel zeigen bewusst nur Aufrufe und Likes prominent an. Aktive Lesezeit und Abschlussquote bleiben Qualitätsmetriken für das interne Analytics-Dashboard.

Lesefortschritt wird im Browser aus der sichtbaren Artikelposition berechnet. Favoriten werden ausschließlich lokal im Browser unter `kernel-notes:favorites` gespeichert und nicht an den Server übertragen. Der Like-Zustand wird ebenfalls lokal gemerkt, während nur der aggregierte Like-Zähler an den Analytics-Dienst geht. Details stehen in [analytics.md](analytics.md).

### Kubernetes-Status

K3s enthält einen separaten Status-Service aus `status-monitor/`.

Der Blog proxyt dessen sanitizierte Ausgabe über:

```text
/api/kubernetes-status
```

Die öffentliche Statusansicht enthält aggregierte Betriebsinformationen, aber keine Pod-Namen, Node-Namen, internen IP-Adressen oder Cluster-Credentials.

### Chaos-Infrastruktur

Staging enthält zwei getrennte Bausteine:

- den eigenen Runner aus `chaos-monkey/` für kontrollierte Anwendungsexperimente,
- Chaos Mesh als separat per Flux verwaltete Plattform für später aktivierte Netzwerkfehler.

Chaos Mesh ist installiert und sicherheitsseitig auf explizit freigegebene Namespaces begrenzt. Die Installation allein injiziert keinen Fehler. Konkrete Netzwerkexperimente werden als zeitlich begrenzter GitOps-Zustand aktiviert und danach wieder entfernt.

Production führt diese Staging-Experimente nicht automatisch aus.

## Content

Der veröffentlichte Content bleibt dateibasiert:

```text
posts/          aktive Artikel
archive/        archivierte Artikel
snippets/       referenzierte Codebeispiele
assets/posts/   Artikelbilder
post-history/   generierte historische Snapshots
```

Artikel werden als Markdown gepflegt. Frontmatter liefert Metadaten; zentrale Konfigurationen ergänzen Glossar, Quellen und weitere Content-Regeln.

Die automatische Artikelhistorie wird aus Git erzeugt. Änderungen an einem Artikel sowie an seinen referenzierten Snippets und Bildern können dadurch als reproduzierbare historische Version dargestellt werden.

## Umgebungen

### Lokal

`docker-compose.yml` startet die lokale Blog-/Search-Umgebung.

```text
Browser
  |
  v
blog :8080
  |
  v
search :8090
```

### Staging

Staging läuft auf K3s auf Proxmox:

```text
GitHub
  |
  | immutable Images
  v
GHCR
  |
  v
Flux
  |
  v
K3s Staging
  |- 3x Blog
  |- Search
  |- Kubernetes-Status
  |- Chaos Runner
  |- Chaos Mesh
  '- cloudflared
        |
        v
staging-blog.obivan.org
```

Der öffentliche Zugriff erfolgt über Cloudflare Tunnel. Dafür sind keine eingehenden Ports am Heimanschluss erforderlich.

Der gewünschte Staging-Zustand liegt im Branch `staging` unter `infra/kubernetes/staging`.

### Production

Die öffentliche Production läuft auf K3s:

```text
main
  |
  | GitHub Actions
  v
immutable GHCR Images
  |
  | gewünschter Zustand
  v
production-gitops
  |
  v
Flux
  |
  v
K3s Production
  |- 3x Blog
  |- Search
  '- Kubernetes-Status
        |
        v
blog.obivan.org
```

`production-gitops` ist bewusst von `staging` getrennt. Der Branch wird vom Production-Workflow aus dem freigegebenen `main`-Stand erzeugt und enthält die auf den Production-SHA gepinnten Manifeste.

### Hetzner

Hetzner wird parallel aus `main` aktualisiert. Dort läuft die Docker-Compose-Variante mit persistenten Content-Volumes.

Dieser Pfad ist kein historisches Deployment, sondern ein bewusst aktuell gehaltener Standby- und Rollback-Origin.

Ein automatischer HAProxy-Failover zwischen K3s und Hetzner ist noch nicht umgesetzt. Die Dokumentation darf ihn deshalb nur als geplanten Ausbau beschreiben.

## Authoring

Artikel und Metadaten können per Git/CLI oder über Obsidian gepflegt werden.

Der Obsidian-Publisher umgeht den Staging-Pfad nicht:

```text
Obsidian
  |
  v
Publisher
  |
  v
PR nach staging
  |
  v
Staging + Verifikation
  |
  v
Promotion-PR nach main
```

Dasselbe Prinzip gilt für Quellen und Glossar-Publisher.

## Quellen der Wahrheit

Für den aktuellen Stand sind diese Dateien maßgeblich:

- `README.md` für den Produktüberblick
- `docs/deployment.md` für Promotion und Deployment
- `docs/reliability.md` für Status und Chaos Engineering
- `infra/kubernetes/staging/README.md` für Staging
- `infra/kubernetes/production/README.md` für K3s Production
- `ops/hetzner/README.md` für den Hetzner-Standby
- `.github/workflows/*.yml` für die tatsächlich ausgeführte CI/CD-Logik

Wenn sich Infrastruktur oder Deployment-Modell ändern, müssen die übergeordneten Dokumente zusammen mit den Workflows angepasst werden.
