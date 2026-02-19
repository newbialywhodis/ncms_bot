import type { Interaction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { commands } from '../commands/index.ts';

export async function handleCommand(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[commandHandler] Błąd komendy /${interaction.commandName}:`, err);

    const msg = '❌ Wystąpił nieoczekiwany błąd podczas wykonywania komendy.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: msg });
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
  }
}
