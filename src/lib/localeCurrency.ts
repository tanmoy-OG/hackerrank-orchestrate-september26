/**
 * Locality-Based Currency Detection & Formatting Engine
 * Maps client timezone, system locale, and geo signals to supported currencies.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  label: string;
  defaultLaptopPrice: number;
}

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: "USD", symbol: "$", name: "US Dollar", label: "USD ($) - US Dollar", defaultLaptopPrice: 1200 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", label: "INR (₹) - Indian Rupee", defaultLaptopPrice: 85000 },
  { code: "EUR", symbol: "€", name: "Euro", label: "EUR (€) - Euro", defaultLaptopPrice: 1100 },
  { code: "GBP", symbol: "£", name: "British Pound", label: "GBP (£) - British Pound", defaultLaptopPrice: 950 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", label: "CAD (C$) - Canadian Dollar", defaultLaptopPrice: 1600 },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", label: "AUD (A$) - Australian Dollar", defaultLaptopPrice: 1800 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", label: "JPY (¥) - Japanese Yen", defaultLaptopPrice: 180000 },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", label: "IDR (Rp) - Indonesian Rupiah", defaultLaptopPrice: 18500000 },
  { code: "ZAR", symbol: "R", name: "South African Rand", label: "ZAR (R) - South African Rand", defaultLaptopPrice: 22000 },
];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  INR: "₹",
  EUR: "€",
  GBP: "£",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  IDR: "Rp",
  ZAR: "R",
};

/**
 * Maps ISO 3166-1 alpha-2 country codes to supported currency codes.
 */
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  // India & subcontinent
  IN: "INR",

  // United States & territories
  US: "USD",
  PR: "USD",
  GU: "USD",
  VI: "USD",
  MP: "USD",
  AS: "USD",

  // United Kingdom & dependencies
  GB: "GBP",
  UK: "GBP",
  IM: "GBP",
  GG: "GBP",
  JE: "GBP",
  GI: "GBP",

  // Eurozone
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  IE: "EUR",
  FI: "EUR",
  PT: "EUR",
  GR: "EUR",
  LU: "EUR",
  EE: "EUR",
  LV: "EUR",
  LT: "EUR",
  SK: "EUR",
  SI: "EUR",
  CY: "EUR",
  MT: "EUR",
  HR: "EUR",
  MC: "EUR",
  VA: "EUR",
  SM: "EUR",
  AD: "EUR",

  // Canada
  CA: "CAD",

  // Australia
  AU: "AUD",
  CX: "AUD",
  CC: "AUD",
  NF: "AUD",

  // Japan
  JP: "JPY",

  // Indonesia
  ID: "IDR",

  // South Africa
  ZA: "ZAR",
};

/**
 * Direct mapping of distinct IANA Time Zones to currencies.
 * This is especially effective because user OS language may be "en-US"
 * while their timezone is set to their physical location (e.g. "Asia/Calcutta").
 */
function getCurrencyFromTimeZone(timeZone: string): string | null {
  if (!timeZone) return null;
  const tz = timeZone.trim().toLowerCase();

  // India
  if (
    tz === "asia/kolkata" ||
    tz === "asia/calcutta" ||
    tz.startsWith("asia/kol") ||
    tz.startsWith("asia/calc") ||
    tz === "ist"
  ) {
    return "INR";
  }

  // United Kingdom
  if (
    tz === "europe/london" ||
    tz === "europe/belfast" ||
    tz === "europe/jersey" ||
    tz === "europe/guernsey" ||
    tz === "europe/isle_of_man" ||
    tz === "europe/gibraltar"
  ) {
    return "GBP";
  }

  // Japan
  if (tz === "asia/tokyo") {
    return "JPY";
  }

  // Indonesia
  if (
    tz === "asia/jakarta" ||
    tz === "asia/makassar" ||
    tz === "asia/jayapura" ||
    tz === "asia/pontianak"
  ) {
    return "IDR";
  }

  // South Africa
  if (tz === "africa/johannesburg") {
    return "ZAR";
  }

  // Australia
  if (tz.startsWith("australia/") || tz === "antarctica/macquarie") {
    return "AUD";
  }

  // Canada
  const canadianZones = [
    "america/toronto",
    "america/vancouver",
    "america/montreal",
    "america/edmonton",
    "america/winnipeg",
    "america/halifax",
    "america/st_johns",
    "america/regina",
    "america/moncton",
    "america/iqaluit",
    "america/whitehorse",
    "america/yellowknife",
  ];
  if (canadianZones.includes(tz)) {
    return "CAD";
  }

  // Eurozone European Timezones
  const eurozoneZones = [
    "europe/berlin",
    "europe/paris",
    "europe/rome",
    "europe/madrid",
    "europe/amsterdam",
    "europe/brussels",
    "europe/vienna",
    "europe/dublin",
    "europe/helsinki",
    "europe/lisbon",
    "europe/athens",
    "europe/luxembourg",
    "europe/tallinn",
    "europe/riga",
    "europe/vilnius",
    "europe/bratislava",
    "europe/ljubljana",
    "europe/nicosia",
    "europe/valletta",
    "europe/zagreb",
    "europe/monaco",
    "europe/vatican",
    "europe/san_marino",
    "europe/andorra",
    "atlantic/canary",
    "atlantic/madeira",
  ];
  if (eurozoneZones.includes(tz)) {
    return "EUR";
  }

  // United States
  const usZones = [
    "america/new_york",
    "america/detroit",
    "america/chicago",
    "america/menominee",
    "america/denver",
    "america/boise",
    "america/phoenix",
    "america/los_angeles",
    "america/anchorage",
    "america/juneau",
    "america/sitka",
    "america/metlakatla",
    "america/yakutat",
    "america/nome",
    "america/adak",
    "pacific/honolulu",
  ];
  if (
    usZones.includes(tz) ||
    tz.startsWith("america/indiana/") ||
    tz.startsWith("america/kentucky/") ||
    tz.startsWith("america/north_dakota/")
  ) {
    return "USD";
  }

  return null;
}

/**
 * Extracts country code from a locale string like 'en-IN', 'hi_IN', 'en-US'.
 */
function extractCountryCode(localeStr: string): string | null {
  if (!localeStr) return null;
  try {
    if (typeof Intl !== "undefined" && typeof (Intl as any).Locale === "function") {
      const locale = new (Intl as any).Locale(localeStr);
      if (locale.region) {
        return locale.region.toUpperCase();
      }
      if (typeof locale.maximize === "function") {
        const maximized = locale.maximize();
        if (maximized.region) return maximized.region.toUpperCase();
      }
    }
  } catch {
    // Fall back to regex parsing
  }

  const parts = localeStr.replace("_", "-").split("-");
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1].toUpperCase();
    if (candidate.length === 2) return candidate;
  }

  return null;
}

/**
 * Detect the locality currency of the visitor.
 * Checks timezone first (highest locality accuracy), followed by locale tags.
 * Falls back to "USD".
 */
export function detectLocalityCurrency(forcedTimeZone?: string): string {
  try {
    // 1. Check IANA Time Zone (most accurate indicator of physical locality)
    let timeZone = forcedTimeZone;
    if (!timeZone && typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    if (timeZone) {
      const tzCurrency = getCurrencyFromTimeZone(timeZone);
      if (tzCurrency) return tzCurrency;
    }

    // 2. Check navigator.languages / navigator.language for country region
    if (typeof navigator !== "undefined") {
      const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
      for (const lang of languages) {
        if (!lang) continue;
        const country = extractCountryCode(lang);
        if (country && COUNTRY_TO_CURRENCY[country]) {
          return COUNTRY_TO_CURRENCY[country];
        }
      }
    }
  } catch (err) {
    console.warn("Locality currency detection error:", err);
  }

  return "USD";
}

/**
 * Get symbol for a given currency code. Defaults to '$'.
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[(currency || "USD").toUpperCase()] || "$";
}

/**
 * Format a number as currency with proper localized symbol.
 */
export function formatCurrencyAmount(amount: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const symbol = getCurrencySymbol(code);
  try {
    return `${symbol}${Number(amount || 0).toLocaleString()}`;
  } catch {
    return `${symbol}${amount}`;
  }
}

/**
 * Returns a localized sample purchase query and amount tailored to the detected currency.
 */
export function getLocalizedDefaultScenario(currency: string): { query: string; amount: number } {
  const code = (currency || "USD").toUpperCase();
  const symbol = getCurrencySymbol(code);

  const config = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  const laptopPrice = config ? config.defaultLaptopPrice : 1200;
  const formattedPrice = `${symbol}${laptopPrice.toLocaleString()}`;

  return {
    query: `Can I afford to buy a new laptop for ${formattedPrice} today?`,
    amount: laptopPrice,
  };
}

export interface PresetQuery {
  text: string;
  amount: number;
  currency: string;
  allowsPartial?: boolean;
}

/**
 * Returns preset scenario queries adapted to the specified currency.
 */
export function getPresetQueries(currency: string): PresetQuery[] {
  const code = (currency || "USD").toUpperCase();

  if (code === "INR") {
    return [
      { text: "Can I afford to buy a new 4K Monitor for ₹65,000 today?", amount: 65000, currency: "INR" },
      { text: "Can I replace the home AC inverter unit for ₹45,000?", amount: 45000, currency: "INR", allowsPartial: true },
      { text: "Can I book family vacation flight tickets for ₹85,000?", amount: 85000, currency: "INR" },
      { text: "Can I pay the annual vehicle insurance premium of ₹24,000?", amount: 24000, currency: "INR" },
      { text: "Can I purchase an espresso coffee machine for ₹38,000?", amount: 38000, currency: "INR", allowsPartial: true },
    ];
  }

  if (code === "EUR") {
    return [
      { text: "Can I afford to buy a new 4K Monitor for €799 today?", amount: 799, currency: "EUR" },
      { text: "Can I replace the home HVAC condenser unit for €3,400?", amount: 3400, currency: "EUR", allowsPartial: true },
      { text: "Can I book family vacation flight tickets for €1,350?", amount: 1350, currency: "EUR" },
      { text: "Can I pay the annual car insurance premium of €850?", amount: 850, currency: "EUR" },
      { text: "Can I purchase a commercial espresso machine for €2,200?", amount: 2200, currency: "EUR", allowsPartial: true },
    ];
  }

  if (code === "GBP") {
    return [
      { text: "Can I afford to buy a new 4K Monitor for £699 today?", amount: 699, currency: "GBP" },
      { text: "Can I replace the home heating boiler for £2,800?", amount: 2800, currency: "GBP", allowsPartial: true },
      { text: "Can I book family vacation flight tickets for £1,150?", amount: 1150, currency: "GBP" },
      { text: "Can I pay the annual car insurance premium of £720?", amount: 720, currency: "GBP" },
      { text: "Can I purchase a commercial espresso machine for £1,900?", amount: 1900, currency: "GBP", allowsPartial: true },
    ];
  }

  if (code === "CAD") {
    return [
      { text: "Can I afford to buy a new 4K Monitor for C$1,199 today?", amount: 1199, currency: "CAD" },
      { text: "Can I replace the home heat pump for C$4,800?", amount: 4800, currency: "CAD", allowsPartial: true },
      { text: "Can I book family vacation flight tickets for C$1,850?", amount: 1850, currency: "CAD" },
      { text: "Can I pay the annual car insurance premium of C$1,200?", amount: 1200, currency: "CAD" },
      { text: "Can I purchase a commercial espresso machine for C$3,100?", amount: 3100, currency: "CAD", allowsPartial: true },
    ];
  }

  if (code === "AUD") {
    return [
      { text: "Can I afford to buy a new 4K Monitor for A$1,350 today?", amount: 1350, currency: "AUD" },
      { text: "Can I replace the split system air conditioner for A$4,900?", amount: 4900, currency: "AUD", allowsPartial: true },
      { text: "Can I book family vacation flight tickets for A$2,100?", amount: 2100, currency: "AUD" },
      { text: "Can I pay the annual comprehensive car insurance of A$1,300?", amount: 1300, currency: "AUD" },
      { text: "Can I purchase a commercial espresso machine for A$3,400?", amount: 3400, currency: "AUD", allowsPartial: true },
    ];
  }

  if (code === "JPY") {
    return [
      { text: "Can I afford to buy a new 4K Monitor for ¥135,000 today?", amount: 135000, currency: "JPY" },
      { text: "Can I replace the home air conditioner for ¥380,000?", amount: 380000, currency: "JPY", allowsPartial: true },
      { text: "Can I book family vacation flight tickets for ¥220,000?", amount: 220000, currency: "JPY" },
      { text: "Can I pay the annual car insurance premium of ¥140,000?", amount: 140000, currency: "JPY" },
      { text: "Can I purchase an espresso machine for ¥320,000?", amount: 320000, currency: "JPY", allowsPartial: true },
    ];
  }

  // Default USD
  return [
    { text: "Can I afford to buy a new 4K Monitor for $899 today?", amount: 899, currency: "USD" },
    { text: "Can I replace the home HVAC condenser unit for $3,800?", amount: 3800, currency: "USD", allowsPartial: true },
    { text: "Can I book family vacation flight tickets for $1,450?", amount: 1450, currency: "USD" },
    { text: "Can I pay the annual car insurance premium of $920?", amount: 920, currency: "USD" },
    { text: "Can I purchase a commercial espresso machine for $2,400?", amount: 2400, currency: "USD", allowsPartial: true },
  ];
}
