# Archivio progetti CVeDI

Archivio dei 76 siti degli studenti di Comunicazione Visiva e Design delle Interfacce, A.A. 2020/21–2025/26.

[Consulta l’archivio](https://cremarco.github.io/cvedi-progetti/) · [Corso 2026/27](https://cremarco.github.io/cvedi2627/)

I siti, gli asset, i font e le relative attribuzioni sono conservati nelle cartelle `a.a.*`. La cronologia Git deriva dal sottoalbero `progetti/` di [cremarco/cvedi2627](https://github.com/cremarco/cvedi2627). I contenuti e le licenze degli studenti e dei fornitori restano quelli dei rispettivi originali; la migrazione non assegna una nuova licenza ai lavori.

La galleria mantiene il tema daisyUI `archive`, il catalogo `gallery-data.json`, i filtri per anno e i visualizzatori dei totem. Non modificare `gallery.css` manualmente: deriva da `gallery.source.css`.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check:indexing
pnpm check:links
```

`pnpm build` prepara `_site/` con i percorsi relativi al repository, esclude i file di sistema e applica `noindex` a tutte le copie HTML pubblicate. I sorgenti degli studenti restano intatti. `PAGES_BASE` può cambiare il prefisso del sito; il valore predefinito è `/cvedi-progetti/`. GitHub Pages viene pubblicato dal workflow `.github/workflows/pages.yml` a ogni push su `main`.

I controlli browser usano `PROJECTS_URL` e producono risultati in `reports/`. Per verificare tutti gli anni: `PROJECTS_ALL=1 pnpm check:projects`. Gli strumenti per screenshot e ottimizzazione sono in `scripts/build/` e `scripts/optimize/`.
