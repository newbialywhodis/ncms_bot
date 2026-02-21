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
  vacationRoleId: process.env['VACATION_ROLE_ID'] ?? null,
  pollChannelId: process.env['POLL_CHANNEL_ID'] ?? null,

  // ── Kick.com ─────────────────────────────────────────────────────────────────
  kickWebhookSecret: process.env['KICK_WEBHOOK_SECRET'] ?? null,
  kickChannelSlug: process.env['KICK_CHANNEL_SLUG'] ?? null,
  kickDiscordChannelId: process.env['KICK_DISCORD_CHANNEL_ID'] ?? null,
  kickWebhookPort: parseInt(process.env['KICK_WEBHOOK_PORT'] ?? '3001', 10),
  // Opcjonalne – do automatycznej rejestracji subskrypcji przez API
  kickAccessToken: process.env['KICK_ACCESS_TOKEN'] ?? null,
  kickBroadcasterUserId: process.env['KICK_BROADCASTER_USER_ID'] ?? null,
} as const;
