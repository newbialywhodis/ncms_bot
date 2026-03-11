export const MAX_POSITIONS_PER_MEMBER = 3;
export const POSITION_NICKNAME_SEPARATOR = ' | ';

export const POSITION_DEFINITIONS = [
  { code: 'br', label: 'BR', choiceName: 'BR' },
  { code: 'so', label: '\u015aO', choiceName: '\u015aO' },
  { code: 'lo', label: 'LO', choiceName: 'LO' },
  { code: 'po', label: 'PO', choiceName: 'PO' },
  { code: 'pp', label: 'PP', choiceName: 'PP' },
  { code: 'lp', label: 'LP', choiceName: 'LP' },
  { code: 'spd', label: '\u015aPD', choiceName: '\u015aPD' },
  { code: 'sp', label: '\u015aP', choiceName: '\u015aP' },
  { code: 'spo', label: '\u015aPO', choiceName: '\u015aPO' },
  { code: 'ls', label: 'LS', choiceName: 'LS' },
  { code: 'n', label: 'N', choiceName: 'N' },
  { code: 'ps', label: 'PS', choiceName: 'PS' },
] as const;

export type PositionCode = (typeof POSITION_DEFINITIONS)[number]['code'];
export type PositionDefinition = (typeof POSITION_DEFINITIONS)[number];

const POSITION_DEFINITION_BY_CODE = new Map<PositionCode, PositionDefinition>(
  POSITION_DEFINITIONS.map((position) => [position.code, position]),
);

const POSITION_SORT_ORDER = new Map<PositionCode, number>(
  POSITION_DEFINITIONS.map((position, index) => [position.code, index]),
);

export function isPositionCode(value: string): value is PositionCode {
  return POSITION_DEFINITION_BY_CODE.has(value as PositionCode);
}

export function getPositionDefinition(code: PositionCode): PositionDefinition {
  const definition = POSITION_DEFINITION_BY_CODE.get(code);
  if (!definition) {
    throw new Error(`Unknown position code: ${code}`);
  }

  return definition;
}

export function sortPositionCodes(codes: readonly PositionCode[]): PositionCode[] {
  return [...codes].sort(
    (left, right) =>
      (POSITION_SORT_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (POSITION_SORT_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function dedupePositionCodes(codes: readonly PositionCode[]): PositionCode[] {
  return [...new Set(codes)];
}
