import { createPublicKey, createVerify } from 'node:crypto';
import type { Client } from 'discord.js';
import { config } from '../config.ts';
import {
  initKickService,
  registerKickSubscriptions,
  handleStreamLive,
  handleStreamOffline,
  type KickLivePayload,
} from '../services/kickService.ts';

// ─── Kick Public Key (RSA) ──────────────────────────────────────────────────

const KICK_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

const kickPublicKey = createPublicKey(KICK_PUBLIC_KEY_PEM);

// ─── Weryfikacja sygnatury RSA-SHA256 ────────────────────────────────────────

function verifySignature(headers: Headers, rawBody: string): boolean {
  const messageId = headers.get('Kick-Event-Message-Id') ?? '';
  const timestamp = headers.get('Kick-Event-Message-Timestamp') ?? '';
  const signatureB64 = headers.get('Kick-Event-Signature') ?? '';

  if (!messageId || !timestamp || !signatureB64) return false;

  const payload = `${messageId}.${timestamp}.${rawBody}`;
  const signature = Buffer.from(signatureB64, 'base64');

  try {
    const verifier = createVerify('SHA256');
    verifier.update(payload);
    return verifier.verify(kickPublicKey, signature);
  } catch {
    return false;
  }
}

// ─── Start serwera ────────────────────────────────────────────────────────────

export function startKickWebhookServer(client: Client): void {
  if (!config.kickChannelSlug || !config.kickDiscordChannelId) {
    console.log('[kick] Brak konfiguracji (KICK_CHANNEL_SLUG / KICK_DISCORD_CHANNEL_ID) – webhook wyłączony.');
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

      console.log('[kick] Otrzymano webhook:', {
        messageId: req.headers.get('Kick-Event-Message-Id'),
        timestamp: req.headers.get('Kick-Event-Message-Timestamp'),
        eventType: req.headers.get('Kick-Event-Type'),
        hasSig: !!req.headers.get('Kick-Event-Signature'),
      });

      if (!verifySignature(req.headers, rawBody)) {
        console.warn('[kick] Odrzucono żądanie – nieprawidłowa sygnatura.');
        return new Response('Unauthorized', { status: 401 });
      }

      const eventType = req.headers.get('Kick-Event-Type');
      console.log('[kick] Sygnatura OK! Event:', eventType, 'Body:', rawBody);

      if (eventType === 'livestream.status.updated') {
        const payload = JSON.parse(rawBody) as KickLivePayload;
        console.log('[kick] Payload parsed:', { is_live: payload.is_live, slug: payload.broadcaster.channel_slug });

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
