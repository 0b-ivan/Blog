---
id: 2026-08-19-fail2ban-ssh-hardening
version: 2
title: SSH absichern mit Fail2ban und sauberen Defaults
date: 2026-08-19
published_at: 2026-08-19T12:05:52+02:00
created_at: 2026-08-19
updated_at: 2026-08-24
author: obivan
reviewed_by: pending
category: Security
excerpt: Ein pragmatisches Hardening-Setup für SSH mit Fail2ban, Key-Only Login und minimalen Firewall-Regeln.
tags: Security, Linux, SSH, Hardening
---

Wenn ein Server neu online geht, ist SSH fast immer der erste Angriffsvektor.

Mit wenigen Schritten bekommst du deutlich mehr Sicherheit ohne großen Overhead.

## 1) Nur Key-Login erlauben

In `/etc/ssh/sshd_config`:

```conf
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
```

Danach:

```bash
sudo systemctl reload ssh
```

::: warning Wichtig
Nicht aussperren: erst testen, ob Login mit Key wirklich funktioniert.
:::

## 2) Fail2ban aktivieren

[2) Fail2ban aktivieren](/snippets/2026-08-19-fail2ban-ssh-hardening/01-2-fail2ban-aktivieren.sh "snippet:bash")

Beispiel für `/etc/fail2ban/jail.local`:

[2) Fail2ban aktivieren](/snippets/2026-08-19-fail2ban-ssh-hardening/02-2-fail2ban-aktivieren.ini "snippet:ini")

Status prüfen:

```bash
sudo fail2ban-client status sshd
```

## 3) Firewall minimal halten

Nur benötigte Ports öffnen, z. B. mit UFW:

[3) Firewall minimal halten](/snippets/2026-08-19-fail2ban-ssh-hardening/03-3-firewall-minimal-halten.sh "snippet:bash")

## 4) Monitoring nicht vergessen

Fail2ban und SSH-Logs regelmäßig prüfen:[^logs]

[^logs]: Typischer Check: `journalctl -u ssh -u fail2ban --since "24 hours ago"`.

## Fazit

Sicherheit muss nicht kompliziert sein. Schon mit Key-Only, Root-Login aus, Fail2ban und enger Firewall schließt du viele triviale Angriffe aus.

## Querverweise

- [[systemd-services-sauber-betreiben|systemd Services sauber betreiben]]
- [[deployment-mit-hetzner-docker-und-cloudflare-zero-trust|Deployment mit Hetzner, Docker und Cloudflare Zero Trust]]

## Quellen

- [OpenSSH: sshd_config](/sources.html#openssh-sshd-config)
- [Fail2Ban Projekt](/sources.html#fail2ban)
- [Ubuntu Server: Firewall und UFW](/sources.html#ubuntu-ufw)
- [systemd: journalctl](/sources.html#journalctl)
