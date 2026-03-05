import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { Command } from '../client.ts';
import { db } from '../database.ts';
import { hasPermission } from '../utils/permissions.ts';
import { createPoll } from '../services/pollService.ts';

export const ankieta: Command = {
  data: new SlashCommandBuilder()
    .setName('ankieta')
    .setDescription('Tworzy ankietę obecności na trening')
    .addStringOption((opt) =>
      opt
        .setName('dzien')
        .setDescription('Dzień treningu')
        .setRequired(true)
        .addChoices({ name: 'Dzisiaj', value: 'today' }, { name: 'Jutro', value: 'tomorrow' }),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('godzina')
        .setDescription('Godzina treningu (0-23)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(23),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('minuta')
        .setDescription('Minuta treningu (0-59)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(59),
    ),

  async execute(interaction) {
    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: '❌ Nie masz uprawnień do tej komendy.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const day = interaction.options.getString('dzien', true);
    const hour = interaction.options.getInteger('godzina', true);
    const minute = interaction.options.getInteger('minuta', true);

    const now = new Date();
    const scheduled = new Date(now);
    if (day === 'tomorrow') scheduled.setDate(scheduled.getDate() + 1);
    scheduled.setHours(hour, minute, 0, 0);

    if (scheduled <= now) {
      await interaction.reply({
        content: '❌ Podana godzina już minęła. Wybierz jutro lub przyszłą godzinę.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const storedTitle = db
      .prepare<{ value: string }, [string]>('SELECT value FROM settings WHERE key = ?')
      .get('poll_next_title');
    const title = storedTitle?.value ?? 'Ankieta';

    await createPoll(interaction, scheduled, title);
  },
};
