import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js';
import type { Command } from '../client.ts';
import {
  clearGuildSetting,
  getFarewellChannelId,
  getFarewellTitle,
  getWelcomeChannelId,
  getWelcomeTitle,
  setGuildSetting,
} from '../services/guildSettingsService.ts';
import { buildMemberNotification } from '../utils/memberNotificationBuilder.ts';
import { hasPermission } from '../utils/permissions.ts';

type NotificationType = 'welcome' | 'farewell';

function getSettingLabel(type: NotificationType): string {
  return type === 'welcome' ? 'powitan' : 'pozegnan';
}

function getChannelId(guildId: string, type: NotificationType): string | null {
  return type === 'welcome' ? getWelcomeChannelId(guildId) : getFarewellChannelId(guildId);
}

function getTitle(guildId: string, type: NotificationType): string | null {
  return type === 'welcome' ? getWelcomeTitle(guildId) : getFarewellTitle(guildId);
}

function getTitleSettingKey(type: NotificationType): 'welcome_title' | 'farewell_title' {
  return type === 'welcome' ? 'welcome_title' : 'farewell_title';
}

function canManageMemberNotifications(interaction: Parameters<Command['execute']>[0]): boolean {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || hasPermission(interaction),
  );
}

export const powitania: Command = {
  data: new SlashCommandBuilder()
    .setName('powitania')
    .setDescription('Konfiguracja kanalow powitan i pozegnan')
    .addSubcommand((sub) =>
      sub
        .setName('ustaw')
        .setDescription('Ustaw kanal i/lub tytul dla powitan lub pozegnan')
        .addStringOption((opt) =>
          opt
            .setName('typ')
            .setDescription('Ktory kanal chcesz ustawic')
            .setRequired(true)
            .addChoices(
              { name: 'Powitania', value: 'welcome' },
              { name: 'Pozegnania', value: 'farewell' },
            ),
        )
        .addChannelOption((opt) =>
          opt
            .setName('kanal')
            .setDescription('Docelowy kanal tekstowy')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addStringOption((opt) =>
          opt
            .setName('tytul')
            .setDescription('Np. Witaj w Nie Chce Mi Sie :Nie_Chce_Mi_Sie:')
            .setRequired(false)
            .setMinLength(1)
            .setMaxLength(120),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('wylacz')
        .setDescription('Wylacz wysylke powitan lub pozegnan')
        .addStringOption((opt) =>
          opt
            .setName('typ')
            .setDescription('Ktora wysylke chcesz wylaczyc')
            .setRequired(true)
            .addChoices(
              { name: 'Powitania', value: 'welcome' },
              { name: 'Pozegnania', value: 'farewell' },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('pokaz').setDescription('Pokaz aktualna konfiguracje kanalow'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Wyslij testowa wiadomosc na skonfigurowany kanal')
        .addStringOption((opt) =>
          opt
            .setName('typ')
            .setDescription('Ktory typ wiadomosci wyslac')
            .setRequired(true)
            .addChoices(
              { name: 'Powitania', value: 'welcome' },
              { name: 'Pozegnania', value: 'farewell' },
            ),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content: 'Ta komenda dziala tylko na serwerze.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!canManageMemberNotifications(interaction)) {
      await interaction.reply({
        content: 'Nie masz uprawnien do konfiguracji tych powiadomien.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'pokaz') {
      const welcomeChannelId = getWelcomeChannelId(interaction.guildId);
      const farewellChannelId = getFarewellChannelId(interaction.guildId);
      const welcomeTitle = getWelcomeTitle(interaction.guildId);
      const farewellTitle = getFarewellTitle(interaction.guildId);

      await interaction.reply({
        content: [
          `Powitania: ${welcomeChannelId ? `<#${welcomeChannelId}>` : 'nie ustawiono'}`,
          `Tytul powitan: ${welcomeTitle ?? 'domyslny'}`,
          `Pozegnania: ${farewellChannelId ? `<#${farewellChannelId}>` : 'nie ustawiono'}`,
          `Tytul pozegnan: ${farewellTitle ?? 'domyslny'}`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const type = interaction.options.getString('typ', true) as NotificationType;

    if (subcommand === 'ustaw') {
      const channel = interaction.options.getChannel('kanal');
      const title = interaction.options.getString('tytul');

      if (!channel && !title) {
        await interaction.reply({
          content: 'Podaj przynajmniej kanal albo tytul.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (channel) {
        setGuildSetting(
          interaction.guildId,
          type === 'welcome' ? 'welcome_channel_id' : 'farewell_channel_id',
          channel.id,
        );
      }

      if (title) {
        setGuildSetting(interaction.guildId, getTitleSettingKey(type), title);
      }

      const changes: string[] = [];
      if (channel) changes.push(`kanal: <#${channel.id}>`);
      if (title) changes.push(`tytul: ${title}`);

      await interaction.reply({
        content: `Ustawienia ${getSettingLabel(type)} zapisane (${changes.join(', ')}).`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'wylacz') {
      clearGuildSetting(interaction.guildId, type === 'welcome' ? 'welcome_channel_id' : 'farewell_channel_id');

      await interaction.reply({
        content: `Wysylka ${getSettingLabel(type)} zostala wylaczona.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'test') {
      const channelId = getChannelId(interaction.guildId, type);
      if (!channelId) {
        await interaction.reply({
          content: `Najpierw ustaw kanal ${getSettingLabel(type)}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
      if (!channel?.isSendable()) {
        await interaction.reply({
          content: 'Skonfigurowany kanal jest niedostepny lub bot nie moze tam pisac.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);
      await channel.send(buildMemberNotification(member, type, getTitle(interaction.guildId, type)));

      await interaction.reply({
        content: `Test ${getSettingLabel(type)} wyslany na <#${channelId}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

  },
};
