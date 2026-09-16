---
id: 2026-09-16-wie-funktionieren-nfc-aufkleber
version: 1
title: "Wie funktionieren NFC-Aufkleber eigentlich?"
status: publish
date: 2026-09-16
created_at: 2026-09-16
updated_at: 2026-09-16
author: obivan
reviewed_by: pending
category: Hardware
excerpt: "Ein NFC-Aufkleber hat keine Batterie und kann trotzdem von einem Smartphone gelesen und beschrieben werden. Der Trick steckt in Induktion, einer winzigen Antenne und erstaunlich wenig Speicher."
tags:
  - NFC
  - RFID
  - Hardware
  - Smart-Home
  - Automation
  - NDEF
search_queries:
  - query: Wie funktionieren NFC Aufkleber ohne Batterie?
    maxRank: 1
  - query: Was kann man auf einen NFC Tag speichern?
    maxRank: 1
  - query: Sind NFC Tags sicher und kopierbar?
    maxRank: 1
---

So ein NFC-Aufkleber sieht erstmal ziemlich unspektakulär aus.

Ein dünner Sticker, kein Akku, kein sichtbarer Prozessor, kein Anschluss – und trotzdem hält man das Smartphone dran und plötzlich öffnet sich eine Webseite, eine Automation startet oder eine Geräte-ID wird gelesen.

Die interessante Frage ist deshalb nicht unbedingt, **was** ein NFC-Tag kann.

Sondern:

> **Wie kann ein Stück Aufkleber ohne eigene Stromversorgung überhaupt mit meinem Smartphone kommunizieren?**

Die Antwort ist eine ziemlich schöne Mischung aus Funktechnik, Induktion und einem winzigen Chip.

## NFC ist im Grunde sehr nahes Funkgerät

NFC steht für **Near Field Communication** – Kommunikation im Nahfeld.

Dabei funken Smartphone und Tag nicht über mehrere Meter wie bei WLAN oder Bluetooth. NFC arbeitet absichtlich nur über sehr kurze Entfernungen, typischerweise wenige Zentimeter.

Technisch arbeitet NFC bei **13,56 MHz** und gehört zur Familie der RFID-Techniken.

Der entscheidende Unterschied zur klassischen Funkverbindung ist das **Nahfeld**: Smartphone und Tag koppeln über ein magnetisches Feld miteinander.

Vereinfacht sieht das so aus:

```text
Smartphone
   │
   │  erzeugt magnetisches Feld
   ▼
┌──────────────────────┐
│ NFC-Aufkleber        │
│                      │
│  Antenne ── NFC-Chip │
└──────────────────────┘
   │
   └── bekommt darüber Energie
```

Und genau das erklärt auch, warum der Aufkleber keinen Akku benötigt.

## Woher bekommt der NFC-Tag seinen Strom?

Ein passiver NFC-Tag besitzt normalerweise nur zwei wirklich wichtige Komponenten:

- eine flache Antennenspule
- einen winzigen NFC-Chip

Das Smartphone beziehungsweise NFC-Lesegerät erzeugt ein hochfrequentes magnetisches Feld.

Die Antenne im Tag liegt in diesem Feld. Dadurch wird in der Spule eine elektrische Spannung induziert. Der Chip richtet diese Energie gleich, puffert sie kurz und verwendet sie, um zu arbeiten.

Der Leser versorgt den Tag also während des Lesens praktisch drahtlos mit Strom.

Sobald das Smartphone wieder weg ist, verschwindet auch die Energie.

Der gespeicherte Inhalt bleibt trotzdem erhalten, weil der Tag nichtflüchtigen Speicher verwendet.

> **Der NFC-Tag ist normalerweise aus. Erst das Feld des Lesegeräts weckt ihn auf.**

Das ist einer der Gründe, warum passive NFC-Tags sehr lange funktionieren können: Es gibt schlicht keinen Akku, der altern oder leer werden könnte.

## Aber wie antwortet der Aufkleber?

Jetzt wird es interessant.

Der Tag hat gerade genug Energie bekommen, um seinen Chip zu betreiben. Aber er besitzt keinen starken eigenen Funksender wie ein Smartphone.

Stattdessen verändert der Tag gezielt die elektrische Last seiner Antenne. Dadurch verändert sich wiederum das magnetische Feld minimal.

Das Lesegerät kann diese Veränderungen erkennen und daraus die übertragenen Daten rekonstruieren.

Vereinfacht:

```text
Leser:  "Hier ist Energie. Hast du Daten?"
Tag:    verändert seine Antennenlast
Leser:  erkennt diese Änderungen
        und dekodiert daraus die Antwort
```

Das Verfahren wird als **Load Modulation** bezeichnet.

Der Sticker muss also nicht mit viel Leistung zurückfunken. Er nutzt das bereits vorhandene Feld des Lesegeräts für die Kommunikation.

## Was steckt wirklich in einem NFC-Aufkleber?

Wenn man einen Sticker gegen das Licht hält oder auseinanderbaut, erkennt man häufig die spiralförmige Antenne.

Im Zentrum sitzt ein winziger Chip.

Der übernimmt unter anderem:

```text
Energieversorgung
      │
      ▼
Protokollsteuerung
      │
      ▼
Speicher lesen/schreiben
      │
      ▼
Daten an das Smartphone übertragen
```

Je nach Tag-Typ können zusätzlich Funktionen wie Schreibschutz, Passwortschutz, Zähler oder kryptografische Authentifizierung vorhanden sein.

Ein einfacher NFC-Sticker ist damit technisch deutlich mehr als nur eine aufgedruckte Seriennummer.

## Was speichert man auf einem NFC-Tag?

Die meisten NFC-Tags für Smartphones verwenden **NDEF** – das *NFC Data Exchange Format*.

Das ist im Grunde ein standardisiertes Format dafür, wie Informationen auf einem Tag abgelegt werden.

Ein NDEF-Datensatz kann zum Beispiel enthalten:

- eine URL
- Text
- Kontaktdaten
- eine Geräte- oder Inventar-ID
- einen Deep Link in eine App
- mehrere kombinierte Datensätze

Der Speicher ist allerdings klein.

Ein NFC-Sticker ist keine SD-Karte. Je nach Chip reden wir oft über wenige hundert Bytes bis einige Kilobyte nutzbaren Speicher.

Für eine URL wie

```text
https://blog.obivan.org
```

ist das mehr als genug.

Für Bilder, PDFs oder größere Dateien dagegen nicht.

Dafür speichert man einfach einen Link auf die eigentlichen Daten.

## Führt der Tag selbst eine Automation aus?

Nein.

Das ist ein wichtiger Punkt.

Wenn ich einen NFC-Sticker an meine Haustür klebe und damit eine Smart-Home-Automation starte, dann führt **nicht der Sticker** diese Automation aus.

Der Ablauf ist eher:

```text
NFC-Tag
   │
   ▼
Smartphone erkennt Tag
   │
   ▼
App / Betriebssystem erkennt Inhalt oder ID
   │
   ▼
Automation wird gestartet
   │
   ▼
Home Assistant / API / Shortcut / App
```

Der Tag ist damit eher ein **physischer Trigger**.

Und genau das macht NFC im Smart Home so praktisch: Ein kleiner Sticker kann eine digitale Aktion an einen realen Ort binden.

Zum Beispiel:

```text
NFC am Nachttisch
→ Gute-Nacht-Automation

NFC im Auto
→ Navigation oder Fahrmodus

NFC an einer Maschine
→ Dokumentation öffnen

NFC am Serverschrank
→ Monitoring-Dashboard öffnen

NFC an einer Lagerbox
→ Inventareintrag anzeigen
```

Keine Batterie, kein Pairing und normalerweise auch kein eigenes Netzwerk.

## Kann man NFC-Tags beschreiben?

Viele Tags lassen sich nicht nur lesen, sondern auch beschreiben.

Mit einer NFC-App kann man beispielsweise eine URL als NDEF-Record auf einen leeren Tag schreiben.

Danach kann jedes kompatible Gerät diesen Datensatz wieder lesen.

Je nach Tag kann man den Speicher anschließend auch sperren.

Dabei sollte man aufpassen: Manche Schreibschutzmechanismen sind **dauerhaft**. Wer den Tag einmal endgültig schreibgeschützt hat, bekommt ihn später nicht einfach wieder in den Ausgangszustand zurück.

Für Experimente lasse ich Tags deshalb normalerweise erstmal beschreibbar.

## Kann man einen NFC-Aufkleber kopieren?

Teilweise.

Hier muss man zwischen dem **gespeicherten Inhalt** und der **Identität des Chips** unterscheiden.

Eine gespeicherte URL kann natürlich problemlos auf einen zweiten Tag geschrieben werden.

Auch andere normale NDEF-Daten lassen sich häufig einfach auslesen und kopieren.

Bei Chip-IDs und Sicherheitsfunktionen sieht es anders aus. Viele Tags besitzen eine werkseitig vergebene UID, und sicherere NFC-Chips können kryptografische Verfahren verwenden.

Deshalb ist diese Konstruktion keine gute Idee:

```text
wenn UID == "04:AB:..."
    Tür öffnen
```

Eine NFC-ID allein sollte nicht automatisch als sicherer Identitätsnachweis betrachtet werden.

Für einen Link zum Blog ist das völlig egal.

Für Zutrittskontrolle, Bezahlung oder andere sicherheitskritische Anwendungen braucht man dagegen passende Authentifizierungsverfahren und dafür ausgelegte Chips.

> **NFC bedeutet nicht automatisch sicher. Der konkrete Tag und das verwendete Protokoll entscheiden.**

## Warum funktionieren NFC-Tags auf Metall oft schlecht?

Die Antenne eines NFC-Tags ist auf ein bestimmtes elektromagnetisches Verhalten abgestimmt.

Klebt man einen normalen Tag direkt auf Metall, beeinflusst das Metall das Feld und die Antenne massiv. Das Ergebnis: deutlich weniger Reichweite oder der Tag funktioniert gar nicht mehr.

Für solche Fälle gibt es sogenannte **On-Metal- beziehungsweise Anti-Metal-NFC-Tags**. Zwischen Metall und Antenne befindet sich dabei eine spezielle Ferritschicht, die die Antenne vom Untergrund entkoppelt.

Für Serverschränke, Werkzeugkisten oder Maschinen ist das ein Detail, das man besser **vor** dem Kauf kennt.

## NFC vs. QR-Code

Viele Dinge, für die man NFC verwendet, könnte man genauso mit einem QR-Code lösen.

Und manchmal ist QR sogar sinnvoller.

| NFC | QR-Code |
|---|---|
| Smartphone kurz hinhalten | Kamera öffnen und ausrichten |
| unsichtbar verbaubar | muss sichtbar sein |
| Inhalt teilweise beschreibbar | statisch gedruckt |
| Chip kostet Geld | praktisch kostenlos druckbar |
| wenige Zentimeter Reichweite | aus größerer Entfernung lesbar |
| kann zusätzliche Chip-Funktionen haben | enthält nur optische Daten |

NFC ist also nicht automatisch besser.

Ich finde es vor allem dort interessant, wo ein physischer Gegenstand bewusst eine digitale Aktion auslösen soll.

## Warum ich NFC-Tags spannend finde

Das Interessante an NFC ist für mich weniger, dass man damit eine Webseite öffnen kann.

Spannend ist die Verbindung zwischen **physischer Welt und Software**.

Ein Sticker kostet wenig, braucht keinen Stromanschluss und keine Netzwerkverbindung und kann trotzdem zum Einstiegspunkt für eine komplette Infrastruktur werden.

```text
Sticker
  ↓
Smartphone
  ↓
API
  ↓
Home Assistant
  ↓
Automation
  ↓
Homelab / Geräte / Dienste
```

Technisch steckt im Sticker selbst fast nichts.

Aber genau das ist seine Stärke.

Ein bisschen Kupfer, ein winziger Chip und elektromagnetische Induktion reichen aus, damit aus einem simplen Aufkleber eine Schnittstelle zwischen einem realen Objekt und einem digitalen System wird.

Und jedes Mal, wenn das Smartphone den Sticker mit Energie versorgt, passiert für ein paar Millisekunden genau das:

> **Der Aufkleber wacht auf, sagt kurz wer er ist beziehungsweise was in ihm gespeichert wurde – und verschwindet danach wieder komplett aus der digitalen Welt.**
