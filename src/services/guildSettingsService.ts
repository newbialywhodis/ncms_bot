import { db } from '../database.ts';

export type GuildSettingName =
  | 'welcome_channel_id'
  | 'farewell_channel_id'
  | 'welcome_title'
  | 'farewell_title';

function buildGuildSettingKey(guildId: string, name: GuildSettingName): string {
  return `guild:${guildId}:${name}`;
}

export function getGuildSetting(guildId: string, name: GuildSettingName): string | null {
  const row = db
    .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get(buildGuildSettingKey(guildId, name));

  return row?.value ?? null;
}

export function setGuildSetting(guildId: string, name: GuildSettingName, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(buildGuildSettingKey(guildId, name), value);
}

export function clearGuildSetting(guildId: string, name: GuildSettingName): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(buildGuildSettingKey(guildId, name));
}

export function getWelcomeChannelId(guildId: string): string | null {
  return getGuildSetting(guildId, 'welcome_channel_id');
}

export function getFarewellChannelId(guildId: string): string | null {
  return getGuildSetting(guildId, 'farewell_channel_id');
}

export function getWelcomeTitle(guildId: string): string | null {
  return getGuildSetting(guildId, 'welcome_title');
}

export function getFarewellTitle(guildId: string): string | null {
  return getGuildSetting(guildId, 'farewell_title');
}
