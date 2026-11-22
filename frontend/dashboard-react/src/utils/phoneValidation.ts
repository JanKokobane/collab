import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';

export interface PhoneValidationResult {
  valid: boolean;
  message?: string;
  number?: string;
}

export function validatePhoneNumber(
  phoneNumber: string,
  countryCallingCode: string,
  countriesList: string[]
): PhoneValidationResult {
  const trimmed = phoneNumber.trim();
  const countries = countriesList.filter(Boolean) as CountryCode[];

  if (!trimmed || !countries.length) {
    return {
      valid: false,
      message: 'Choose a country code and enter your phone number.'
    };
  }

  const parsedNumber = parsePhoneNumberFromString(trimmed, countries[0]);
  if (!parsedNumber || !parsedNumber.isValid()) {
    return {
      valid: false,
      message: 'Enter a valid phone number for the selected country.'
    };
  }

  if (
    !parsedNumber.country ||
    !countries.includes(parsedNumber.country) ||
    countryCallingCode !== `+${parsedNumber.countryCallingCode}`
  ) {
    return {
      valid: false,
      message: 'The phone number does not match the selected country.'
    };
  }

  return { valid: true, number: parsedNumber.number };
}

export function validatePhoneWithSelect(
  phoneNumber: string,
  countrySelect: HTMLSelectElement | null
): PhoneValidationResult {
  const selectedOption = countrySelect?.selectedOptions?.[0];
  const selectedCountries = (selectedOption?.dataset?.countries || '')
    .split(',')
    .filter(Boolean);
  return validatePhoneNumber(
    phoneNumber,
    selectedOption?.value || '',
    selectedCountries
  );
}
