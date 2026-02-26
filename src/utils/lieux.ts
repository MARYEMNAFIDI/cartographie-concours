export interface LieuPoint {
  lieuId: string;
  lieuNom: string;
  latitude: number;
  longitude: number;
  zoneId: string;
  ville: string;
  adresse: string;
  nbConcours?: number;
  nbJournees?: number;
  dateDebut?: string;
  dateFin?: string;
  noteMoyenne?: number;
  nbLignesAr?: number;
  nbLignesArbe?: number;
  partArPct?: number;
  partArbePct?: number;
  nbEvenementsAr?: number;
  nbEvenementsArbe?: number;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields.map((value) => value.trim());
}

export async function loadLieuxCsv(url: string): Promise<LieuPoint[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Lieux introuvables.");
  }

  const csvText = await response.text();
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Lieux invalides: CSV vide.");
  }

  const headers = parseCsvLine(lines[0]);
  const indexByName = new Map(headers.map((name, idx) => [name, idx]));

  const hasOrganizedSchema = ["LIEU", "latitude", "longitude"].every((col) =>
    indexByName.has(col),
  );
  const hasDefaultSchema = ["lieu_id", "lieu_nom", "latitude", "longitude"].every((col) =>
    indexByName.has(col),
  );

  if (!hasOrganizedSchema && !hasDefaultSchema) {
    throw new Error("Lieux invalides: schema CSV non reconnu.");
  }

  const out: LieuPoint[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);

    const latitude = Number(
      fields[indexByName.get("latitude") ?? -1] ?? fields[indexByName.get("LATITUDE") ?? -1],
    );
    const longitude = Number(
      fields[indexByName.get("longitude") ?? -1] ?? fields[indexByName.get("LONGITUDE") ?? -1],
    );
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    if (hasOrganizedSchema) {
      const lieuNom = fields[indexByName.get("LIEU") ?? -1] ?? "Lieu sans nom";
      const nbConcours = Number(fields[indexByName.get("nb_evenements") ?? -1] ?? "");
      const nbJournees = Number(fields[indexByName.get("nb_journees") ?? -1] ?? "");
      const noteMoyenne = Number(
        fields[indexByName.get("note_globale_moyenne") ?? -1] ?? "",
      );
      const nbLignesAr = Number(fields[indexByName.get("nb_lignes_ar") ?? -1] ?? "");
      const nbLignesArbe = Number(fields[indexByName.get("nb_lignes_arbe") ?? -1] ?? "");
      const partArPct = Number(fields[indexByName.get("part_ar_pct") ?? -1] ?? "");
      const partArbePct = Number(fields[indexByName.get("part_arbe_pct") ?? -1] ?? "");
      const nbEvenementsAr = Number(fields[indexByName.get("nb_evenements_ar") ?? -1] ?? "");
      const nbEvenementsArbe = Number(
        fields[indexByName.get("nb_evenements_arbe") ?? -1] ?? "",
      );
      const query = fields[indexByName.get("geocode_query") ?? -1] ?? "";
      const ville = query.includes(",") ? query.split(",")[0].trim() : lieuNom;

      if (Number.isFinite(nbConcours) && nbConcours <= 0) {
        continue;
      }

      out.push({
        lieuId: `ORGA-${i}`,
        lieuNom,
        latitude,
        longitude,
        zoneId: "",
        ville,
        adresse: query,
        nbConcours: Number.isFinite(nbConcours) ? nbConcours : undefined,
        nbJournees: Number.isFinite(nbJournees) ? nbJournees : undefined,
        dateDebut: fields[indexByName.get("date_debut") ?? -1] ?? undefined,
        dateFin: fields[indexByName.get("date_fin") ?? -1] ?? undefined,
        noteMoyenne: Number.isFinite(noteMoyenne) ? noteMoyenne : undefined,
        nbLignesAr: Number.isFinite(nbLignesAr) ? nbLignesAr : undefined,
        nbLignesArbe: Number.isFinite(nbLignesArbe) ? nbLignesArbe : undefined,
        partArPct: Number.isFinite(partArPct) ? partArPct : undefined,
        partArbePct: Number.isFinite(partArbePct) ? partArbePct : undefined,
        nbEvenementsAr: Number.isFinite(nbEvenementsAr) ? nbEvenementsAr : undefined,
        nbEvenementsArbe: Number.isFinite(nbEvenementsArbe) ? nbEvenementsArbe : undefined,
      });
      continue;
    }

    out.push({
      lieuId: fields[indexByName.get("lieu_id") ?? -1] ?? `L-${i}`,
      lieuNom: fields[indexByName.get("lieu_nom") ?? -1] ?? "Lieu sans nom",
      latitude,
      longitude,
      zoneId: fields[indexByName.get("zone_id") ?? -1] ?? "",
      ville: fields[indexByName.get("ville") ?? -1] ?? "",
      adresse: fields[indexByName.get("adresse") ?? -1] ?? "",
    });
  }

  if (out.length === 0) {
    throw new Error("Lieux invalides: aucun point exploitable.");
  }
  return out.sort((a, b) => (b.nbConcours ?? 0) - (a.nbConcours ?? 0));
}
