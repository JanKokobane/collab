const { query } = require('../config/db');
const { normalizePhoneNumber } = require('../utils/phone');

const checkPhoneNumber = async (req, res, next) => {
    try {
        const {
            countryCode,
            phoneNumber
        } = req.body;

        const phoneNormalized = normalizePhoneNumber(
            countryCode,
            phoneNumber
        );

        if (!phoneNormalized) {
            return res.status(400).json({
                success: false,
                available: false,
                code: 'INVALID_PHONE',
                message: 'Please enter a valid phone number.'
            });
        }

        const result = await query(
            `
            SELECT firebase_uid
            FROM user_phone_numbers
            WHERE phone_normalized = $1
            LIMIT 1
            `,
            [phoneNormalized]
        );

        if (result.rows.length > 0) {
            return res.status(409).json({
                success: false,
                available: false,
                code: 'PHONE_ALREADY_EXISTS',
                message: 'This phone number is already registered.'
            });
        }

        return res.status(200).json({
            success: true,
            available: true,
            message: 'Phone number is available.'
        });

    } catch (error) {
        next(error);
    }
};

const savePhoneNumber = async (req, res, next) => {
    try {
        const {
            countryCode,
            phoneNumber
        } = req.body;

        const firebaseUid = req.firebaseUid;

        if (!firebaseUid) {
            return res.status(401).json({
                success: false,
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Firebase authentication is required.'
            });
        }

        const phoneNormalized = normalizePhoneNumber(
            countryCode,
            phoneNumber
        );

        if (!phoneNormalized) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_PHONE',
                message: 'Please enter a valid phone number.'
            });
        }

        const existing = await query(
            `
            SELECT firebase_uid
            FROM user_phone_numbers
            WHERE phone_normalized = $1
            LIMIT 1
            `,
            [phoneNormalized]
        );

        if (existing.rows.length > 0) {

            if (existing.rows[0].firebase_uid !== firebaseUid) {
                return res.status(409).json({
                    success: false,
                    code: 'PHONE_ALREADY_EXISTS',
                    message: 'This phone number is already registered.'
                });
            }

            return res.status(200).json({
                success: true,
                alreadySaved: true,
                message: 'Phone number is already linked to your account.'
            });
        }

        try {
            const result = await query(
                `
                INSERT INTO user_phone_numbers (
                    firebase_uid,
                    phone_country_code,
                    phone_number,
                    phone_normalized
                )
                VALUES ($1, $2, $3, $4)
                RETURNING
                    id,
                    firebase_uid,
                    phone_country_code,
                    phone_number,
                    phone_normalized,
                    created_at,
                    updated_at
                `,
                [
                    firebaseUid,
                    countryCode,
                    phoneNumber,
                    phoneNormalized
                ]
            );

            return res.status(201).json({
                success: true,
                message: 'Phone number saved successfully.',
                data: result.rows[0]
            });

        } catch (error) {


            if (error.code === '23505') {

                return res.status(409).json({
                    success: false,
                    code: 'PHONE_ALREADY_EXISTS',
                    message: 'This phone number is already registered.'
                });
            }

            throw error;
        }

    } catch (error) {
        next(error);
    }
};

const updatePhoneNumber = async (req, res, next) => {
    try {
        const {
            countryCode,
            phoneNumber
        } = req.body;

        const firebaseUid = req.firebaseUid;

        if (!firebaseUid) {
            return res.status(401).json({
                success: false,
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Firebase authentication is required.'
            });
        }

        const phoneNormalized = normalizePhoneNumber(
            countryCode,
            phoneNumber
        );

        if (!phoneNormalized) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_PHONE',
                message: 'Please enter a valid phone number.'
            });
        }

        const existing = await query(
            `
            SELECT firebase_uid
            FROM user_phone_numbers
            WHERE phone_normalized = $1
            LIMIT 1
            `,
            [phoneNormalized]
        );

        if (
            existing.rows.length > 0 &&
            existing.rows[0].firebase_uid !== firebaseUid
        ) {
            return res.status(409).json({
                success: false,
                code: 'PHONE_ALREADY_EXISTS',
                message: 'This phone number is already registered.'
            });
        }

        const result = await query(
            `
            UPDATE user_phone_numbers
            SET
                phone_country_code = $1,
                phone_number = $2,
                phone_normalized = $3,
                updated_at = NOW()
            WHERE firebase_uid = $4
            RETURNING
                id,
                firebase_uid,
                phone_country_code,
                phone_number,
                phone_normalized,
                created_at,
                updated_at
            `,
            [
                countryCode,
                phoneNumber,
                phoneNormalized,
                firebaseUid
            ]
        );

        if (result.rows.length === 0) {

            try {
                const inserted = await query(
                    `
                    INSERT INTO user_phone_numbers (
                        firebase_uid,
                        phone_country_code,
                        phone_number,
                        phone_normalized
                    )
                    VALUES ($1, $2, $3, $4)
                    RETURNING
                        id,
                        firebase_uid,
                        phone_country_code,
                        phone_number,
                        phone_normalized,
                        created_at,
                        updated_at
                    `,
                    [
                        firebaseUid,
                        countryCode,
                        phoneNumber,
                        phoneNormalized
                    ]
                );

                return res.status(201).json({
                    success: true,
                    message: 'Phone number saved successfully.',
                    data: inserted.rows[0]
                });

            } catch (error) {

                if (error.code === '23505') {
                    return res.status(409).json({
                        success: false,
                        code: 'PHONE_ALREADY_EXISTS',
                        message: 'This phone number is already registered.'
                    });
                }

                throw error;
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Phone number updated successfully.',
            data: result.rows[0]
        });

    } catch (error) {
        next(error);
    }
};


module.exports = {
    checkPhoneNumber,
    savePhoneNumber,
    updatePhoneNumber
};