import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, escapeMarkdown } from 'discord.js';
import type { GuildMember, MessageCreateOptions, PartialGuildMember } from 'discord.js';

export type MemberNotificationType = 'welcome' | 'farewell';

const DEFAULT_TITLES: Record<MemberNotificationType, string> = {
  welcome: '## Witaj na serwerze',
  farewell: '## Do zobaczenia',
};

function formatTimestamp(timestamp: number | null): string | null {
  if (!timestamp) return null;
  return `<t:${Math.floor(timestamp / 1000)}:D>`;
}

function resolveCustomEmojiShortcodes(
  member: GuildMember | PartialGuildMember,
  content: string,
): string {
  return content.replace(/(?<!<):([a-zA-Z0-9_]{2,32}):(?!\d+>)/g, (_, emojiName: string) => {
    const emoji = member.guild.emojis.cache.find((entry) => entry.name === emojiName);
    return emoji ? emoji.toString() : `:${emojiName}:`;
  });
}

export function buildMemberNotification(
  member: GuildMember | PartialGuildMember,
  type: MemberNotificationType,
  titleOverride?: string | null,
): MessageCreateOptions {
  const isWelcome = type === 'welcome';
  const accentColor = isWelcome ? 0x57f287 : 0xed4245;
  const title = resolveCustomEmojiShortcodes(
    member,
    titleOverride?.trim() || DEFAULT_TITLES[type],
  );
  const displayName = escapeMarkdown(member.displayName ?? member.user.username);
  const guildName = escapeMarkdown(member.guild.name);
  const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });

  const leadText = isWelcome
    ? `**${displayName}** dolaczyl do **${guildName}**.`
    : `**${displayName}** opuscil **${guildName}**.`;

  const supportText = isWelcome
    ? 'Milego pobytu i dobrej zabawy.'
    : 'Dzieki za wspolny czas i powodzenia dalej.';

  const metaText = isWelcome
    ? `Konto utworzone: ${formatTimestamp(member.user.createdTimestamp)}`
    : member.joinedTimestamp
      ? `Byl z nami od: ${formatTimestamp(member.joinedTimestamp)}`
      : `ID uzytkownika: \`${member.id}\``;

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents((text) => text.setContent(title))
    .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
    .addSectionComponents((section) =>
      section
        .addTextDisplayComponents(
          (text) => text.setContent(leadText),
          (text) => text.setContent(supportText),
          (text) => text.setContent(metaText),
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(avatarUrl)
            .setDescription(`Avatar uzytkownika ${member.user.tag}`),
        ),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
