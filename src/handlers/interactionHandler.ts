import type { Interaction } from 'discord.js';
import {
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  LabelBuilder,
} from 'discord.js';
import { db } from '../database.ts';
import { handlePollButton, createPollFromPanel, deleteActivePoll, remindActivePollFromPanel } from '../services/pollService.ts';
import { setVacation, cancelVacation, getVacation } from '../services/vacationService.ts';
import { config } from '../config.ts';
import { hasPlayerOrAdminRole, hasPermission } from '../utils/permissions.ts';
import { refreshVacationPanel } from '../utils/vacationPanel.ts';
import { refreshPollPanel } from '../utils/pollPanel.ts';

export async function handleInteraction(interaction: Interaction): Promise<void> {
  // ── Przyciski ankiety ───────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('poll:')) {
    try {
      await handlePollButton(interaction);
    } catch (err) {
      console.error('[interactionHandler] Błąd przycisku ankiety:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Wystąpił błąd. Spróbuj ponownie.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    return;
  }

  // ── Przycisk panelu ankiet: Utwórz ──────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'pollpanel:create') {
    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: '❌ Nie masz uprawnień do tworzenia ankiet.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('pollpanel:modal')
      .setTitle('📊  Utwórz ankietę')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Data (DD-MM-RRRR)')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('pollpanel:date')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('np. 25-02-2026')
              .setMinLength(10)
              .setMaxLength(10)
              .setRequired(true),
          ),
        new LabelBuilder()
          .setLabel('Godzina (HH:MM)')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('pollpanel:time')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('np. 20:00')
              .setMinLength(5)
              .setMaxLength(5)
              .setRequired(true),
          ),
      );

    await interaction.showModal(modal);
    return;
  }

  // ── Przycisk panelu ankiet: Ustaw tytuł ──────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'pollpanel:set_title') {
    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: '❌ Nie masz uprawnień do zmiany tytułu ankiet.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const storedTitle = db
      .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
      .get('poll_next_title');

    const modal = new ModalBuilder()
      .setCustomId('pollpanel:title_modal')
      .setTitle('✏️  Ustaw tytuł ankiety')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Tytuł ankiety')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('pollpanel:title_input')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('np. Trening, Mecz')
              .setValue(storedTitle?.value ?? 'Ankieta')
              .setMinLength(1)
              .setMaxLength(50)
              .setRequired(true),
          ),
      );

    await interaction.showModal(modal);
    return;
  }

  // ── Przycisk panelu ankiet: Usuń ──────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'pollpanel:delete') {
    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: '❌ Nie masz uprawnień do usuwania ankiet.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId!;
    const deleted = await deleteActivePoll(interaction.client, guildId);

    if (!deleted) {
      await interaction.editReply('❌ Brak aktywnej ankiety do usunięcia.');
      return;
    }

    await interaction.editReply('✅ Ankieta została usunięta.');

    refreshPollPanel(interaction.client).catch((err) =>
      console.error('[interactionHandler] Błąd odświeżania panelu ankiet:', err),
    );
    return;
  }

  // ── Przycisk panelu ankiet: Przypomnij ────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'pollpanel:remind') {
    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: '❌ Nie masz uprawnień do wysyłania przypomnień.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId!;
    const result = await remindActivePollFromPanel(interaction.client, guildId);

    await interaction.editReply(result.message);
    return;
  }

  // ── Submit modala tytułu ankiety ──────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'pollpanel:title_modal') {
    const newTitle = interaction.fields.getTextInputValue('pollpanel:title_input');

    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run('poll_next_title', newTitle);

    await interaction.reply({
      content: `✅ Tytuł następnej ankiety został ustawiony na: **${newTitle}**`,
      flags: MessageFlags.Ephemeral,
    });

    refreshPollPanel(interaction.client).catch((err) =>
      console.error('[interactionHandler] Błąd odświeżania panelu ankiet:', err),
    );
    return;
  }

  // ── Submit modala tworzenia ankiety z panelu ──────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'pollpanel:modal') {
    const dateInput = interaction.fields.getTextInputValue('pollpanel:date');
    const timeInput = interaction.fields.getTextInputValue('pollpanel:time');

    const dateParts = dateInput.split('-');
    if (dateParts.length !== 3) {
      await interaction.reply({
        content: '❌ Nieprawidłowy format daty. Użyj: **DD-MM-RRRR**',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const timeMatch = timeInput.match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      await interaction.reply({
        content: '❌ Nieprawidłowy format godziny. Użyj: **HH:MM**',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const [dd, mm, yyyy] = dateParts;
    const isoDate = `${yyyy}-${mm}-${dd}T${timeInput}:00`;
    const scheduledTime = new Date(isoDate);

    if (isNaN(scheduledTime.getTime())) {
      await interaction.reply({
        content: '❌ Nieprawidłowa data lub godzina.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (scheduledTime < new Date()) {
      await interaction.reply({
        content: '❌ Data ankiety musi być w przyszłości.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId!;
    // Ankieta jest wysyłana na kanał ankiet (pollChannelId) lub bieżący kanał
    const targetChannelId = config.pollChannelId ?? interaction.channelId!;

    const storedTitle = db
      .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
      .get('poll_next_title');
    const title = storedTitle?.value ?? 'Ankieta';

    await createPollFromPanel(
      interaction.client,
      guildId,
      targetChannelId,
      scheduledTime,
      interaction.user.id,
      title,
    );

    const formatted = scheduledTime.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = scheduledTime.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

    await interaction.editReply(`✅ Ankieta na **${formatted} o ${time}** została utworzona!`);

    refreshPollPanel(interaction.client).catch((err) =>
      console.error('[interactionHandler] Błąd odświeżania panelu ankiet:', err),
    );
    return;
  }

  // ── Przycisk "Zadeklaruj urlop" → otwórz modal ───────────────────────────
  if (interaction.isButton() && interaction.customId === 'vacation:set') {
    if (!hasPlayerOrAdminRole(interaction)) {
      await interaction.reply({
        content: '❌ Tylko gracze klubu mogą korzystać z systemu urlopów.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId('vacation:modal')
      .setTitle('🏖️  Zadeklaruj urlop')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Data końca urlopu (DD-MM-RRRR)')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('vacation:date')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('np. 25-02-2026')
              .setMinLength(10)
              .setMaxLength(10)
              .setRequired(true),
          ),
      );

    await interaction.showModal(modal);
    return;
  }

  // ── Przycisk "Anuluj urlop" ──────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'vacation:cancel') {
    if (!hasPlayerOrAdminRole(interaction)) {
      await interaction.reply({
        content: '❌ Tylko gracze klubu mogą korzystać z systemu urlopów.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    if (!getVacation(userId, guildId)) {
      await interaction.reply({
        content: '❌ Nie masz aktywnego urlopu.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    cancelVacation(userId, guildId);

    if (config.vacationRoleId && interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        await member.roles.remove(config.vacationRoleId);
      } catch (err) {
        console.warn('[interactionHandler] Nie można usunąć roli urlopowej:', err);
      }
    }

    await interaction.editReply('✅ Urlop anulowany. Wracasz do aktywnych graczy!');

    refreshVacationPanel(interaction.client).catch((err) =>
      console.error('[interactionHandler] Błąd odświeżania panelu urlopów:', err),
    );
    return;
  }

  // ── Submit modalu urlopowego ─────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId === 'vacation:modal') {
    const input = interaction.fields.getTextInputValue('vacation:date');
    const parts = input.split('-');

    if (parts.length !== 3) {
      await interaction.reply({
        content: '❌ Nieprawidłowy format daty. Użyj: **DD-MM-RRRR**',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const [dd, mm, yyyy] = parts;
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const parsed = new Date(`${isoDate}T12:00:00`);

    if (isNaN(parsed.getTime())) {
      await interaction.reply({ content: '❌ Nieprawidłowa data.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (parsed < new Date()) {
      await interaction.reply({
        content: '❌ Data urlopu musi być w przyszłości.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    setVacation(userId, guildId, isoDate);

    if (config.vacationRoleId && interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        await member.roles.add(config.vacationRoleId);
      } catch (err) {
        console.warn('[interactionHandler] Nie można nadać roli urlopowej:', err);
      }
    }

    const formatted = parsed.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    await interaction.editReply(`🏖️ Urlop ustawiony do **${formatted}**. Miłego odpoczynku!`);

    refreshVacationPanel(interaction.client).catch((err) =>
      console.error('[interactionHandler] Błąd odświeżania panelu urlopów:', err),
    );
  }
}
