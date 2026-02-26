# Cartographie concours (Leaflet + React)

Application web simple en une seule page pour visualiser:
- les lieux reellement organisateurs de concours (marqueurs cheval)
- les chevaux elite 2025 (notes entre 70 et 82) sur la meme carte

## Fonctionnalites

- Carte Leaflet plein ecran (fond OpenStreetMap)
- Chargement local de `public/lieux_concours_organises.csv`
- Chargement local de `public/chevaux_elite_2025.csv`
- Filtre de vue carte:
  - `Lieux de concours`
  - `Repartition elites par region`
- Marqueurs cheval pour les lieux organisateurs (vue lieux)
- Bulles par region pour la repartition des elites (vue region)
- Option filtre: afficher l'effectif elite en petits points de distribution (vue region)
- Distinction des points elite par race: `BARBE` vs `ARABE BARBE`
- Popup lieu: nom, ville, nombre de concours, distribution AR/ARBE
- Popup region elite: chevaux elite + repartition BARBE/ARABE BARBE, participations elite, note moyenne, top lieux
- Popup lieu: distribution `AR` (Arabe) / `ARBE` (Arabe Barbe)
- `fitBounds` automatique pour afficher toutes les donnees
- Filtre texte `region/ville/lieu/cheval` (ex: Meknes, Oujda, OUASSIMA)
- Gestion d'erreurs claire si fichier absent/invalide

## Structure

```text
/
  README.md
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  public/
    lieux_concours_organises.csv
    chevaux_elite_2025.csv
  src/
    main.tsx
    App.tsx
    components/
      ZonesMap.tsx
    utils/
      bounds.ts
      elite.ts
      lieux.ts
    styles.css
```

## Installation

```bash
npm i
```

## Lancement

```bash
npm run dev
```

Puis ouvrir l'URL fournie par Vite (souvent `http://localhost:5173`).

## Verification type/build

```bash
npm run typecheck
npm run build
```

## Format attendu des donnees

### 1) Lieux organises (`public/lieux_concours_organises.csv`)

Schema recommande (issu de votre extraction 2025):
- `LIEU`
- `latitude`
- `longitude`
- `nb_evenements`
- `nb_journees`
- `date_debut`
- `date_fin`
- `note_globale_moyenne`
- `geocode_query`
- `nb_lignes_ar`, `nb_lignes_arbe`, `part_ar_pct`, `part_arbe_pct` (optionnel)
- `nb_evenements_ar`, `nb_evenements_arbe` (optionnel)

La carte n'affiche que les lieux avec `nb_evenements > 0`.

### 2) Chevaux elite (`public/chevaux_elite_2025.csv`)

Colonnes attendues:
- `cheval`
- `participations_elite`
- `note_elite_max`
- `note_elite_moyenne`
- `lieu`
- `date_reference`
- `concours_reference`
- `race_reference`
- `latitude`
- `longitude`

## Source de vos donnees 2025

Le fichier public est genere a partir de:
- `outputs_cartographie_2025/lieux_concours_2025_geocodes.csv`
- `outputs_cartographie_2025/concours_2025_nettoye_legere.csv`

Commande PowerShell utilisee:

```powershell
Copy-Item -Force outputs_cartographie_2025/lieux_concours_2025_geocodes.csv public/lieux_concours_organises.csv
```

## Notes

- Pas de backend
- Pas de cle API necessaire
- Une seule page, une seule carte
