import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Client } from 'discord.js';
import { config } from '../config.ts';
import {
  initKickService,
  registerKickSubscriptions,
  handleStreamLive,
  handleStreamOffline,
  type KickLivePayload,
} from '../services/kickService.ts';

// ─── Weryfikacja sygnatury HMAC ───────────────────────────────────────────────

function verifySignature(headers: Headers, rawBody: string): boolean {
  if (!config.kickWebhookSecret) return false;

  const messageId = headers.get('Kick-Event-MessageId') ?? '';
  const timestamp = headers.get('Kick-Event-Timestamp') ?? '';
  const providedSig = headers.get('Kick-Event-Signature') ?? '';

  const expected = createHmac('sha256', config.kickWebhookSecret)
    .update(messageId + timestamp + rawBody)
    .digest('hex');

  const provided = providedSig.startsWith('sha256=') ? providedSig.slice(7) : providedSig;

  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

// ─── Start serwera ────────────────────────────────────────────────────────────

export function startKickWebhookServer(client: Client): void {
  if (!config.kickWebhookSecret || !config.kickChannelSlug || !config.kickDiscordChannelId) {
    console.log('[kick] Brak konfiguracji (KICK_WEBHOOK_SECRET / KICK_CHANNEL_SLUG / KICK_DISCORD_CHANNEL_ID) – webhook wyłączony.');
    return;
  }

  initKickService();

  Bun.serve({
    port: config.kickWebhookPort,

    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname !== '/webhook/kick' || req.method !== 'POST') {
        return new Response('Not Found', { status: 404 });
      }

      const rawBody = await req.text();

      if (!verifySignature(req.headers, rawBody)) {
        console.warn('[kick] Odrzucono żądanie – nieprawidłowa sygnatura.');
        return new Response('Unauthorized', { status: 401 });
      }

      const eventType = req.headers.get('Kick-Event-SubscriptionType');

      if (eventType === 'livestream.status.updated') {
        const payload = JSON.parse(rawBody) as KickLivePayload;

        if (payload.is_live) {
          handleStreamLive(client, payload).catch((err) =>
            console.error('[kick] Błąd obsługi stream live:', err),
          );
        } else {
          handleStreamOffline(client, payload).catch((err) =>
            console.error('[kick] Błąd obsługi stream offline:', err),
          );
        }
      }

      return new Response('OK', { status: 200 });
    },

    error(err) {
      console.error('[kick] Błąd serwera webhook:', err);
      return new Response('Internal Server Error', { status: 500 });
    },
  });

  console.log(`[kick] Serwer webhook nasłuchuje na porcie ${config.kickWebhookPort} → POST /webhook/kick`);

  registerKickSubscriptions().catch((err) =>
    console.error('[kick] Błąd rejestracji subskrypcji:', err),
  );
}
