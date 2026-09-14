/**
 * Universal Phone Number Formatter
 *
 * Formats phone numbers into standard North American format: (123) 456-7890
 * as long as the input fills the right amount of characters (10 digits, or 11 digits starting with 1).
 */

export const formatPhoneNumber = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str || str === '—' || str === '-') return str;

  const digits = str.replace(/\D/g, '');

  // Standard 10-digit US/Canada number
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  // 11 digits starting with 1 (US country code)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }

  // If it doesn't fill the 10-digit standard, leave as-is
  return str;
};
