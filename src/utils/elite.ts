export interface EliteHorsePoint {
  id: string;
  cheval: string;
  lieu: string;
  dateReference: string;
  concoursReference: string;
  raceReference: string;
  participationsElite: number;
  noteEliteMax: number;
  noteEliteMoyenne: number;
  latitude: number;
  longitude: number;
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

export async function loadEliteCsv(url: string): Promise<EliteHorsePoint[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Chevaux elite introuvables.");
  }

  const csvText = await response.text();
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Chevaux elite invalides: CSV vide.");
  }

  const headers = parseCsvLine(lines[0]);
  const indexByName = new Map(headers.map((name, idx) => [name, idx]));
  const required = ["cheval", "lieu", "latitude", "longitude", "note_elite_max"];
  const missing = required.filter((name) => !indexByName.has(name));
  if (missing.length > 0) {
    throw new Error(`Chevaux elite invalides: colonnes manquantes (${missing.join(", ")}).`);
  }

  const out: EliteHorsePoint[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);
    const latitude = Number(fields[indexByName.get("latitude") ?? -1] ?? "");
    const longitude = Number(fields[indexByName.get("longitude") ?? -1] ?? "");
    const noteEliteMax = Number(fields[indexByName.get("note_elite_max") ?? -1] ?? "");
    const noteEliteMoyenne = Number(fields[indexByName.get("note_elite_moyenne") ?? -1] ?? "");
    const participationsElite = Number(fields[indexByName.get("participations_elite") ?? -1] ?? "");

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(noteEliteMax)) {
      continue;
    }

    out.push({
      id: `EL-${i}`,
      cheval: fields[indexByName.get("cheval") ?? -1] ?? "Cheval inconnu",
      lieu: fields[indexByName.get("lieu") ?? -1] ?? "",
      dateReference: fields[indexByName.get("date_reference") ?? -1] ?? "",
      concoursReference: fields[indexByName.get("concours_reference") ?? -1] ?? "",
      raceReference: fields[indexByName.get("race_reference") ?? -1] ?? "",
      participationsElite: Number.isFinite(participationsElite) ? participationsElite : 0,
      noteEliteMax,
      noteEliteMoyenne: Number.isFinite(noteEliteMoyenne) ? noteEliteMoyenne : noteEliteMax,
      latitude,
      longitude,
    });
  }

  if (out.length === 0) {
    throw new Error("Chevaux elite invalides: aucun point exploitable.");
  }

  return out.sort((a, b) => b.noteEliteMax - a.noteEliteMax);
}
