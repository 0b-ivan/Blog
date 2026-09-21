# Staging-Cluster

Die Staging-Manifeste veröffentlichen selbst keine NodePorts oder LoadBalancer. Der Zugriff erfolgt ausschließlich über einen Cloudflare Tunnel. Blog und Search kommen aus der gemeinsamen Basis unter `infra/kubernetes/base`; das Staging-Overlay setzt Namespace, drei Blog-Replicas und den Staging-Entrypoint.

Der öffentliche Staging-Hostname ist:

```text
https://staging-blog.obivan.org
```

## Branch- und Deployment-Modell

Staging und Production sind bewusst getrennt:

```text
feature/*
   |
   | PR + CI
   v
staging
   |
   | GitHub Actions baut Blog, Search, Status und Chaos
   | Images -> GHCR
   | SHA-Pins -> infra/kubernetes/staging/kustomization.yaml
   v
Flux -> K3s Staging -> staging-blog.obivan.org
   |
   | öffentlicher Staging-Gate
   v
promotion/staging-verified
   |
   | manueller Merge
   v
main
   |
   +--> K3s Production -> blog.obivan.org
   |
   +--> Hetzner Standby / Rollback
```

Ein Merge nach `staging` veröffentlicht weiterhin nichts direkt in Production. Nach erfolgreicher öffentlicher Verifikation aktualisiert GitHub Actions den Branch `promotion/staging-verified` und öffnet bzw. aktualisiert den Promotion-PR nach `main`. Erst dessen manueller Merge gibt den Stand für Production frei.

Der Workflow `.github/workflows/cd-staging.yml` akzeptiert automatische Staging-Deployments nur für Commits, die zu einem gemergten Pull Request mit Zielbranch `staging` gehören. Bei Anwendungs- oder Content-Änderungen werden Blog, Kernel Grep, Kubernetes-Status und Chaos Runner unter dem unveränderlichen Git-Commit-SHA nach GHCR gepusht. Der Workflow aktualisiert anschließend die Image-Pins in `kustomization.yaml`. Reine GitOps-Änderungen können die bereits gepinnten Images wiederverwenden.

## Benötigte Secrets

Das private GHCR-Paket benötigt einen Token mit mindestens `read:packages`:

```bash
kubectl -n blog-staging create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=0b-ivan \
  --docker-password="$GHCR_TOKEN"
```

Für den separat angelegten Cloudflare Tunnel:

```bash
kubectl -n cloudflare create secret generic cloudflared-token \
  --from-literal=token="$CLOUDFLARE_TUNNEL_TOKEN"
```

Im Cloudflare Tunnel wird der Public Hostname `staging-blog.obivan.org` auf diesen internen Origin gelegt:

```text
http://blog.blog-staging.svc.cluster.local:80
```

Dafür ist keine Portfreigabe am Router, pfSense oder Proxmox erforderlich.

## Images und Staging-Runtime

Die Staging-Workloads verwenden im Cluster keine `latest`-Tags. Die Kustomize-Konfiguration pinnt Blog, Kernel Grep, Kubernetes-Status und Chaos Runner auf einen exakten Git-Commit. Der Staging-Workflow aktualisiert diese Pins nach einem erfolgreichen Build automatisch.

Der Blog bekommt in Staging zusätzlich per Kustomize-Patch den Entrypoint:

```text
staging-server.js
```

Damit werden der orange/schwarz gestreifte Rahmen und das `STAGING`-Banner ausschließlich in der Staging-Umgebung aktiviert. Production verwendet weiterhin `seo-server.js`.

`cloudflared` ist separat auf Version `2026.9.1` gepinnt.
Der Tunnel läuft mit zwei `cloudflared`-Replicas, damit ein einzelner Connector-Neustart nicht gleichzeitig Staging und Production vom öffentlichen Zugriff trennt. Beide Replicas laufen derzeit weiterhin auf demselben K3s-Node und ersetzen deshalb keine Node-Redundanz.\n
## Manueller Test

```bash
kubectl apply -k infra/kubernetes/staging
kubectl -n blog-staging rollout status deployment/search
kubectl -n blog-staging rollout status deployment/analytics
kubectl -n blog-staging rollout status deployment/blog
kubectl -n cloudflare rollout status deployment/cloudflared
kubectl -n blog-staging get pods,svc
```

## Flux

Flux verwendet den Branch `staging` als GitOps-Quelle. Der Cluster benötigt dadurch keinen eingehenden Netzwerkzugriff von GitHub Actions.

Auf einem Admin-Host mit Zugriff auf den K3s-API-Server, `flux`, `gh` und einem passenden `KUBECONFIG`:

```bash
export GITHUB_TOKEN="$(gh auth token)"

flux check --pre

flux bootstrap github \
  --owner=0b-ivan \
  --repository=Blog \
  --branch=staging \
  --path=infra/kubernetes/staging \
  --personal \
  --token-auth=false

unset GITHUB_TOKEN
```

`--path` zeigt dabei auf den vom Cluster zu reconciliierenden Staging-Ordner. Der Bootstrap legt seine eigenen Manifeste darunter in `infra/kubernetes/staging/flux-system/` an und konfiguriert den Cluster auf den Branch `staging`.

Der Image-Build bleibt in GitHub Actions, das eigentliche Cluster-Deployment bleibt Pull-basiert über Flux. GitHub Actions braucht dadurch keinen direkten Netzwerkzugriff auf das private K3s-Netz.

Hinweis für später enforced Rulesets: Der GitHub-Actions-Bot muss die automatischen Änderungen an den Image-Pins auf `staging` schreiben dürfen. Wenn die Rulesets durch einen passenden GitHub-Plan tatsächlich enforced werden, muss dafür ein gezielter Bypass bzw. eine gleichwertige Automationsregel eingerichtet werden.

## Öffentlicher Kubernetes-Status

Der Blog stellt eine eigene Status-Rubrik bereit:

```text
https://staging-blog.obivan.org/status
```

Die Browser-Seite fragt ausschließlich `/api/kubernetes-status` am Blog ab. Der Blog proxyt dafür den internen Service `kube-status`.

`kube-status` besitzt nur read-only Rechte im Namespace: Pods werden mit `get/list` gelesen, `chaos-monkey-result` nur per `get` und native `NetworkChaos`-Ressourcen nur per `get/list`. Schreibrechte auf Chaos-Ressourcen besitzt der Status-Service nicht.

Nach außen gehen ausschließlich aggregierte und sanitisiert ausgewählte Zustände. Pod-Namen, Nodes, interne IPs und sonstige Cluster-Details bleiben intern.

## First-Party Analytics in Staging

Staging betreibt einen einzelnen internen `analytics`-Pod mit einem persistenten 1-GiB-PVC.
Die drei Blog-Replikas schreiben ihre aggregierten Ereignisse ausschließlich über den internen
ClusterIP-Service dorthin. Besucher-IP, User-Agent und Geolocation werden nicht an den
Analytics-Dienst weitergegeben.

Öffentlich abrufbar sind nur die kompakten Artikelmetriken (Aufrufe, durchschnittliche aktive
Lesezeit, Abschlussquote und Likes). Die Detailauswertung unter `/analytics` ist separat
token-geschützt, weil sie aggregierte Suchphrasen enthalten kann.

Wenn kein `ANALYTICS_DASHBOARD_TOKEN` gesetzt ist, erzeugt der Analytics-Pod beim Start einen
zufälligen Token. Er kann von einem Cluster-Admin aus den Logs gelesen werden:

```bash
kubectl -n blog-staging logs deployment/analytics | grep 'analytics dashboard token'
```

Der Token wird im Analytics-Dashboard nur für die aktuelle Browser-Sitzung in `sessionStorage`
gehalten und als `X-Analytics-Token` gesendet. Ein Pod-Neustart erzeugt ohne fest konfiguriertes
Secret einen neuen Token.

Die Suchstatistik wird höchstens 90 Tage tageweise gehalten. Artikel-Summen und Likes können
darüber hinaus als aggregierte Kennzahlen bestehen bleiben. Der persistente Zustand liegt im PVC
`analytics-data`.

## Chaos Monkey v1

Der Chaos Monkey ist absichtlich als suspendierter CronJob hinterlegt und läuft nicht automatisch:

```text
kubectl -n blog-staging get cronjob chaos-monkey
```

Ein Experiment muss mit einem expliziten manuellen Jobnamen gestartet werden:

```bash
JOB="chaos-monkey-manual-$(date +%s)"
kubectl -n blog-staging create job --from=cronjob/chaos-monkey "$JOB"
kubectl -n blog-staging logs -f "job/$JOB"
```

Der Runner verweigert die Ausführung, wenn der Namespace nicht exakt `blog-staging` ist oder der erzeugte Pod nicht aus einem Job mit Präfix `chaos-monkey-manual-` stammt.

Weitere Guards:

- ausschließlich Pods mit `app=blog` und `chaos.obivan.org/enabled=true`
- exakt `3/3` erwartete Blog-Pods müssen vor dem Experiment Ready sein
- jeder Kandidat muss von einem ReplicaSet kontrolliert werden
- der öffentliche `/healthz` muss vor dem Kill grün sein
- pro Ausführung wird exakt ein Pod gelöscht
- danach wird bis zur vollständigen Recovery gewartet
- HTTP-Ausfälle, Recovery-Zeit, Ready-Minimum/-Maximum und Search-Erreichbarkeit werden als JSON-Logs ausgegeben
- RBAC erlaubt ausschließlich `get`, `list` und `delete` auf Pods im Namespace `blog-staging`

Ein versehentliches Entsuspendieren des CronJobs startet daher noch kein wirksames Chaos-Experiment: automatisch erzeugte CronJob-Pods bestehen den manuellen Jobnamen-Guard nicht.

## Chaos Mesh für Netzwerk-Experimente

Für die späteren Fehlerklassen DNS, Latenz und Packet Loss wird Chaos Mesh separat über Flux installiert. Die Plattform ist absichtlich enger begrenzt als eine Standardinstallation:

- Chart-Version fest auf `2.8.4` gepinnt
- Controller-Cache `clusterScoped: true`, damit auch die von Chaos Mesh gestarteten clusterweiten CRD-Controller ihre Informer synchronisieren können
- eigentliche Fault-Injection weiterhin über `enableFilterNamespace: true` begrenzt
- nur `blog-staging` trägt `chaos-mesh.org/inject=enabled`
- K3s-`containerd` über `/run/k3s/containerd/containerd.sock`
- Dashboard deaktiviert
- DNS-Server zunächst deaktiviert
- nur ein Controller-Manager im kleinen Staging-Cluster

Die Cluster-Sichtbarkeit des Controllers ist damit bewusst von der Injection-Freigabe getrennt. Der Controller darf die benötigten cluster-scoped CRDs beobachten; Chaos wird nur in Namespaces injiziert, die explizit mit `chaos-mesh.org/inject=enabled` freigegeben sind. Im GitOps-Sollzustand besitzt nur `blog-staging` diese Annotation.

Die Installation selbst injiziert **noch keinen Fehler**. Vor dem ersten `NetworkChaos` müssen Control Plane und Kernel-Voraussetzung geprüft werden:

```bash
kubectl -n flux-system get helmrelease chaos-mesh
kubectl -n chaos-mesh get pods -l app.kubernetes.io/instance=chaos-mesh
kubectl -n chaos-mesh get pods
kubectl get crd networkchaos.chaos-mesh.org
lsmod | grep sch_netem || sudo modprobe sch_netem
```

Der letzte Befehl läuft auf dem K3s-Node. Erst wenn diese Checks sauber sind, wird ein zeitlich begrenztes Netzwerkexperiment als eigener One-shot-Commit aktiviert. Nach erfolgreicher Injection und Recovery wird das Experiment-Manifest wieder aus dem GitOps-Sollzustand entfernt; das Ergebnis bleibt im GitHub-Actions-Observer nachvollziehbar.

## Chaos-Experiment-Lifecycle

Der `chaos-monkey` CronJob bleibt dauerhaft `suspend: true`. Ein Experiment wird bewusst als
einmaliger Job gestartet; permanente automatische Pod-Löschungen sind nicht Teil von v1.

Nach einem Experiment:

1. den einmaligen Job wieder aus dem GitOps-Sollzustand entfernen,
2. `chaos-monkey-result` **nicht** löschen – dort bleibt das letzte sanitisiert veröffentlichte Ergebnis,
3. den Workflow **Observe staging chaos experiment** bei Bedarf manuell starten,
4. für ein neues Experiment optional `completed_after` auf einen ISO-8601-Zeitpunkt kurz vor dem Versuch setzen,
   damit kein älteres Ergebnis als aktuelles Experiment interpretiert wird.

Der öffentliche Status enthält weiterhin keine Pod-Namen, Node-Namen, internen IPs oder Cluster-Credentials.
