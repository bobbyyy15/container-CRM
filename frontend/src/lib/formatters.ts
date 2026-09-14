/**
 * Universal Phone Number Formatter
 *
 * Formats phone numbers into standard North American format: (123) 456-7890
 * as long as the input fills the right amount of characters (10 digits, or 11 digits starting with 1).
 * If the input does not fill 10 digits (e.g. extension, partial input, international),
 * it preserves the value without corrupting it.
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

/**
 * Formats a phone number dynamically as a user types or pastes into an input field.
 */
export const formatPhoneAsYouType = (value: string): string => {
  if (!value) return '';

  let digits = value.replace(/\D/g, '');

  // Strip leading 1 if 11 digits
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }

  if (digits.length === 0) return '';
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // If longer than 10 digits, format the first 10 and append the rest
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)} ${digits.slice(10)}`;
};
