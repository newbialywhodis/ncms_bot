import type { GuildMember, PartialGuildMember } from 'discord.js';
import { getConfiguredPositionRoleIds, syncMemberPositionNickname } from '../services/positionService.ts';

export async function handleGuildMemberPositionUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember | PartialGuildMember,
): Promise<void> {
  if (oldMember.partial || newMember.partial) return;
  if (newMember.user.bot) return;

  const configuredRoleIds = getConfiguredPositionRoleIds();
  const roleStateChanged = configuredRoleIds.some(
    (roleId) => oldMember.roles.cache.has(roleId) !== newMember.roles.cache.has(roleId),
  );

  if (!roleStateChanged && oldMember.nickname === newMember.nickname) {
    return;
  }

  try {
    await syncMemberPositionNickname(newMember, 'Synchronize nickname after member update');
  } catch (err) {
    console.error('[memberPositionHandler] Nie udalo sie zsynchronizowac nicku pozycji:', err);
  }
}
