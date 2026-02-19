import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { Command } from '../client.ts';
import { hasPermission } from '../utils/permissions.ts';
import { remindActivePoll } from '../services/pollService.ts';

export const przypomnij: Command = {
  data: new SlashCommandBuilder()
    .setName('przypomnij')
    .setDescription('Pinguje graczy, którzy jeszcze nie odpowiedzieli na aktywną ankietę'),

  async execute(interaction) {
    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: '❌ Nie masz uprawnień do tej komendy.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await remindActivePoll(interaction);
  },
};
