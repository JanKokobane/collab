function normalizePhoneNumber(countryCode, phoneNumber) {
    if (!countryCode || !phoneNumber) {
        return null;
    }

    let code = String(countryCode)
        .trim()
        .replace(/[^\d+]/g, '');

    let number = String(phoneNumber)
        .trim()
        .replace(/\D/g, '');

    if (!code || !number) {
        return null;
    }

    if (!code.startsWith('+')) {
        code = `+${code}`;
    }

    // Remove leading zero from national number.
    number = number.replace(/^0+/, '');

    const normalized = `${code}${number}`;

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
        return null;
    }

    return normalized;
}

module.exports = {
    normalizePhoneNumber
};