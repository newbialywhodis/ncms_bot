import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { Command } from '../client.ts';
import { hasPlayerOrAdminRole } from '../utils/permissions.ts';
import { setVacation, cancelVacation, getVacation } from '../services/vacationService.ts';
import { config } from '../config.ts';
import { refreshVacationPanel } from '../utils/vacationPanel.ts';

export const urlop: Command = {
  data: new SlashCommandBuilder()
    .setName('urlop')
    .setDescription('Zarządzaj swoim urlopem (wykluczenie z ankiet i przypomnień)')
    .addSubcommand((sub) =>
      sub
        .setName('ustaw')
        .setDescription('Ustaw urlop do podanej daty')
        .addStringOption((opt) =>
          opt
            .setName('data')
            .setDescription('Data końca urlopu (format: DD-MM-RRRR, np. 25-02-2026)')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('anuluj').setDescription('Anuluj swój aktywny urlop'),
    )
    .addSubcommand((sub) =>
      sub.setName('sprawdz').setDescription('Sprawdź swój aktualny urlop'),
    ),

  async execute(interaction) {
    if (!hasPlayerOrAdminRole(interaction)) {
      await interaction.reply({
        content: '❌ Tylko gracze klubu mogą zarządzać urlopami.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId!;

    if (sub === 'ustaw') {
      const input = interaction.options.getString('data', true);
      const parts = input.split('-');

      if (parts.length !== 3) {
        await interaction.reply({
          content: '❌ Nieprawidłowy format daty. Użyj: **DD-MM-RRRR** (np. `25-02-2026`)',
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

      setVacation(userId, guildId, isoDate);

      // Nadaj rolę urlopową
      if (config.vacationRoleId && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          await member.roles.add(config.vacationRoleId);
        } catch (err) {
          console.warn('[urlop] Nie można nadać roli urlopowej:', err);
        }
      }

      const formatted = parsed.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      await interaction.reply({
        content: `🏖️ Urlop ustawiony do **${formatted}**. Miłego odpoczynku!`,
        flags: MessageFlags.Ephemeral,
      });

      refreshVacationPanel(interaction.client).catch((err) =>
        console.error('[urlop] Błąd odświeżania panelu urlopów:', err),
      );
    } else if (sub === 'anuluj') {
      if (!getVacation(userId, guildId)) {
        await interaction.reply({
          content: '❌ Nie masz aktywnego urlopu.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      cancelVacation(userId, guildId);

      // Usuń rolę urlopową
      if (config.vacationRoleId && interaction.guild) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          await member.roles.remove(config.vacationRoleId);
        } catch (err) {
          console.warn('[urlop] Nie można usunąć roli urlopowej:', err);
        }
      }

      await interaction.reply({
        content: '✅ Urlop anulowany. Wracasz do aktywnych graczy!',
        flags: MessageFlags.Ephemeral,
      });

      refreshVacationPanel(interaction.client).catch((err) =>
        console.error('[urlop] Błąd odświeżania panelu urlopów:', err),
      );
    } else if (sub === 'sprawdz') {
      const vacation = getVacation(userId, guildId);
      if (!vacation) {
        await interaction.reply({
          content: 'ℹ️ Nie masz aktywnego urlopu.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const [yyyy, mm, dd] = vacation.end_date.split('-');
      const endDate = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
      const formatted = endDate.toLocaleDateString('pl-PL', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      await interaction.reply({
        content: `🏖️ Twój urlop trwa do **${formatted}**.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
