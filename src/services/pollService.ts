import type { ChatInputCommandInteraction, ButtonInteraction, Client } from 'discord.js';
import { ContainerBuilder, MessageFlags, SeparatorSpacingSize } from 'discord.js';
import { db } from '../database.ts';
import { buildPollMessage } from '../utils/embeds.ts';
import { config } from '../config.ts';
import { isOnVacation } from './vacationService.ts';
import { hasPlayerOrAdminRole } from '../utils/permissions.ts';

export interface PollRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  ping_message_id: string | null;
  scheduled_time: number;
  created_by: string;
  is_active: number;
}

interface ResponseRow {
  user_id: string;
  status: string;
}

// ─── Tworzenie ankiety ────────────────────────────────────────────────────────

export async function createPoll(
  interaction: ChatInputCommandInteraction,
  scheduledTime: Date,
): Promise<void> {
  const guildId = interaction.guildId!;
  const channelId = interaction.channelId;

  // Dezaktywuj poprzednią aktywną ankietę
  db.prepare('UPDATE polls SET is_active = 0 WHERE guild_id = ? AND is_active = 1').run(guildId);

  // Wstaw nową ankietę
  const result = db
    .prepare(
      `INSERT INTO polls (guild_id, channel_id, scheduled_time, created_by)
       VALUES (?, ?, ?, ?)`,
    )
    .run(guildId, channelId, Math.floor(scheduledTime.getTime() / 1000), interaction.user.id);

  const pollId = Number(result.lastInsertRowid);

  // Pobierz graczy z rolą (bez urlopowiczów)
  const guild = await interaction.client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const eligiblePlayers = members.filter(
    (m) => m.roles.cache.has(config.playerRoleId) && !m.user.bot && !isOnVacation(m.id, guildId),
  );

  const noResponseCount = eligiblePlayers.size;
  const mentions = eligiblePlayers.map((m) => `<@${m.id}>`).join(' ');

  const payload = buildPollMessage({
    pollId,
    scheduledTime,
    presentUsers: [],
    absentUsers: [],
    noResponseCount,
  });

  // Container z oznaczeniami wysyłany osobno przed ankietą
  let pingMessageId: string | null = null;
  if (mentions.length > 0) {
    const pingContainer = new ContainerBuilder()
      .setAccentColor(0x00b36b)
      .addTextDisplayComponents((text) =>
        text.setContent(`📢 **Potwierdź obecność!**`),
      )
      .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) =>
        text.setContent(mentions),
      );

    const channel = await interaction.client.channels.fetch(interaction.channelId);
    if (channel?.isSendable()) {
      const pingMsg = await channel.send({
        components: [pingContainer],
        flags: MessageFlags.IsComponentsV2,
      });
      pingMessageId = pingMsg.id;
    }
  }

  const message = await interaction.editReply(payload);

  db.prepare('UPDATE polls SET message_id = ?, ping_message_id = ? WHERE id = ?').run(message.id, pingMessageId, pollId);
}

// ─── Aktualizacja wiadomości ankiety ─────────────────────────────────────────

async function refreshPollMessage(client: Client, poll: PollRow): Promise<void> {
  if (!poll.message_id) return;

  const responses = db
    .prepare<ResponseRow, [number]>('SELECT user_id, status FROM poll_responses WHERE poll_id = ?')
    .all(poll.id);

  const presentUsers = responses.filter((r) => r.status === 'present').map((r) => r.user_id);
  const absentUsers = responses.filter((r) => r.status === 'absent').map((r) => r.user_id);
  const respondedSet = new Set(responses.map((r) => r.user_id));

  const guild = await client.guilds.fetch(poll.guild_id);
  const members = guild.members.cache;

  const noResponseCount = members.filter(
    (m) =>
      m.roles.cache.has(config.playerRoleId) &&
      !m.user.bot &&
      !respondedSet.has(m.id) &&
      !isOnVacation(m.id, poll.guild_id),
  ).size;

  const scheduledTime = new Date(poll.scheduled_time * 1000);
  const payload = buildPollMessage({
    pollId: poll.id,
    scheduledTime,
    presentUsers,
    absentUsers,
    noResponseCount,
  });

  try {
    const channel = await client.channels.fetch(poll.channel_id);
    if (!channel?.isTextBased()) return;
    const message = await channel.messages.fetch(poll.message_id);
    // Nie podajemy content - Discord zachowuje istniejące oznaczenia
    await message.edit(payload);
  } catch (err) {
    console.error('[pollService] Błąd aktualizacji wiadomości:', err);
  }
}

// ─── Obsługa kliknięcia przycisku ────────────────────────────────────────────

export async function handlePollButton(interaction: ButtonInteraction): Promise<void> {
  // Sprawdź uprawnienia - tylko gracze i adminowie
  if (!hasPlayerOrAdminRole(interaction)) {
    await interaction.reply({
      content: '❌ Tylko gracze klubu mogą odpowiadać na ankiety.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [, action, rawId] = interaction.customId.split(':');
  const pollId = parseInt(rawId ?? '', 10);
  if (isNaN(pollId) || (action !== 'present' && action !== 'absent')) return;

  const poll = db
    .prepare<PollRow, [number]>('SELECT * FROM polls WHERE id = ? AND is_active = 1')
    .get(pollId);

  if (!poll) {
    await interaction.reply({
      content: '❌ Ta ankieta jest już nieaktywna.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userId = interaction.user.id;
  const guildId = interaction.guildId ?? poll.guild_id;

  // Sprawdź urlop
  if (isOnVacation(userId, guildId)) {
    await interaction.reply({
      content:
        '🏖️ Jesteś na urlopie - nie możesz odpowiadać na ankiety.\n' +
        'Anuluj urlop komendą `/urlop anuluj` lub przez kanał urlopów.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Wyczyść rolę urlopową jeśli zostało po niej jakiś ślad (urlop wygasł z DB, ale rola zostaje)
  if (config.vacationRoleId && interaction.guild) {
    const member = interaction.guild.members.cache.get(userId);
    if (member?.roles.cache.has(config.vacationRoleId)) {
      member.roles.remove(config.vacationRoleId).catch(() => {});
    }
  }

  const status = action === 'present' ? 'present' : 'absent';

  db.prepare(
    `INSERT INTO poll_responses (poll_id, user_id, status)
     VALUES (?, ?, ?)
     ON CONFLICT(poll_id, user_id) DO UPDATE
       SET status       = excluded.status,
           responded_at = unixepoch()`,
  ).run(pollId, userId, status);

  const label = status === 'present' ? '✅ Zaznaczono: **Obecny**' : '❌ Zaznaczono: **Nieobecny**';
  await interaction.reply({ content: label, flags: MessageFlags.Ephemeral });

  // Aktualizuj embed asynchronicznie
  refreshPollMessage(interaction.client, poll).catch((err) =>
    console.error('[pollService] Błąd odświeżania:', err),
  );
}

// ─── Tworzenie ankiety z panelu ───────────────────────────────────────────────

export async function createPollFromPanel(
  client: Client,
  guildId: string,
  channelId: string,
  scheduledTime: Date,
  createdBy: string,
): Promise<void> {
  // Dezaktywuj poprzednią aktywną ankietę
  db.prepare('UPDATE polls SET is_active = 0 WHERE guild_id = ? AND is_active = 1').run(guildId);

  const result = db
    .prepare(
      `INSERT INTO polls (guild_id, channel_id, scheduled_time, created_by)
       VALUES (?, ?, ?, ?)`,
    )
    .run(guildId, channelId, Math.floor(scheduledTime.getTime() / 1000), createdBy);

  const pollId = Number(result.lastInsertRowid);

  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const eligiblePlayers = members.filter(
    (m) => m.roles.cache.has(config.playerRoleId) && !m.user.bot && !isOnVacation(m.id, guildId),
  );

  const noResponseCount = eligiblePlayers.size;
  const mentions = eligiblePlayers.map((m) => `<@${m.id}>`).join(' ');

  const payload = buildPollMessage({
    pollId,
    scheduledTime,
    presentUsers: [],
    absentUsers: [],
    noResponseCount,
  });

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) return;

  // Ping graczy
  let pingMessageId: string | null = null;
  if (mentions.length > 0) {
    const pingContainer = new ContainerBuilder()
      .setAccentColor(0x00b36b)
      .addTextDisplayComponents((text) =>
        text.setContent(`📢 **Potwierdź obecność!**`),
      )
      .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) =>
        text.setContent(mentions),
      );

    const pingMsg = await channel.send({
      components: [pingContainer],
      flags: MessageFlags.IsComponentsV2,
    });
    pingMessageId = pingMsg.id;
  }

  const message = await channel.send(payload);
  db.prepare('UPDATE polls SET message_id = ?, ping_message_id = ? WHERE id = ?').run(message.id, pingMessageId, pollId);
}

// ─── Usunięcie aktywnej ankiety ──────────────────────────────────────────────

export async function deleteActivePoll(client: Client, guildId: string): Promise<boolean> {
  const poll = db
    .prepare<PollRow, [string]>(
      'SELECT * FROM polls WHERE guild_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
    )
    .get(guildId);

  if (!poll) return false;

  db.prepare('UPDATE polls SET is_active = 0 WHERE id = ?').run(poll.id);

  // Usuń wiadomości ankiety i pinga z kanału
  if (poll.message_id || poll.ping_message_id) {
    try {
      const channel = await client.channels.fetch(poll.channel_id);
      if (channel?.isTextBased()) {
        if (poll.message_id) {
          const msg = await channel.messages.fetch(poll.message_id);
          await msg.delete();
        }
        if (poll.ping_message_id) {
          const pingMsg = await channel.messages.fetch(poll.ping_message_id);
          await pingMsg.delete();
        }
      }
    } catch {
      // Wiadomość już usunięta - ignoruj
    }
  }

  return true;
}

// ─── Przypomnienie z panelu ──────────────────────────────────────────────────

export async function remindActivePollFromPanel(
  client: Client,
  guildId: string,
): Promise<{ success: boolean; message: string }> {
  const poll = db
    .prepare<PollRow, [string]>(
      'SELECT * FROM polls WHERE guild_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
    )
    .get(guildId);

  if (!poll) return { success: false, message: '❌ Brak aktywnej ankiety na tym serwerze.' };

  const guild = await client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const respondedIds = new Set(
    db
      .prepare<{ user_id: string }, [number]>(
        'SELECT user_id FROM poll_responses WHERE poll_id = ?',
      )
      .all(poll.id)
      .map((r) => r.user_id),
  );

  const toRemind = members.filter(
    (m) =>
      m.roles.cache.has(config.playerRoleId) &&
      !m.user.bot &&
      !respondedIds.has(m.id) &&
      !isOnVacation(m.id, guildId),
  );

  if (toRemind.size === 0) {
    return { success: true, message: '✅ Wszyscy gracze odpowiedzieli już na ankietę!' };
  }

  const scheduledTime = new Date(poll.scheduled_time * 1000);
  const date = scheduledTime.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const time = scheduledTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  const pollChannel = await client.channels.fetch(poll.channel_id);
  if (!pollChannel?.isSendable() || !pollChannel.isTextBased()) {
    return { success: false, message: '❌ Nie mogę znaleźć kanału z ankietą.' };
  }

  const mentions = toRemind.map((m) => `<@${m.id}>`).join(' ');

  const reminderContainer = new ContainerBuilder()
    .setAccentColor(0xffa500)
    .addTextDisplayComponents((text) =>
      text.setContent(`⏰ **Przypomnienie!** Poniższe osoby nie odpowiedziały jeszcze na ankietę (**${date} godz. ${time}**):`),
    )
    .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(mentions),
    );

  await pollChannel.send({
    components: [reminderContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  return { success: true, message: `✅ Wysłano przypomnienie do **${toRemind.size}** graczy.` };
}

// ─── Przypomnienie (slash command) ───────────────────────────────────────────

export async function remindActivePoll(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId!;

  const poll = db
    .prepare<PollRow, [string]>(
      'SELECT * FROM polls WHERE guild_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
    )
    .get(guildId);

  if (!poll) {
    await interaction.editReply('❌ Brak aktywnej ankiety na tym serwerze.');
    return;
  }

  const guild = await interaction.client.guilds.fetch(guildId);
  const members = await guild.members.fetch();

  const respondedIds = new Set(
    db
      .prepare<{ user_id: string }, [number]>(
        'SELECT user_id FROM poll_responses WHERE poll_id = ?',
      )
      .all(poll.id)
      .map((r) => r.user_id),
  );

  const toRemind = members.filter(
    (m) =>
      m.roles.cache.has(config.playerRoleId) &&
      !m.user.bot &&
      !respondedIds.has(m.id) &&
      !isOnVacation(m.id, guildId),
  );

  if (toRemind.size === 0) {
    await interaction.editReply('✅ Wszyscy gracze odpowiedzieli już na ankietę!');
    return;
  }

  const scheduledTime = new Date(poll.scheduled_time * 1000);
  const date = scheduledTime.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  const time = scheduledTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  const pollChannel = await interaction.client.channels.fetch(poll.channel_id);
  if (!pollChannel?.isSendable() || !pollChannel.isTextBased()) {
    await interaction.editReply('❌ Nie mogę znaleźć kanału z ankietą.');
    return;
  }

  const mentions = toRemind.map((m) => `<@${m.id}>`).join(' ');

  const reminderContainer = new ContainerBuilder()
    .setAccentColor(0xffa500)
    .addTextDisplayComponents((text) =>
      text.setContent(`⏰ **Przypomnienie!** Poniższe osoby nie odpowiedziały jeszcze na ankietę (**${date} godz. ${time}**):`),
    )
    .addSeparatorComponents((sep) => sep.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents((text) =>
      text.setContent(mentions),
    );

  await pollChannel.send({
    components: [reminderContainer],
    flags: MessageFlags.IsComponentsV2,
  });

  await interaction.editReply(`✅ Wysłano przypomnienie do **${toRemind.size}** graczy.`);
}
