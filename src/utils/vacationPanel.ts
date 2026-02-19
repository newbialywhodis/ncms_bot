import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js';
import { db } from '../database.ts';
import { config } from '../config.ts';
import { getGuildVacations } from '../services/vacationService.ts';

interface VacationDisplay {
  userId: string;
  endDate: string; // YYYY-MM-DD
}

function formatVacationList(vacations: VacationDisplay[]): string {
  if (vacations.length === 0) return '*Brak urlopowiczów*';
  return vacations
    .map((v) => {
      const [y, m, d] = v.endDate.split('-');
      return `<@${v.userId}> - do **${d}.${m}.${y}**`;
    })
    .join('\n');
}

export function buildVacationPanelPayload(guildId?: string) {
  const roleNote = config.vacationRoleId
    ? '• Otrzymasz rolę <@&' + config.vacationRoleId + '> na serwerze\n'
    : '';

  const embed = new EmbedBuilder()
    .setTitle('🏖️  Panel Urlopów')
    .setColor(0x5865f2)
    .setDescription(
      'Planujesz dłuższą nieobecność? Zadeklaruj urlop - bot automatycznie Cię wykluczy z ankiet i przypomnień.\n\n' +
        '**W trakcie urlopu:**\n' +
        '• Nie będziesz uwzględniany w ankietach obecności\n' +
        '• Nie będziesz pingowany w ankietach\n' +
        roleNote +
        '\n' +
        '**Urlop wygasa automatycznie** po podanej dacie.',
    )
    .addFields({
      name: '📋  Jak to działa',
      value:
        '1. Kliknij **Zadeklaruj urlop** poniżej\n' +
        '2. Wpisz datę końca urlopu w formacie `DD-MM-RRRR`\n' +
        '3. Urlop wygaśnie automatycznie tej nocy\n' +
        '4. Możesz anulować go w dowolnej chwili',
    });

  // Pokaż aktualnych urlopowiczów
  if (guildId) {
    const vacations = getGuildVacations(guildId);
    embed.addFields({
      name: `🌴  Obecnie na urlopie (${vacations.length})`,
      value: formatVacationList(
        vacations.map((v) => ({ userId: v.user_id, endDate: v.end_date })),
      ),
    });
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('vacation:set')
      .setLabel('🏖️  Zadeklaruj urlop')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('vacation:cancel')
      .setLabel('❌  Anuluj urlop')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

export async function setupVacationPanel(client: Client): Promise<void> {
  if (!config.vacationChannelId) return;

  let channel;
  try {
    channel = await client.channels.fetch(config.vacationChannelId);
  } catch {
    console.warn('[vacationPanel] Nie można pobrać kanału urlopów:', config.vacationChannelId);
    return;
  }

  if (!channel?.isSendable() || !channel.isTextBased()) {
    console.warn('[vacationPanel] Kanał nie jest kanałem tekstowym.');
    return;
  }

  // Pobierz guildId z kanału
  const guildId = 'guildId' in channel ? (channel.guildId as string) : undefined;

  // Sprawdź czy panel już istnieje (zapisany w DB)
  const stored = db
    .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get('vacation_panel_msg_id');

  if (stored) {
    try {
      const msg = await channel.messages.fetch(stored.value);
      if (msg.author.id === client.user!.id) {
        // Aktualizuj istniejący panel (odśwież listę urlopowiczów)
        const payload = buildVacationPanelPayload(guildId);
        await msg.edit(payload);
        console.log('[vacationPanel] Panel urlopów zaktualizowany.');
        return;
      }
    } catch {
      // Wiadomość usunięta - stwórz nową
    }
  }

  const payload = buildVacationPanelPayload(guildId);
  const message = await channel.send(payload);

  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run('vacation_panel_msg_id', message.id);

  console.log('[vacationPanel] Stworzono panel urlopów, ID:', message.id);
}

/** Odśwież panel urlopów (np. po ustawieniu/anulowaniu urlopu). */
export async function refreshVacationPanel(client: Client): Promise<void> {
  if (!config.vacationChannelId) return;

  const stored = db
    .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
    .get('vacation_panel_msg_id');

  if (!stored) return;

  try {
    const channel = await client.channels.fetch(config.vacationChannelId);
    if (!channel?.isSendable() || !channel.isTextBased()) return;

    const guildId = 'guildId' in channel ? (channel.guildId as string) : undefined;
    const msg = await channel.messages.fetch(stored.value);
    const payload = buildVacationPanelPayload(guildId);
    await msg.edit(payload);
  } catch (err) {
    console.error('[vacationPanel] Błąd odświeżania panelu:', err);
  }
}
