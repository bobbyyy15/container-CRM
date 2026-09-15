/**
 * Reading a container size or condition typed by a person into the catalog row it means.
 *
 * The catalog names are fixed (10ft, 20ft HC, Cargo Worthy, ...), but a spreadsheet says
 * "40' HC", "40HC", "40 ft High Cube", "CW" or "Wind and Watertight". Matching the text
 * exactly is why every imported sale showed a blank Size and Condition: the import found
 * no catalog row with that exact name and left both unset. Both sides are reduced to one
 * canonical key here, so a sheet value and a catalog name meet whichever way either is
 * written -- including the catalog's own "WWT" before it was renamed.
 *
 * Kept free of any database client so the aliases are unit-testable.
 */

export type CatalogEntry = { id: string; name: string };

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const SIZE_LENGTHS = ['10', '20', '40', '45', '53'];
const HIGH_CUBE = /^(hc|hq|highcube|hicube|hcube)/;

/** "40' HC", "40HC", "40 ft High Cube" -> "40ft HC"; "20'", "20GP", "20 DC" -> "20ft". */
export const canonicalSize = (raw: unknown): string | undefined => {
  const key = compact(String(raw ?? ''));
  const match = key.match(/^(\d{2})(?:ft|feet|foot)?(.*)$/);
  if (!match || !SIZE_LENGTHS.includes(match[1])) return undefined;
  return HIGH_CUBE.test(match[2]) ? `${match[1]}ft HC` : `${match[1]}ft`;
};

const CONDITION_ALIASES: Record<string, string> = {
  brandnew: 'brand new', new: 'brand new', bn: 'brand new', newbuild: 'brand new',
  onetrip: 'one trip', onetripper: 'one trip', '1trip': 'one trip', newonetrip: 'one trip', onetripnew: 'one trip',
  cargoworthy: 'cargo worthy', cw: 'cargo worthy', cargoworthycw: 'cargo worthy',
  windandwatertight: 'wind and watertight', windwatertight: 'wind and watertight', windandwatertite: 'wind and watertight',
  windandwaterproof: 'wind and watertight', wwt: 'wind and watertight', ww: 'wind and watertight',
  windwatertightwwt: 'wind and watertight', windandwatertightwwt: 'wind and watertight',
  asis: 'as-is', asiswhereis: 'as-is',
  refurbished: 'refurbished', refurb: 'refurbished', refurbish: 'refurbished', reconditioned: 'refurbished',
  modified: 'modified', mod: 'modified', custom: 'modified',
  used: 'used',
};

/** "CW", "Cargo Worthy (CW)" -> "cargo worthy"; "WWT", "Wind & Water Tight" -> "wind and watertight". */
export const canonicalCondition = (raw: unknown): string | undefined => {
  const text = String(raw ?? '').trim();
  if (!text) return undefined;
  const whole = compact(text);
  if (CONDITION_ALIASES[whole]) return CONDITION_ALIASES[whole];
  // "Cargo Worthy (CW)": either half may be the recognisable one.
  for (const part of [text.replace(/\(.*?\)/g, ''), ...(text.match(/\((.*?)\)/g) ?? [])]) {
    const alias = CONDITION_ALIASES[compact(part)];
    if (alias) return alias;
  }
  return whole;
};

/** The catalog row a typed size means, or undefined when there is none. */
export const findSizeId = (raw: unknown, sizes: CatalogEntry[]): string | undefined => {
  const wanted = canonicalSize(raw);
  return wanted ? sizes.find(size => canonicalSize(size.name) === wanted)?.id : undefined;
};

/** The catalog row a typed condition means, or undefined when there is none. */
export const findConditionId = (raw: unknown, conditions: CatalogEntry[]): string | undefined => {
  const wanted = canonicalCondition(raw);
  return wanted ? conditions.find(condition => canonicalCondition(condition.name) === wanted)?.id : undefined;
};
