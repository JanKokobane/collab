import { parsePhoneNumberFromString } from 'https://cdn.jsdelivr.net/npm/libphonenumber-js@1.13.14/+esm'

export function validatePhoneNumber(phoneNumber, countrySelect) {
  const selectedOption = countrySelect?.selectedOptions[0]
  const selectedCountries = (selectedOption?.dataset.countries || '').split(',').filter(Boolean)

  if (!phoneNumber.trim() || !selectedCountries.length) {
    return { valid: false, message: 'Choose a country code and enter your phone number.' }
  }

  const parsedNumber = parsePhoneNumberFromString(phoneNumber.trim(), selectedCountries[0])
  if (!parsedNumber || !parsedNumber.isValid()) {
    return { valid: false, message: 'Enter a valid phone number for the selected country.' }
  }

  if (!selectedCountries.includes(parsedNumber.country) || selectedOption.value !== `+${parsedNumber.countryCallingCode}`) {
    return { valid: false, message: 'The phone number does not match the selected country.' }
  }

  return { valid: true, number: parsedNumber.number }
}
