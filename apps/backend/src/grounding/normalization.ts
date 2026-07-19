const CURRENCY_CODES = new Set([
  "AED",
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "HKD",
  "INR",
  "JPY",
  "NZD",
  "SGD",
  "USD",
]);

const MONTHS = [
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may", "may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
] as const;

export const normalizeMinimal = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeSearch = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const tokenizeSearch = (value: string): readonly string[] =>
  normalizeSearch(value).split(" ").filter(Boolean);

export const normalizeEmail = (value: string): string =>
  value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export const normalizeEmailSource = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9@._%+-]+/g, "");

export const digitsOnly = (value: string): string => value.replace(/\D/g, "");

export const extractPhoneDigitSequences = (source: string): readonly string[] => {
  const matches = source.match(/\+?[\d][\d\s().-]{5,}\d/g) ?? [];
  return matches.map(digitsOnly).filter((value) => value.length > 0);
};

export interface ParsedIsoDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export const parseIsoDate = (value: string): ParsedIsoDate | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return undefined;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];

  if (month < 1 || month > 12 || day < 1 || day > (daysInMonth ?? 0)) {
    return undefined;
  }

  return { day, month, year };
};

const pad2 = (value: number): string => value.toString().padStart(2, "0");

const capitalize = (value: string): string => `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;

export const buildDateCandidates = ({ day, month, year }: ParsedIsoDate): readonly string[] => {
  const monthNames = MONTHS[month - 1];
  if (monthNames === undefined) {
    return [];
  }
  const [fullMonthRaw, shortMonthRaw] = monthNames;
  const fullMonth = capitalize(fullMonthRaw);
  const shortMonth = capitalize(shortMonthRaw);
  const yyyy = String(year);

  const ordinalSuffix =
    day % 10 === 1 && day % 100 !== 11
      ? "st"
      : day % 10 === 2 && day % 100 !== 12
        ? "nd"
        : day % 10 === 3 && day % 100 !== 13
          ? "rd"
          : "th";
  const d = String(day);
  const dd = pad2(day);
  const mm = pad2(month);
  const ordinal = `${String(day)}${ordinalSuffix}`;
  const candidates = [
    `${yyyy}-${mm}-${dd}`,
    `${yyyy}/${mm}/${dd}`,
    `${yyyy}.${mm}.${dd}`,
    `${d} ${fullMonth} ${yyyy}`,
    `${dd} ${fullMonth} ${yyyy}`,
    `${fullMonth} ${d} ${yyyy}`,
    `${fullMonth} ${dd} ${yyyy}`,
    `${d} ${shortMonth} ${yyyy}`,
    `${dd} ${shortMonth} ${yyyy}`,
    `${shortMonth} ${d} ${yyyy}`,
    `${shortMonth} ${dd} ${yyyy}`,
    `${fullMonth} ${ordinal} ${yyyy}`,
    `${ordinal} ${fullMonth} ${yyyy}`,
  ];

  if (day > 12) {
    candidates.push(
      `${dd}/${mm}/${yyyy}`,
      `${mm}/${dd}/${yyyy}`,
      `${dd}-${mm}-${yyyy}`,
      `${mm}-${dd}-${yyyy}`,
    );
  }

  return candidates;
};

const stripCurrencyAffixes = (value: string): string => {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens
    .filter((token) => !CURRENCY_CODES.has(token.toUpperCase()))
    .join(" ")
    .replace(/[$\u20ac\u00a3\u00a5\u20b9]/g, "");
};

export const canonicalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = stripCurrencyAffixes(value);
  const negative = /^\(.*\)$/.test(trimmed);
  const unsigned = trimmed.replace(/[()]/g, "").replace(/[,\s]/g, "");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(unsigned)) {
    return undefined;
  }

  const parsed = Number(unsigned);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return negative ? -Math.abs(parsed) : parsed;
};

export const extractNumericMentions = (source: string): readonly number[] => {
  const matches =
    source.match(
      /(?:[$\u20ac\u00a3\u00a5\u20b9]\s*)?(?:[A-Z]{3}\s*)?(?:\([+-]?\d[\d,\s]*(?:\.\d+)?\)|[+-]?\d[\d,\s]*(?:\.\d+)?)(?:\s*[A-Z]{3})?/g,
    ) ?? [];
  return matches
    .map((mention) => canonicalizeNumber(mention))
    .filter((value): value is number => value !== undefined);
};

export const numbersMatch = (actual: number, expected: number): boolean =>
  Math.abs(actual - expected) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
