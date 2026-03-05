import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js';
import { db } from '../database.ts';
import { config } from '../config.ts';
import type { PollRow } from '../services/pollService.ts';

function formatActivePoll(poll: PollRow): string {
  const scheduledTime = new Date(poll.scheduled_time * 1000);
  const date = scheduledTime.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = scheduledTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  return `📅 **${date}** o godzinie **${time}**\nUtworzył: <@${poll.created_by}>`;
}

export function buildPollPanelPayload(guildId?: string) {
  let activePollInfo = '*Brak aktywnej ankiety*';
  let nextTitle = 'Ankieta';

  const storedTitle = db
    .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get('poll_next_title');
  if (storedTitle) {
    nextTitle = storedTitle.value;
  }

  if (guildId) {
    const poll = db
      .prepare<PollRow, [string]>(
        'SELECT * FROM polls WHERE guild_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
      )
      .get(guildId);

    if (poll) {
      activePollInfo = formatActivePoll(poll);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle('📊  Panel Ankiet')
    .setColor(0x00b36b)
    .setDescription(
      'Zarządzaj ankietami obecności z tego panelu.\n\n' +
        '**Dostępne akcje:**\n' +
        '• **Utwórz ankietę** - tworzy nową ankietę obecności\n' +
        '• **Usuń ankietę** - dezaktywuje aktywną ankietę\n' +
        '• **Przypomnij** - wysyła przypomnienie do osób bez odpowiedzi\n' +
        '• **Ustaw tytuł** - zmienia tytuł następnej ankiety'
    )
    .addFields(
      {
        name: '📋  Aktywna ankieta',
        value: activePollInfo,
      },
      {
        name: '✏️  Tytuł następnej ankiety',
        value: `**${nextTitle}**`,
      }
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('pollpanel:create')
      .setLabel('📊  Utwórz ankietę')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('pollpanel:set_title')
      .setLabel('✏️  Ustaw tytuł')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('pollpanel:delete')
      .setLabel('🗑️  Usuń ankietę')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('pollpanel:remind')
      .setLabel('⏰  Przypomnij')
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

export async function setupPollPanel(client: Client): Promise<void> {
  if (!config.pollChannelId) return;

  let channel;
  try {
    channel = await client.channels.fetch(config.pollChannelId);
  } catch {
    console.warn('[pollPanel] Nie można pobrać kanału ankiet:', config.pollChannelId);
    return;
  }

  if (!channel?.isSendable() || !channel.isTextBased()) {
    console.warn('[pollPanel] Kanał nie jest kanałem tekstowym.');
    return;
  }

  const guildId = 'guildId' in channel ? (channel.guildId as string) : undefined;

  const stored = db
    .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get('poll_panel_msg_id');

  if (stored) {
    try {
      const msg = await channel.messages.fetch(stored.value);
      if (msg.author.id === client.user!.id) {
        const payload = buildPollPanelPayload(guildId);
        await msg.edit(payload);
        console.log('[pollPanel] Panel ankiet zaktualizowany.');
        return;
      }
    } catch {
      // Wiadomość usunięta - stwórz nową
    }
  }

  const payload = buildPollPanelPayload(guildId);
  const message = await channel.send(payload);

  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('poll_panel_msg_id', message.id);

  console.log('[pollPanel] Stworzono panel ankiet, ID:', message.id);
}

export async function refreshPollPanel(client: Client): Promise<void> {
  if (!config.pollChannelId) return;

  const stored = db
    .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get('poll_panel_msg_id');

  if (!stored) return;

  try {
    const channel = await client.channels.fetch(config.pollChannelId);
    if (!channel?.isSendable() || !channel.isTextBased()) return;

    const guildId = 'guildId' in channel ? (channel.guildId as string) : undefined;
    const msg = await channel.messages.fetch(stored.value);
    const payload = buildPollPanelPayload(guildId);
    await msg.edit(payload);
  } catch (err) {
    console.error('[pollPanel] Błąd odświeżania panelu:', err);
  }
}
