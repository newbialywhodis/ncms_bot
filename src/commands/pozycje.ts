import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { GuildMember } from 'discord.js';
import type { Command } from '../client.ts';
import {
  MAX_POSITIONS_PER_MEMBER,
  POSITION_DEFINITIONS,
  type PositionCode,
  isPositionCode,
  sortPositionCodes,
} from '../constants/positions.ts';
import { hasPermission } from '../utils/permissions.ts';
import {
  clearMemberPositions,
  describePositionCode,
  formatNicknameSyncMessage,
  formatPositionList,
  getMemberPositionDefinitions,
  getMissingConfiguredPositionCodes,
  isPositionSystemConfigured,
  setMemberPositions,
} from '../services/positionService.ts';

function getSelectedPositionValues(interaction: Parameters<Command['execute']>[0]): string[] {
  return [
    interaction.options.getString('pozycja1'),
    interaction.options.getString('pozycja2'),
    interaction.options.getString('pozycja3'),
  ].filter((value): value is string => Boolean(value));
}

async function resolveTargetMember(
  interaction: Parameters<Command['execute']>[0],
): Promise<GuildMember | null> {
  const user = interaction.options.getUser('uzytkownik', true);
  return interaction.guild?.members.fetch(user.id).catch(() => null) ?? null;
}

function formatMissingConfigMessage(codes: readonly PositionCode[]): string {
  return `Brakuje mapowania POSITION_ROLE_IDS dla: ${codes
    .map((code) => describePositionCode(code))
    .join(', ')}.`;
}

export const pozycje: Command = {
  data: new SlashCommandBuilder()
    .setName('pozycje')
    .setDescription('Zarzadzaj pozycjami zawodnikow')
    .addSubcommand((sub) =>
      sub
        .setName('ustaw')
        .setDescription('Ustaw do trzech pozycji dla wskazanego uzytkownika')
        .addUserOption((opt) =>
          opt
            .setName('uzytkownik')
            .setDescription('Uzytkownik, ktoremu chcesz ustawic pozycje')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('pozycja1')
            .setDescription('Pierwsza pozycja')
            .setRequired(true)
            .addChoices(
              ...POSITION_DEFINITIONS.map((position) => ({
                name: position.choiceName,
                value: position.code,
              })),
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('pozycja2')
            .setDescription('Druga pozycja')
            .setRequired(false)
            .addChoices(
              ...POSITION_DEFINITIONS.map((position) => ({
                name: position.choiceName,
                value: position.code,
              })),
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName('pozycja3')
            .setDescription('Trzecia pozycja')
            .setRequired(false)
            .addChoices(
              ...POSITION_DEFINITIONS.map((position) => ({
                name: position.choiceName,
                value: position.code,
              })),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('wyczysc')
        .setDescription('Usun wszystkie pozycje z uzytkownika')
        .addUserOption((opt) =>
          opt
            .setName('uzytkownik')
            .setDescription('Uzytkownik, ktoremu chcesz usunac pozycje')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pokaz')
        .setDescription('Pokaz aktualne pozycje wskazanego uzytkownika')
        .addUserOption((opt) =>
          opt
            .setName('uzytkownik')
            .setDescription('Uzytkownik, ktorego pozycje chcesz sprawdzic')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      await interaction.reply({
        content: 'Ta komenda dziala tylko na serwerze.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!hasPermission(interaction)) {
      await interaction.reply({
        content: 'Nie masz uprawnien do zarzadzania pozycjami.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!isPositionSystemConfigured()) {
      await interaction.reply({
        content: 'System pozycji nie jest jeszcze skonfigurowany. Uzupelnij POSITION_ROLE_IDS w .env.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const member = await resolveTargetMember(interaction);
    if (!member) {
      await interaction.reply({
        content: 'Nie udalo sie pobrac wskazanego uzytkownika z serwera.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'pokaz') {
      const positions = getMemberPositionDefinitions(member);
      await interaction.reply({
        content: [
          `Uzytkownik: ${member}`,
          `Pozycje: ${formatPositionList(positions)}`,
          `Nick: ${member.nickname ?? member.user.globalName ?? member.user.username}`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === 'wyczysc') {
      const result = await clearMemberPositions(member, interaction.user.id);
      await interaction.editReply(
        [
          `Pozycje uzytkownika ${member} zostaly wyczyszczone.`,
          `Pozycje: ${formatPositionList(result.positions)}`,
          formatNicknameSyncMessage(result.nicknameSync),
        ].join('\n'),
      );
      return;
    }

    const selectedValues = getSelectedPositionValues(interaction);
    const selectedCodes = selectedValues.filter(isPositionCode);
    const sortedCodes = sortPositionCodes(selectedCodes);

    if (sortedCodes.length === 0) {
      await interaction.editReply('Wybierz przynajmniej jedna pozycje.');
      return;
    }

    if (selectedCodes.length !== selectedValues.length) {
      await interaction.editReply('W wywolaniu komendy znalazla sie nieobslugiwana pozycja.');
      return;
    }

    if (new Set(selectedCodes).size !== selectedCodes.length) {
      await interaction.editReply('Nie mozna przypisac tej samej pozycji wiecej niz raz.');
      return;
    }

    if (sortedCodes.length > MAX_POSITIONS_PER_MEMBER) {
      await interaction.editReply(`Mozna przypisac maksymalnie ${MAX_POSITIONS_PER_MEMBER} pozycje.`);
      return;
    }

    const missingCodes = getMissingConfiguredPositionCodes(sortedCodes);
    if (missingCodes.length > 0) {
      await interaction.editReply(formatMissingConfigMessage(missingCodes));
      return;
    }

    const result = await setMemberPositions(member, sortedCodes, interaction.user.id);
    await interaction.editReply(
      [
        `Ustawiono pozycje dla ${member}: ${formatPositionList(result.positions)}`,
        `Wybrane kody: ${sortedCodes.map((code) => describePositionCode(code)).join('/')}`,
        formatNicknameSyncMessage(result.nicknameSync),
      ].join('\n'),
    );
  },
};
