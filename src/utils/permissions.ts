import type { ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { config } from '../config.ts';

type AnyInteraction = ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction;

function getRoles(interaction: AnyInteraction): readonly string[] {
  const member = interaction.member;
  if (!member) return [];

  const roles = member.roles;
  if (typeof roles === 'object' && 'cache' in roles) {
    return [...roles.cache.keys()];
  }
  if (Array.isArray(roles)) return roles;
  return [];
}

/** Czy użytkownik ma rolę uprawniającą do tworzenia ankiet i przypomnień (ALLOWED_ROLES) */
export function hasPermission(interaction: AnyInteraction): boolean {
  const roles = getRoles(interaction);
  return config.allowedRoleIds.some((id) => roles.includes(id));
}

/** Czy użytkownik jest graczem lub adminem (PLAYER_ROLE_ID lub ALLOWED_ROLES) */
export function hasPlayerOrAdminRole(interaction: AnyInteraction): boolean {
  const roles = getRoles(interaction);
  return (
    roles.includes(config.playerRoleId) ||
    config.allowedRoleIds.some((id) => roles.includes(id))
  );
}
