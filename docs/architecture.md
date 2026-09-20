# Architektur

Kernel Notes ist eine selbst gehostete Publishing- und Knowledge-Plattform. Der Blog ist weiterhin Markdown-zentriert, besteht zur Laufzeit aber aus mehreren klar getrennten Komponenten für Rendering, semantische Suche, Wissensnetz, Status und Deployment.

Diese Seite beschreibt das aktuelle Zielbild. Branching und Promotion stehen in [deployment.md](deployment.md).

## Runtime-Komponenten

### Blog

Der öffentliche Webdienst ist eine Node.js-/Express-Anwendung. Die Server-Schichten bauen aufeinander auf:

```text
server.js
  -> enhanced-server.js
  -> privacy-server.js
  -> seo-server.js
```

`seo-server.js` ist der Production-Einstiegspunkt. Er ergänzt die bestehende Rendering- und API-Schicht um Canonicals, Social-Metadaten, strukturierte Daten und weitere SEO-Funktionen.

`privacy-server.js` ist kein eigenständiger Production-Einstiegspunkt. Die Schicht kapselt Security- und Privacy-Hardening, lokale Browser-Dependencies und interne Proxy-Endpunkte.

Staging startet dasselbe Image mit `staging-server.js`. Dadurch bleibt die Anwendung identisch, die Umgebung ist im Browser aber eindeutig als Staging markiert.

### Kernel Grep

Kernel Grep läuft als eigener Search-Service. Artikel werden in Chunks zerlegt, mit E5 eingebettet und in DuckDB indexiert.

Der Blog greift nicht direkt auf die Datenbank zu, sondern über den internen Search-Service. Nach außen werden nur die dafür vorgesehenen Such- und Graph-Endpunkte des Blogs veröffentlicht.

Die gleiche semantische Grundlage wird für mehrere Funktionen verwendet:

- Kernel Grep
- semantische Artikelbeziehungen
- Knowledge Graph
- GraphRAG-Retrieval

Raw Embeddings werden nicht an Browser-Clients ausgegeben.

Details stehen in [knowledge-graph.md](knowledge-graph.md).

### Kubernetes-Status

K3s enthält einen separaten Status-Service aus `status-monitor/`. Er besitzt nur die für seine Aufgabe benötigten namespace-lokalen Leserechte.

Der Blog proxyt dessen sanitizierte Ausgabe über:

```text
/api/kubernetes-status
```

Die öffentliche Statusansicht enthält aggregierte Betriebsinformationen, aber keine Pod-Namen, Node-Namen, internen IP-Adressen oder Cluster-Credentials.

### Chaos Runner

Der Chaos Runner aus `chaos-monkey/` gehört ausschließlich zum kontrollierten Staging-Betrieb.

Er wird als eigenes Image gebaut und in Staging über GitOps gepinnt. Experimente sind bewusst manuell, begrenzt und mit Guards versehen. Production führt diese Experimente nicht automatisch aus.

Details stehen in [reliability.md](reliability.md).

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

`docker-compose.yml` startet mindestens:

```text
blog
search
```

Der Blog ist lokal unter `http://localhost:8080` erreichbar.

### Staging

Staging läuft auf K3s auf Proxmox.

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
  '- cloudflared
        |
        v
staging-blog.obivan.org
```

Der öffentliche Zugriff erfolgt über Cloudflare Tunnel. Es sind dafür keine eingehenden Ports am Heimanschluss erforderlich.

Der gewünschte Zustand liegt im Branch `staging` unter `infra/kubernetes/staging`.

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

Dieser Pfad ist kein veraltetes Deployment, sondern ein bewusst aktuell gehaltener Standby- und Rollback-Origin.

Ein automatischer HAProxy-Failover zwischen K3s und Hetzner ist noch kein Bestandteil des aktuellen Zielbilds. Bis dieser Pfad umgesetzt ist, darf die Dokumentation ihn nicht als vorhandene Funktion darstellen.

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
- `infra/kubernetes/staging/README.md` für Staging
- `infra/kubernetes/production/README.md` für K3s Production
- `ops/hetzner/README.md` für den Hetzner-Standby
- `.github/workflows/*.yml` für die tatsächlich ausgeführte CI/CD-Logik

Wenn sich Infrastruktur oder Deployment-Modell ändern, müssen die übergeordneten Dokumente zusammen mit den Workflows angepasst werden.
