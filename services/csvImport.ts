import type { Contact } from '../types';

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.map(v => v.replace(/^"|"$/g, '').trim());
}

export function parseContactsCsv(text: string): Array<Partial<Contact>> {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1);

  return rows.map(line => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });

    const tags = (row['tags'] || row['tag'] || '')
      .split(/[;,]/)
      .map(t => t.trim())
      .filter(Boolean);

    const lists = (row['lists'] || row['list'] || '')
      .split(/[;,]/)
      .map(t => t.trim())
      .filter(Boolean);

    const firstName = row['first_name'] || row['firstname'] || row['first name'] || '';
    const lastName = row['last_name'] || row['lastname'] || row['last name'] || '';

    const name = (row['name'] || `${firstName} ${lastName}`.trim()).trim();

    return {
      name,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: row['email'] || '',
      phone: row['phone'] || undefined,
      timezone: row['timezone'] || undefined,
      company: row['company'] || undefined,
      jobTitle: row['job_title'] || row['job title'] || undefined,
      location: row['location'] || undefined,
      website: row['website'] || undefined,
      lifecycleStage: (row['lifecycle_stage'] || row['lifecycle stage'] || undefined) as any,
      temperature: (row['temperature'] || undefined) as any,
      status: (row['status'] || 'Subscribed') as any,
      tags,
      lists,
      acquisitionSource: 'imported_csv',
    };
  });
}




