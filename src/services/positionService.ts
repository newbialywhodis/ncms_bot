import type { GuildMember } from 'discord.js';
import { config } from '../config.ts';
import {
  MAX_POSITIONS_PER_MEMBER,
  POSITION_DEFINITIONS,
  POSITION_NICKNAME_SEPARATOR,
  type PositionCode,
  type PositionDefinition,
  getPositionDefinition,
  sortPositionCodes,
} from '../constants/positions.ts';

const MAX_DISCORD_NICKNAME_LENGTH = 32;

export type NicknameSyncStatus =
  | 'updated'
  | 'cleared'
  | 'unchanged'
  | 'skipped_missing_permissions'
  | 'skipped_empty_base';

export interface NicknameSyncResult {
  status: NicknameSyncStatus;
  nickname: string | null;
}

export interface PositionUpdateResult {
  positions: PositionDefinition[];
  nicknameSync: NicknameSyncResult;
}

function getConfiguredRoleId(code: PositionCode): string | null {
  return config.positionRoleIdsByCode[code] ?? null;
}

export function getConfiguredPositionDefinitions(): PositionDefinition[] {
  return POSITION_DEFINITIONS.filter((position) => Boolean(getConfiguredRoleId(position.code)));
}

export function getConfiguredPositionRoleIds(): string[] {
  return getConfiguredPositionDefinitions().map((position) => getConfiguredRoleId(position.code)!);
}

export function getMissingConfiguredPositionCodes(codes?: readonly PositionCode[]): PositionCode[] {
  const toCheck = codes ? sortPositionCodes(codes) : POSITION_DEFINITIONS.map((position) => position.code);
  return toCheck.filter((code) => !getConfiguredRoleId(code));
}

export function isPositionSystemConfigured(): boolean {
  return getConfiguredPositionDefinitions().length > 0;
}

export function getMemberPositionDefinitions(member: GuildMember): PositionDefinition[] {
  return getConfiguredPositionDefinitions().filter((position) =>
    member.roles.cache.has(getConfiguredRoleId(position.code)!),
  );
}

function stripManagedPositionSuffix(name: string): string {
  const separatorIndex = name.lastIndexOf(POSITION_NICKNAME_SEPARATOR);
  if (separatorIndex === -1) return name;

  const suffix = name.slice(separatorIndex + POSITION_NICKNAME_SEPARATOR.length);
  const parts = suffix.split('/').map((part) => part.trim()).filter(Boolean);

  if (parts.length === 0 || parts.length > MAX_POSITIONS_PER_MEMBER) {
    return name;
  }

  const knownLabels = new Set<string>(POSITION_DEFINITIONS.map((position) => position.label));
  if (!parts.every((part) => knownLabels.has(part))) {
    return name;
  }

  return name.slice(0, separatorIndex).trimEnd();
}

function buildPositionSuffix(positions: readonly PositionDefinition[]): string {
  return positions.map((position) => position.label).join('/');
}

function getNicknameBase(member: GuildMember): string {
  if (member.nickname) {
    return stripManagedPositionSuffix(member.nickname);
  }

  return member.user.globalName ?? member.user.username;
}

function buildTargetNickname(baseName: string, positions: readonly PositionDefinition[]): string | null {
  if (positions.length === 0) {
    return null;
  }

  const suffix = buildPositionSuffix(positions);
  const maxBaseLength =
    MAX_DISCORD_NICKNAME_LENGTH - POSITION_NICKNAME_SEPARATOR.length - suffix.length;

  if (maxBaseLength < 1) {
    return null;
  }

  const truncatedBase = baseName.slice(0, maxBaseLength).trim();
  if (!truncatedBase) {
    return null;
  }

  return `${truncatedBase}${POSITION_NICKNAME_SEPARATOR}${suffix}`;
}

export async function syncMemberPositionNickname(
  member: GuildMember,
  reason = 'Synchronize member position nickname',
): Promise<NicknameSyncResult> {
  const positions = getMemberPositionDefinitions(member);
  const fallbackName = member.user.globalName ?? member.user.username;
  const currentNicknameBase = member.nickname ? stripManagedPositionSuffix(member.nickname) : null;

  if (!member.manageable) {
    return {
      status: 'skipped_missing_permissions',
      nickname: member.nickname ?? null,
    };
  }

  if (positions.length === 0) {
    if (!member.nickname) {
      return { status: 'unchanged', nickname: null };
    }

    const restoredBase = currentNicknameBase ?? member.nickname;
    if (restoredBase === member.nickname) {
      return { status: 'unchanged', nickname: member.nickname };
    }

    if (restoredBase === fallbackName) {
      await member.setNickname(null, reason);
      return { status: 'cleared', nickname: null };
    }

    await member.setNickname(restoredBase, reason);
    return { status: 'cleared', nickname: restoredBase };
  }

  const baseName = getNicknameBase(member);
  const targetNickname = buildTargetNickname(baseName, positions);
  if (!targetNickname) {
    return {
      status: 'skipped_empty_base',
      nickname: member.nickname ?? null,
    };
  }

  if (member.nickname === targetNickname) {
    return { status: 'unchanged', nickname: member.nickname };
  }

  await member.setNickname(targetNickname, reason);
  return { status: 'updated', nickname: targetNickname };
}

async function applyPositionRoles(
  member: GuildMember,
  nextCodes: readonly PositionCode[],
  reason: string,
): Promise<void> {
  const configuredRoleIds = new Set(getConfiguredPositionRoleIds());
  const nextRoleIds = new Set(
    sortPositionCodes(nextCodes).map((code) => getConfiguredRoleId(code)).filter(Boolean) as string[],
  );

  const rolesToRemove = [...configuredRoleIds].filter(
    (roleId) => member.roles.cache.has(roleId) && !nextRoleIds.has(roleId),
  );
  const rolesToAdd = [...nextRoleIds].filter((roleId) => !member.roles.cache.has(roleId));

  if (rolesToRemove.length > 0) {
    await member.roles.remove(rolesToRemove, reason);
  }

  if (rolesToAdd.length > 0) {
    await member.roles.add(rolesToAdd, reason);
  }
}

export async function setMemberPositions(
  member: GuildMember,
  requestedCodes: readonly PositionCode[],
  actorId: string,
): Promise<PositionUpdateResult> {
  const codes = sortPositionCodes(requestedCodes);

  if (codes.length > MAX_POSITIONS_PER_MEMBER) {
    throw new Error(`Member can have at most ${MAX_POSITIONS_PER_MEMBER} positions.`);
  }

  const missingCodes = getMissingConfiguredPositionCodes(codes);
  if (missingCodes.length > 0) {
    throw new Error(`Missing configured role ids for: ${missingCodes.join(', ')}`);
  }

  const reason = `Position update by ${actorId}`;
  await applyPositionRoles(member, codes, reason);
  const refreshedMember = await member.guild.members.fetch(member.id);
  const nicknameSync = await syncMemberPositionNickname(refreshedMember, reason);

  return {
    positions: getMemberPositionDefinitions(refreshedMember),
    nicknameSync,
  };
}

export async function clearMemberPositions(
  member: GuildMember,
  actorId: string,
): Promise<PositionUpdateResult> {
  return setMemberPositions(member, [], actorId);
}

export function formatPositionList(positions: readonly PositionDefinition[]): string {
  if (positions.length === 0) {
    return 'brak';
  }

  return positions.map((position) => position.label).join('/');
}

export function formatNicknameSyncMessage(result: NicknameSyncResult): string {
  switch (result.status) {
    case 'updated':
      return `Nick ustawiony na: ${result.nickname}`;
    case 'cleared':
      return result.nickname ? `Nick przywrocony do: ${result.nickname}` : 'Nick przywrocony do domyslnego.';
    case 'skipped_missing_permissions':
      return 'Nick nie zostal zmieniony, bo bot nie moze zarzadzac tym uzytkownikiem.';
    case 'skipped_empty_base':
      return 'Nick nie zostal zmieniony, bo nie dalo sie zbudowac poprawnej nazwy.';
    case 'unchanged':
    default:
      return 'Nick nie wymagal zmiany.';
  }
}

export function describePositionCode(code: PositionCode): string {
  return getPositionDefinition(code).label;
}
