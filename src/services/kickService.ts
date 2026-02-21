import { type Client, MessageFlags } from 'discord.js';
import { db } from '../database.ts';
import { config } from '../config.ts';
import { buildLiveNotification, buildStreamEndedNotification } from '../utils/kickNotificationBuilder.ts';

// ─── Typy Kick API ────────────────────────────────────────────────────────────

export interface KickLivestreamData {
  id: string;
  session_title: string;
  viewers: number;
  thumbnail: { url: string } | null;
  categories: Array<{ id: number; name: string }>;
}

export interface KickLivePayload {
  broadcaster_user_id: number;
  broadcaster_user_slug: string;
  broadcaster_user_name: string;
  is_live: boolean;
  livestream: KickLivestreamData | null;
}

interface StateRow {
  slug: string;
  is_live: number;
  notification_msg_id: string | null;
  stream_started_at: number | null;
  updated_at: number;
}

// ─── Inicjalizacja ────────────────────────────────────────────────────────────

export function initKickService(): void {
  if (!config.kickChannelSlug) return;

  db.prepare(
    'INSERT OR IGNORE INTO kick_stream_state (slug, is_live) VALUES (?, 0)',
  ).run(config.kickChannelSlug);

  console.log(`[kick] Monitorowanie kanału: ${config.kickChannelSlug}`);
}

// ─── Stream wystartował ───────────────────────────────────────────────────────

export async function handleStreamLive(client: Client, payload: KickLivePayload): Promise<void> {
  const { broadcaster_user_slug: slug, broadcaster_user_name: name, livestream } = payload;

  if (slug !== config.kickChannelSlug || !config.kickDiscordChannelId) return;

  const state = db
    .prepare<StateRow, [string]>('SELECT * FROM kick_stream_state WHERE slug = ?')
    .get(slug);

  if (state?.is_live) {
    console.log(`[kick] ${slug} już oznaczony jako live – pomijam.`);
    return;
  }

  const channel = await client.channels.fetch(config.kickDiscordChannelId).catch(() => null);
  if (!channel?.isSendable()) {
    console.error('[kick] Nie można pobrać kanału Discord:', config.kickDiscordChannelId);
    return;
  }

  const message = await channel.send({
    ...buildLiveNotification({
      channelSlug: slug,
      channelName: name,
      streamTitle: livestream?.session_title ?? 'Bez tytułu',
      categoryName: livestream?.categories?.[0]?.name ?? null,
      thumbnailUrl: livestream?.thumbnail?.url ?? null,
    }),
    flags: MessageFlags.IsComponentsV2,
  });

  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    `INSERT INTO kick_stream_state (slug, is_live, notification_msg_id, stream_started_at, updated_at)
     VALUES (?, 1, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       is_live             = 1,
       notification_msg_id = excluded.notification_msg_id,
       stream_started_at   = excluded.stream_started_at,
       updated_at          = excluded.updated_at`,
  ).run(slug, message.id, now, now);

  console.log(`[kick] Powiadomienie wysłane: ${name} (${slug})`);
}

// ─── Stream się skończył ──────────────────────────────────────────────────────

export async function handleStreamOffline(client: Client, payload: KickLivePayload): Promise<void> {
  const { broadcaster_user_slug: slug, broadcaster_user_name: name } = payload;

  if (slug !== config.kickChannelSlug || !config.kickDiscordChannelId) return;

  const state = db
    .prepare<StateRow, [string]>('SELECT * FROM kick_stream_state WHERE slug = ?')
    .get(slug);

  if (!state?.is_live) {
    console.log(`[kick] ${slug} już offline – pomijam.`);
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const durationMinutes =
    state.stream_started_at != null
      ? Math.floor((now - state.stream_started_at) / 60)
      : null;

  if (state.notification_msg_id) {
    try {
      const channel = await client.channels.fetch(config.kickDiscordChannelId);
      if (channel?.isTextBased() && channel.isSendable()) {
        const msg = await channel.messages.fetch(state.notification_msg_id);
        await msg.edit({
          ...buildStreamEndedNotification(slug, name, durationMinutes),
          flags: MessageFlags.IsComponentsV2,
        });
      }
    } catch {
      // Wiadomość usunięta lub kanał niedostępny – ignoruj
    }
  }

  db.prepare(
    `UPDATE kick_stream_state
     SET is_live = 0, notification_msg_id = NULL, stream_started_at = NULL, updated_at = ?
     WHERE slug = ?`,
  ).run(now, slug);

  console.log(`[kick] Stream zakończony: ${name} (${slug})`);
}

// ─── Rejestracja subskrypcji przez Kick API ───────────────────────────────────

export async function registerKickSubscriptions(): Promise<void> {
  if (!config.kickAccessToken || !config.kickBroadcasterUserId) {
    console.log('[kick] Brak KICK_ACCESS_TOKEN / KICK_BROADCASTER_USER_ID – pomijam rejestrację subskrypcji.');
    return;
  }

  try {
    const res = await fetch('https://api.kick.com/public/v1/events/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.kickAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{ name: 'livestream.status.updated', version: 1 }],
        broadcaster_user_id: parseInt(config.kickBroadcasterUserId, 10),
        method: 'webhook',
      }),
    });

    if (res.ok) {
      console.log('[kick] Subskrypcja webhook aktywna.');
    } else {
      const text = await res.text();
      console.warn(`[kick] Rejestracja nieudana (${res.status}):`, text);
    }
  } catch (err) {
    console.error('[kick] Błąd sieci podczas rejestracji subskrypcji:', err);
  }
}
