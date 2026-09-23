---
id: 2026-09-15-eine-vpc-ist-keine-schwarze-magie
version: 1
title: Eine VPC ist keine schwarze Magie
status: publish
date: 2026-09-15T00:00:00.000Z
created_at: 2026-09-15T00:00:00.000Z
updated_at: 2026-09-15T00:00:00.000Z
author: obivan
reviewed_by: pending
category: AWS
excerpt: >-
  VPC, Subnet, Route Table, Internet Gateway und NAT wirken schnell nach
  schwarzer Magie. Dabei geht es am Ende fast immer um eine Frage: Welchen Weg
  nimmt mein Traffic?
tags:
  - AWS
  - VPC
  - Networking
  - Subnet
  - Route-Table
  - NAT-Gateway
  - Internet-Gateway
  - Security-Group
search_queries:
  - query: Wie funktioniert eine AWS VPC einfach erklärt?
    maxRank: 1
  - query: Was ist der Unterschied zwischen Public und Private Subnet?
    maxRank: 1
  - query: Wie troubleshootet man AWS VPC Netzwerkprobleme?
    maxRank: 1
cover_query: computer network topology router routing subnet infrastructure
cover_provider: pixabay
cover_provider_id: '3100049'
cover_image: /assets/covers/2026-09-15-eine-vpc-ist-keine-schwarze-magie.jpg
cover_alt: >-
  sever, digitization, mainframe, computer, digital, binary, cable, network,
  data center, internet, frame, router, ethernet, server, switch, data center,
  data center, data center, data center, server, server, server, server, server
cover_focus: center
cover_credit: by dlohner via Pixabay
cover_credit_url: 'https://pixabay.com/photos/sever-digitization-mainframe-3100049/'
cover_source_url: 'https://pixabay.com/photos/sever-digitization-mainframe-3100049/'
cover_license: Pixabay Content License
cover_license_url: 'https://pixabay.com/service/license-summary/'
cover_score: 100
---

VPC, Subnet, Route Table, Internet Gateway, NAT Gateway, Security Group, NACL …

AWS Networking wirkt schnell komplizierter, als es eigentlich ist. Für den Anfang reicht ein ziemlich kleiner Spickzettel:

| AWS-Begriff | Vereinfacht gesagt |
|---|---|
| **VPC** | Netzwerk |
| **Subnet** | Teilnetz |
| **Route Table** | Wo geht der Traffic hin? |
| **Security Group** | Wer darf zur Ressource? |
| **NACL** | Was darf durchs Subnet? |
| **Internet Gateway** | Verbindung zum Internet |
| **NAT Gateway** | Private Ressourcen kommen raus |
| **VPC Endpoint** | AWS-Service ohne Umweg übers Internet |

![VPC mit Public und Private Subnet, Routing, Internet Gateway, NAT Gateway und VPC Endpoint](/assets/posts/vpc-keine-schwarze-magie/vpc-overview.svg)

## Subnet = Teilnetz

Eine VPC ist unser virtuelles Netzwerk. Dieses Netzwerk wird in **Subnets** aufgeteilt – häufig zusätzlich über mehrere Availability Zones verteilt.

Wichtig dabei:

> **`public` und `private` sind keine magischen Eigenschaften eines Subnets. Entscheidend ist vor allem das Routing.**

Eine öffentliche Route Table kann zum Beispiel so aussehen:

```text
10.0.0.0/16 → local
0.0.0.0/0   → Internet Gateway
```

`local` hält Traffic innerhalb der VPC. Für andere Ziele kennt die Route Table einen Weg über das Internet Gateway.

Das bedeutet aber nicht, dass jede EC2 im Public Subnet automatisch aus dem Internet erreichbar ist. Öffentliche Adressierung und passende Security-Regeln müssen ebenfalls stimmen.

Die Route sagt erstmal nur:

> **Da ist ein Weg.** Nicht: **Jeder darf durch.**

## Private: raus über NAT

Private Ressourcen sollen häufig selbst Verbindungen nach draußen aufbauen können, ohne direkt aus dem Internet erreichbar zu sein. Dafür kann die Default Route auf einen NAT Gateway zeigen:

```text
0.0.0.0/0 → NAT Gateway
```

![Vergleich des Netzwerkwegs eines Public und Private Subnets](/assets/posts/vpc-keine-schwarze-magie/public-vs-private.svg)

Und hier steckt eine schöne Troubleshooting-Lektion: Eine Route kann vorhanden sein und trotzdem nicht funktionieren. Zeigt sie etwa auf ein nicht mehr verfügbares Ziel, kann AWS sie als **Blackhole** markieren.

> **Route vorhanden ≠ Verbindung funktioniert.**

Dann hilft es wenig, reflexartig die Security Group weiter zu öffnen. Der vorgesehene Netzwerkweg funktioniert schlicht nicht.

## Route oder Security Group?

Die beiden werden gerne durcheinandergebracht:

```text
Route Table     → Wo geht der Traffic hin?
Security Group  → Wer darf zur Ressource?
```

Eine offene Security Group repariert keine kaputte Route. Und eine perfekte Route hilft nicht, wenn die Security Group den benötigten Traffic nicht erlaubt.

![Pragmatische Reihenfolge beim Troubleshooting einer VPC-Verbindung](/assets/posts/vpc-keine-schwarze-magie/troubleshooting.svg)

Wenn etwas nicht erreichbar ist, versuche ich deshalb nicht zuerst irgendwelche Regeln zu ändern. Ich verfolge den Netzwerkweg:

**DNS → IP → Security Group/NACL → Route Table → IGW/NAT/Endpoint → Anwendung**

Die entscheidenden Fragen bleiben dabei erstaunlich simpel:

> **Wo startet mein Traffic, wohin soll er und welchen Weg nimmt er dorthin?**

Natürlich kann AWS Networking mit Peering, Transit Gateway, PrivateLink, VPN oder Direct Connect noch deutlich größer werden. Das Grundprinzip ändert sich aber nicht.

Wer den Weg des Traffics nachvollziehen kann, für den ist eine VPC irgendwann keine schwarze Magie mehr.

**Sie ist einfach nur ein Netzwerk mit ziemlich vielen AWS-Namen.**
