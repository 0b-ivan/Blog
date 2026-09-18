# Staging Secrets mit SOPS + age

Dieser Ordner enthält nach der Migration ausschließlich SOPS-verschlüsselte Kubernetes-Secrets.

Erwartete Dateien:

- `ghcr-pull.sops.yaml`
- `cloudflared-token.sops.yaml`

Der private age-Key gehört **nicht** in dieses Repository. Standardpfad der Hilfsskripte:

```text
~/.config/sops/age/keys.txt
```

Sichere Reihenfolge:

1. `02-bootstrap-sops-age.sh` erzeugt bzw. verwendet den lokalen age-Key und legt `flux-system/sops-age` an.
2. `03-export-encrypt-staging-secrets.sh` liest die bestehenden Cluster-Secrets und schreibt nur verschlüsselte Manifeste in diesen Ordner.
3. `04-activate-flux-sops.sh` aktiviert `spec.decryption` und referenziert die verschlüsselten Ressourcen.
4. Erst danach werden die Änderungen committed und über den normalen Staging-PR ausgeliefert.

Die CI blockiert halbfertige Zustände sowie Klartext unter `data`/`stringData`.
