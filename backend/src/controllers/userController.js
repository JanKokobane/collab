const { query } = require('../config/db');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const MAX_PROFILE_IMAGE_LENGTH = 350_000;
const profileImagePattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const getProfileImage = async (req, res) => {
    try {
        const result = await query(
            `
                SELECT profile_image
                FROM user_profiles
                WHERE firebase_uid = $1
            `,
            [req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { profileImage: result.rows[0]?.profile_image || '' }
        });
    } catch (error) {
        console.error('Get profile image error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROFILE_IMAGE_FETCH_FAILED',
            message: 'The profile photo could not be retrieved.'
        });
    }
};

const saveProfileImage = async (req, res) => {
    const profileImage = typeof req.body?.profileImage === 'string'
        ? req.body.profileImage
        : null;

    if (
        profileImage === null ||
        profileImage.length > MAX_PROFILE_IMAGE_LENGTH ||
        (profileImage !== '' && !profileImagePattern.test(profileImage))
    ) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROFILE_IMAGE',
            message: 'Upload a valid JPEG profile photo no larger than 350 KB.'
        });
    }

    try {
        if (!profileImage) {
            await query(
                'DELETE FROM user_profiles WHERE firebase_uid = $1',
                [req.firebaseUid]
            );
        } else {
            await query(
                `
                    INSERT INTO user_profiles (firebase_uid, profile_image, updated_at)
                    VALUES ($1, $2, NOW())
                    ON CONFLICT (firebase_uid)
                    DO UPDATE SET
                        profile_image = EXCLUDED.profile_image,
                        updated_at = NOW()
                `,
                [req.firebaseUid, profileImage]
            );
        }

        return res.status(200).json({
            success: true,
            data: { profileImage }
        });
    } catch (error) {
        console.error('Save profile image error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROFILE_IMAGE_SAVE_FAILED',
            message: 'The profile photo could not be saved.'
        });
    }
};

const searchUsers = async (req, res) => {
    const search = typeof req.query.q === 'string'
        ? req.query.q.trim().toLocaleLowerCase()
        : '';

    if (search.length < 2 || search.length > 100) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_USER_SEARCH',
            message: 'Enter between 2 and 100 characters to search users.'
        });
    }

    try {
        const auth = getFirebaseAdmin().auth();
        const users = [];
        let pageToken;

        do {
            const page = await auth.listUsers(1000, pageToken);
            for (const user of page.users) {
                if (user.uid === req.firebaseUid || user.disabled) continue;

                const name = user.displayName || '';
                const email = user.email || '';
                if (!email) continue;
                if (
                    !name.toLocaleLowerCase().includes(search) &&
                    !email.toLocaleLowerCase().includes(search)
                ) continue;

                users.push({
                    firebaseUid: user.uid,
                    name: name || email,
                    email
                });

                if (users.length === 20) break;
            }
            pageToken = users.length === 20 ? undefined : page.pageToken;
        } while (pageToken);

        return res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Search registered users error:', error);
        return res.status(500).json({
            success: false,
            code: 'USER_SEARCH_FAILED',
            message: 'Registered users could not be searched.'
        });
    }
};

module.exports = { getProfileImage, saveProfileImage, searchUsers };
