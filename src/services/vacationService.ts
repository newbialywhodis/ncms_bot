import { db } from '../database.ts';

interface VacationRow {
  user_id: string;
  guild_id: string;
  end_date: string; // format: YYYY-MM-DD
}

/** Ustaw urlop. endDate w formacie YYYY-MM-DD */
export function setVacation(userId: string, guildId: string, endDate: string): void {
  db.prepare(
    `INSERT INTO vacations (user_id, guild_id, end_date)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, guild_id) DO UPDATE
       SET end_date = excluded.end_date,
           set_at   = unixepoch()`,
  ).run(userId, guildId, endDate);
}

export function cancelVacation(userId: string, guildId: string): void {
  db.prepare('DELETE FROM vacations WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
}

export function getVacation(userId: string, guildId: string): VacationRow | null {
  const row = db
    .prepare<VacationRow, [string, string]>(
      'SELECT * FROM vacations WHERE user_id = ? AND guild_id = ?',
    )
    .get(userId, guildId);

  if (!row) return null;

  const [year, month, day] = row.end_date.split('-').map(Number);
  const endDate = new Date(year!, month! - 1, day!, 23, 59, 59, 999);

  if (endDate < new Date()) {
    cancelVacation(userId, guildId);
    return null;
  }

  return row;
}

export function isOnVacation(userId: string, guildId: string): boolean {
  return getVacation(userId, guildId) !== null;
}

/** Zwraca listę aktywnych urlopów dla danego serwera (niesclearowane). */
export function getGuildVacations(guildId: string): VacationRow[] {
  const rows = db
    .prepare<VacationRow, [string]>('SELECT * FROM vacations WHERE guild_id = ?')
    .all(guildId);

  const now = new Date();
  const active: VacationRow[] = [];

  for (const row of rows) {
    const [year, month, day] = row.end_date.split('-').map(Number);
    const endDate = new Date(year!, month! - 1, day!, 23, 59, 59, 999);
    if (endDate >= now) {
      active.push(row);
    } else {
      // Wygasły urlop - wyczyść
      cancelVacation(row.user_id, row.guild_id);
    }
  }

  return active;
}
