import type { GuildMember, PartialGuildMember } from 'discord.js';
import {
  getFarewellChannelId,
  getFarewellTitle,
  getWelcomeChannelId,
  getWelcomeTitle,
} from '../services/guildSettingsService.ts';
import { buildMemberNotification, type MemberNotificationType } from '../utils/memberNotificationBuilder.ts';

async function sendMemberNotification(
  member: GuildMember | PartialGuildMember,
  type: MemberNotificationType,
): Promise<void> {
  if (member.user.bot) return;

  const channelId =
    type === 'welcome'
      ? getWelcomeChannelId(member.guild.id)
      : getFarewellChannelId(member.guild.id);

  if (!channelId) return;

  const channel = await member.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isSendable()) {
    console.warn(`[memberHandler] Kanal ${type} jest niedostepny: ${channelId}`);
    return;
  }

  const title = type === 'welcome' ? getWelcomeTitle(member.guild.id) : getFarewellTitle(member.guild.id);

  await channel.send(buildMemberNotification(member, type, title)).catch((err) => {
    console.error(`[memberHandler] Nie udalo sie wyslac wiadomosci ${type}:`, err);
  });
}

export async function handleGuildMemberAdd(member: GuildMember): Promise<void> {
  await sendMemberNotification(member, 'welcome');
}

export async function handleGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
  await sendMemberNotification(member, 'farewell');
}
