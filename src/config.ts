const required = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'PLAYER_ROLE_ID',
  'ALLOWED_ROLES',
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Brakuje zmiennej środowiskowej: ${key}`);
  }
}

export const config = {
  token: process.env['DISCORD_TOKEN']!,
  clientId: process.env['DISCORD_CLIENT_ID']!,
  guildId: process.env['DISCORD_GUILD_ID']!,
  playerRoleId: process.env['PLAYER_ROLE_ID']!,
  allowedRoleIds: process.env['ALLOWED_ROLES']!.split(',').map((r) => r.trim()).filter(Boolean),
  vacationChannelId: process.env['VACATION_CHANNEL_ID'] ?? null,
  // Opcjonalne - rola nadawana automatycznie podczas urlopu
  vacationRoleId: process.env['VACATION_ROLE_ID'] ?? null,
  pollChannelId: process.env['POLL_CHANNEL_ID'] ?? null,
} as const;
