---
id: 2026-09-24-pokemon-ist-perfekt-fuer-oop
version: 1
title: Pokémon ist perfekt für OOP – solange Pikachu keine Klasse ist
cover_title: Pokémon als OOP-Modell
cover_subtitle: Warum Komposition besser skaliert als FirePokemon extends Pokemon
status: publish
date: 2026-09-24
created_at: 2026-09-24
updated_at: 2026-09-24
author: obivan
reviewed_by: pending
category: Engineering
excerpt: >-
  Pokémon wirkt wie das perfekte Lehrbuchbeispiel für objektorientierte
  Programmierung. Genau deshalb zeigt es auch sehr gut, wo Vererbung in die
  falsche Richtung führt – und warum Komposition, Interfaces und saubere
  Domänenobjekte besser skalieren.
tags:
  - Pokémon
  - Java
  - OOP
  - Objektorientierte-Programmierung
  - Domain-Modeling
  - Composition
  - Polymorphie
  - Software-Design
search_queries:
  - query: Wie erklärt man objektorientierte Programmierung mit Pokémon?
    maxRank: 1
  - query: Warum ist Komposition oft besser als Vererbung in Java?
    maxRank: 1
  - query: Wie modelliert man ein Pokémon-Kampfsystem objektorientiert?
    maxRank: 1
cover_query: retro handheld game console pixel game creature battle programming
cover_subject: retro handheld game console with a simple turn based creature battle
cover_intent: pokemon-oop-domain-model
cover_avoid: >-
  pokemon logo pikachu copyrighted artwork trading cards phone laptop office
  keyboard code screenshot text logo
---

Autos. Tiere. Bankkonten.

Wer objektorientierte Programmierung lernt, trifft fast immer auf dieselben Beispiele. Eine Klasse `Animal`, davon erbt `Dog`, irgendwo gibt es noch `Car` und `ElectricCar`, und am Ende hat man zwar `extends` geschrieben, aber noch nicht unbedingt verstanden, wann ein Objektmodell wirklich hilfreich ist.

Pokémon ist dafür interessanter.

Ein Pokémon hat Zustand. Es kennt Attacken. Es besitzt einen oder zwei Typen. Attacken können Schaden verursachen, Werte verändern oder Statuszustände auslösen. Ein Kampf hat Regeln, Reihenfolgen und Abhängigkeiten.

Kurz: Die Domäne liefert uns fast von selbst Objekte, Beziehungen und Verhalten.

Und genau deshalb zeigt Pokémon auch sehr schön, wie man OOP **nicht** bauen sollte.

![Rückseiten der europäischen Game-Boy-Cartridges Pokémon Rot, Blau und Gelb](/assets/posts/pokemon-oop/01-pokemon-cartridges.jpg)

*Abb. 1: Pokémon Rot, Blau und Gelb als physische Game-Boy-Cartridges. Foto: Kigsz, CC BY-SA 3.0, via [Wikimedia Commons](/sources.html#pokemon-oop-commons-rby-back).*

## Der erste Reflex: alles vererben

Wenn man OOP gerade lernt, liegt dieses Modell nahe:

~~~java
abstract class Pokemon {
    private String name;
    private int hp;

    abstract void attack(Pokemon target);
}

final class FirePokemon extends Pokemon {
    @Override
    void attack(Pokemon target) {
        // Feuer-Attacke
    }
}

final class WaterPokemon extends Pokemon {
    @Override
    void attack(Pokemon target) {
        // Wasser-Attacke
    }
}

final class ElectricPokemon extends Pokemon {
    @Override
    void attack(Pokemon target) {
        // Elektro-Attacke
    }
}
~~~

Und dann geht es weiter:

~~~text
Pokemon
├── FirePokemon
│   ├── Charmander
│   └── Charizard
├── WaterPokemon
│   └── Squirtle
└── ElectricPokemon
    └── Pikachu
~~~

Für die erste Übung ist das verlockend. Java kann Vererbung, also modelliert man die Welt als Klassenbaum.

Das Problem: Die Pokémon-Domäne ist kein sauberer Klassenbaum.

![Naives Pokémon-Modell mit einer starren Vererbungshierarchie](/assets/posts/pokemon-oop/02-inheritance-trap.svg)

*Abb. 2: Der naive Ansatz presst Spezies, Typen, Attacken und Verhalten in dieselbe Klassenhierarchie.*

Charizard hat beispielsweise zwei Typen. Viele Attacken können von völlig unterschiedlichen Pokémon gelernt werden. Zwei Exemplare derselben Spezies können unterschiedliche Attacken besitzen. Statuszustände wie Vergiftung oder Schlaf sind ebenfalls keine neue Pokémon-Art.

Und eine Evolution ist auch keine Vererbungsbeziehung im Java-Sinn. Ein Raichu ist nicht einfach eine spezialisierte Implementierung eines Pikachu-Objekts.

`Raichu extends Pikachu` klingt thematisch erst einmal logisch – modelliert aber die falsche Beziehung.

## Die wichtigere Frage lautet: Was ist Zustand, was ist Verhalten?

OOP bedeutet nicht, für jedes Substantiv eine Unterklasse anzulegen.

Die modernere Java-Dokumentation beschreibt Objekte als Bündel aus **Zustand und Verhalten**. Interfaces definieren Verträge zwischen Objekten. Vererbung ist nur eines der Werkzeuge dafür, nicht das Ziel der Modellierung. [Dev.java](/sources.html#pokemon-oop-devjava-oop)

Für Pokémon ergibt sich damit ein anderes Bild:

- Eine **Spezies** ist hauptsächlich Daten.
- Ein **Typ** ist ein Wert aus einer begrenzten Menge.
- Ein konkretes **Pokémon** besitzt veränderlichen Kampfzustand.
- Eine **Attacke** beschreibt eine auswählbare Aktion.
- Ein **Effekt** enthält austauschbares Verhalten.
- Ein **Kampf** koordiniert die Regeln zwischen mehreren Objekten.

Das ist eine deutlich stabilere Grenze.

## Pikachu ist ein Objekt – nicht zwangsläufig eine Klasse

Statt `Pikachu extends ElectricPokemon` können wir Spezies als Daten modellieren:

~~~java
public enum Type {
    NORMAL,
    FIRE,
    WATER,
    ELECTRIC,
    GRASS,
    FLYING
}

public record Stats(
        int hp,
        int attack,
        int defense,
        int speed
) {}
~~~

Eine Spezies kann ein unveränderliches Datenobjekt sein:

~~~java
public record Species(
        String name,
        Set<Type> types,
        Stats baseStats
) {
    public Species {
        types = Set.copyOf(types);
    }
}
~~~

Das konkrete Pokémon besitzt dann seine Spezies, seinen aktuellen Zustand und seine Attacken:

~~~java
public final class Pokemon {

    private final Species species;
    private final List<Move> moves;
    private final Set<StatusCondition> conditions =
            EnumSet.noneOf(StatusCondition.class);
    private int hp;

    public Pokemon(Species species, int hp, List<Move> moves) {
        this.species = species;
        this.hp = hp;
        this.moves = List.copyOf(moves);
    }

    public void takeDamage(int damage) {
        if (damage < 0) {
            throw new IllegalArgumentException("damage must be >= 0");
        }

        hp = Math.max(0, hp - damage);
    }

    public void apply(StatusCondition condition) {
        conditions.add(condition);
    }

    public boolean isFainted() {
        return hp == 0;
    }

    public Species species() {
        return species;
    }

    public List<Move> moves() {
        return moves;
    }

    public int hp() {
        return hp;
    }
}
~~~

Damit schützt `Pokemon` seinen eigenen Zustand. Niemand darf von außen einfach `hp = -9000` setzen.

Das ist Kapselung nicht als Prüfungsdefinition, sondern mit einem konkreten Nutzen: Das Objekt erzwingt seine Invarianten selbst.

## Komposition statt Stammbaum

Jetzt wird das Modell interessant.

Ein Pokémon **hat** eine Spezies.

Ein Pokémon **hat** Typen über seine Spezies.

Ein Pokémon **hat** Attacken.

Eine Attacke **hat** einen Effekt.

Ein Kampf **hat** Teilnehmer und Regeln.

![Kompositionsmodell für Pokémon mit Species, Move, Effect und Battle](/assets/posts/pokemon-oop/03-composition-model.svg)

*Abb. 3: Die Beziehungen werden als Komposition modelliert. Verhalten steckt dort, wo es variiert.*

Genau hier ist der Unterschied zwischen *is-a* und *has-a* nützlich. Baeldung beschreibt Vererbung und Komposition als zwei verschiedene Beziehungen und weist ausdrücklich darauf hin, dass Vererbung leicht überbenutzt wird. [Baeldung](/sources.html#pokemon-oop-baeldung-composition)

Für unser Modell heißt das nicht „Vererbung ist schlecht“.

Es heißt nur: **Wir verwenden sie dort, wo wirklich substituierbares Verhalten existiert – nicht dort, wo nur Daten verschieden sind.**

## Attacken sind der perfekte Ort für Polymorphie

Eine Attacke hat einige Daten, aber ihr eigentlicher Effekt kann sehr unterschiedlich sein.

Also definieren wir einen Vertrag:

~~~java
public interface Effect {
    void apply(BattleContext context, Move move);
}
~~~

Die Attacke selbst bleibt klein:

~~~java
public record Move(
        String name,
        Type type,
        int power,
        Effect effect
) {
    public void use(BattleContext context) {
        effect.apply(context, this);
    }
}
~~~

Jetzt können verschiedene Effekte dieselbe Schnittstelle implementieren:

~~~java
public final class DamageEffect implements Effect {

    @Override
    public void apply(BattleContext context, Move move) {
        int damage = DamageCalculator.calculate(
                context.attacker(),
                context.defender(),
                move
        );

        context.defender().takeDamage(damage);
    }
}
~~~

Oder ein Statuseffekt. Für das Beispiel reichen uns drei Zustände:

~~~java
public enum StatusCondition {
    PARALYZED,
    POISONED,
    ASLEEP
}
~~~

Der Effekt selbst bleibt davon getrennt:

~~~java
public final class StatusEffect implements Effect {

    private final StatusCondition condition;

    public StatusEffect(StatusCondition condition) {
        this.condition = condition;
    }

    @Override
    public void apply(BattleContext context, Move move) {
        context.defender().apply(condition);
    }
}
~~~

Der interessante Teil ist nicht das Interface selbst.

Der interessante Teil ist, was dadurch **nicht** passieren muss.

`Pokemon` braucht kein gigantisches:

~~~java
if (move.name().equals("Thunder Shock")) {
    ...
} else if (move.name().equals("Poison Powder")) {
    ...
} else if (move.name().equals("Growl")) {
    ...
}
~~~

Eine neue Effektart erweitert das System an der passenden Stelle.

Das ist Polymorphie, die tatsächlich ein Designproblem löst.

## Eine Attacke kann aus mehreren Effekten bestehen

Pokémon-Attacken sind außerdem ein schönes Beispiel dafür, warum Komposition weiterführt als ein tiefer Klassenbaum.

Nehmen wir eine Attacke, die Schaden verursacht und mit einer gewissen Wahrscheinlichkeit zusätzlich einen Status auslöst.

Man könnte dafür wieder Klassen erfinden:

~~~text
Move
└── DamageMove
    └── DamageAndStatusMove
        └── ProbabilisticDamageAndStatusMove
~~~

Oder man baut kleine Effekte zusammen:

~~~java
Effect thunderShockEffect =
        new SequenceEffect(List.of(
                new DamageEffect(),
                new ChanceEffect(
                        0.10,
                        new StatusEffect(StatusCondition.PARALYZED)
                )
        ));
~~~

Die einzelnen Bausteine bleiben klein.

`DamageEffect` weiß nichts über Wahrscheinlichkeiten.

`ChanceEffect` weiß nichts über Schaden.

`StatusEffect` weiß nichts über die Attacke, die ihn ausgelöst hat.

Das Verhalten entsteht erst durch die Kombination.

Genau diese Richtung sieht man auch in Christopher Okhravis Video **„Rebuilding Pokémon with Object Oriented Programming“** von Februar 2026. Dort wird das Kampfsystem deutlich weiter zerlegt – unter anderem in Moves, Conditions, Targets und Effects. [Video](/sources.html#pokemon-oop-okhravi-video)

Sein Modell geht wesentlich tiefer als das, was wir für einen Blogartikel benötigen. Die interessante Idee dahinter ist aber dieselbe: Komplexes Verhalten entsteht aus kleinen, kombinierbaren Objekten.

## Der Kampf sollte nicht alles selbst machen

Bleibt noch `Battle`.

Auch hier lauert die nächste God-Class.

Ein schlechter `Battle` kennt jede Attacke, berechnet jeden Effekt, verändert direkt HP, entscheidet über Statuszustände und enthält nebenbei noch die komplette Zugreihenfolge.

Besser ist: Der Kampf **orchestriert**.

~~~java
public final class Battle {

    public void executeTurn(
            Pokemon attacker,
            Pokemon defender,
            Move move
    ) {
        if (attacker.isFainted()) {
            throw new IllegalStateException("fainted Pokémon cannot move");
        }

        if (!attacker.moves().contains(move)) {
            throw new IllegalArgumentException("move is not known");
        }

        BattleContext context =
                new BattleContext(attacker, defender);

        move.use(context);
    }
}
~~~

Die Zuständigkeiten bleiben getrennt:

![Ablauf eines Pokémon-Kampfzuges vom gewählten Move bis zur Zustandsänderung](/assets/posts/pokemon-oop/04-battle-flow.svg)

*Abb. 4: `Battle` koordiniert den Zug. Das konkrete Verhalten bleibt in `Move`, `Effect` und den betroffenen Domänenobjekten.*

Das bringt einen weiteren Vorteil: Tests werden einfacher.

Ein `DamageEffect` lässt sich ohne kompletten Spielablauf testen. Ein `ChanceEffect` kann mit kontrollierter Zufallsquelle getestet werden. Und `Pokemon` lässt sich separat darauf prüfen, dass HP nie negativ werden.

## Wo steckt jetzt eigentlich OOP?

Interessanterweise brauchen wir für ein gutes objektorientiertes Modell gar nicht besonders viel Vererbung.

Die klassischen OOP-Ideen sind trotzdem überall:

| Konzept | Im Pokémon-Modell |
| --- | --- |
| Kapselung | `Pokemon` kontrolliert HP und Zustandsänderungen selbst. |
| Abstraktion | `Effect` beschreibt, *was* ein Effekt können muss, nicht wie jeder Effekt intern arbeitet. |
| Polymorphie | `DamageEffect`, `StatusEffect` oder `ChanceEffect` können über denselben Vertrag verwendet werden. |
| Komposition | Pokémon bestehen aus Spezies, Typen und Attacken; Attacken wiederum aus Effekten. |
| Vererbung | Nur dort sinnvoll, wo wirklich eine stabile substituierbare Beziehung existiert. |

Das ist für mich der spannendste Punkt an Pokémon als OOP-Beispiel:

Es erklärt nicht nur die Werkzeuge.

Es zwingt einen ziemlich schnell dazu, darüber nachzudenken, **welches Werkzeug für welche Art von Veränderung gedacht ist**.

## Warum die üblichen Pokémon-Tutorials trotzdem mit Vererbung anfangen

Das ist nicht grundsätzlich falsch.

Für eine erste Übung ist `Pikachu extends Pokemon` sehr leicht zu verstehen. Man sieht Basisklasse, Unterklasse, Überschreiben und Polymorphie direkt im Code. Genau deshalb taucht Pokémon seit Jahren in Kursen und Übungsaufgaben auf.

2025 gab es auf der PyCon AU sogar einen Vortrag mit dem Titel **„Catching them all: teaching fundamental OOP concepts with Pokemon“**. Pokémon wird dort bewusst als Alternative zu abstrakten Standardbeispielen eingesetzt. [PyCon AU](/sources.html#pokemon-oop-pyconau-teaching)

Der Punkt ist nur: Ein Lehrbeispiel darf wachsen.

Am Anfang:

~~~java
class Pikachu extends Pokemon
~~~

Später sollte die Frage kommen:

> Ist Pikachu wirklich eine eigene Verhaltensklasse – oder nur eine Spezies mit bestimmten Daten, Typen und möglichen Attacken?

Genau an dieser Stelle wird aus Syntax plötzlich Software-Design.

## Was ich aus dem Beispiel mitnehme

Pokémon funktioniert so gut für OOP, weil die Domäne gleichzeitig einfach und unangenehm genug ist.

Jeder versteht intuitiv, was ein Pokémon, eine Attacke oder ein Kampf ist. Aber sobald man versucht, daraus eine starre Vererbungshierarchie zu bauen, tauchen Mehrfachtypen, geteilte Attacken, Statuszustände und kombinierte Effekte auf.

Das Modell wehrt sich gegen die einfache Lösung.

Und das ist gut.

Denn die eigentliche Lektion lautet nicht:

**„So funktioniert `extends`.“**

Sondern:

**Objektorientierung wird dann nützlich, wenn Objekte ihre eigenen Regeln schützen und veränderliches Verhalten über klare Verträge zusammengesetzt werden kann.**

Oder kürzer:

**Pikachu ist ein hervorragendes Objekt. Es muss dafür keine eigene Java-Klasse sein.**

## Weiterführende Quellen

- [Dev.java: Objects, Classes, Interfaces, Packages, and Inheritance](/sources.html#pokemon-oop-devjava-oop)
- [Baeldung: Inheritance and Composition in Java](/sources.html#pokemon-oop-baeldung-composition)
- [Christopher Okhravi: Rebuilding Pokémon with Object Oriented Programming](/sources.html#pokemon-oop-okhravi-video)
- [PyCon AU 2025: Catching them all – teaching fundamental OOP concepts with Pokemon](/sources.html#pokemon-oop-pyconau-teaching)
- [Wikimedia Commons: Pokémon Red, Blue and Yellow cartridges](/sources.html#pokemon-oop-commons-rby-back)
