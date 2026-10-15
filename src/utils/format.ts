/**
 * Shared money formatting.
 *
 * Mirrors CustomerApp/src/utils/format.ts verbatim — three separate npm
 * projects with no shared package, and one errand's total must read the same
 * on all of them.
 */

/**
 * Money, with centavos only when there are any.
 *
 * The delivery fare is charged in whole pesos, so "₱205.00" spends two
 * characters saying nothing. Item money is not whole — a receipt reads
 * ₱994.50 — so this cannot simply drop the decimals; it drops them only when
 * they are zero.
 *
 * Grouping is done by hand rather than through Intl, whose availability differs
 * between Hermes builds and the web bundle. The same function has to give the
 * same answer on all three clients or a customer, a dispatcher and a rider will
 * read different totals for one errand.
 */
export function formatPeso(value: number): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₱0";

  const rounded = Math.round(amount * 100) / 100;
  const sign = rounded < 0 ? "-" : "";
  const magnitude = Math.abs(rounded);

  const text = Number.isInteger(magnitude) ? String(magnitude) : magnitude.toFixed(2);
  const [whole, centavos] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}₱${grouped}${centavos ? `.${centavos}` : ""}`;
}

/**
 * A timestamp a rider can match against a receipt, to the second.
 *
 * `YYYY/MM/DD HH:mm:ss`, in the device's own timezone. Deliberately not
 * toLocaleDateString: history is where a rider goes to settle an argument about
 * which errand was which, and a locale-dependent "8/26/2026" is ambiguous
 * against "26/8/2026" on the next phone. Fixed field order, zero-padded, sorts
 * correctly as a string.
 */
export function formatTimestamp(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * How a pabili item reads: "Chicken · 5 kg".
 *
 * Mirrors server/src/services/patterns/itemLabel.ts and the copies in the web
 * portal and CustomerApp. The size has its own column so "5 Kilo of Chicken
 * 2qty" reaches the rider as Chicken, 5 kg, two of them. A name that already
 * ends with its size (saved while the server folded sizes into names, or
 * "Rice (5kg)") is left as it is.
 */
export function formatItemLabel(name: string | null | undefined, size?: string | null): string {
  const cleanName = String(name ?? '').trim();
  const cleanSize = String(size ?? '').trim();
  if (!cleanSize) return cleanName;
  if (!cleanName) return cleanSize;
  const comparable = (text: string) => text.toLowerCase().replace(/[^a-z0-9.]+/g, '');
  if (comparable(cleanName).endsWith(comparable(cleanSize))) return cleanName;
  return `${cleanName} · ${cleanSize}`;
}
