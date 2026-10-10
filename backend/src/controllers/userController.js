const { query } = require('../config/db');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const MAX_PROFILE_IMAGE_LENGTH = 350_000;
const profileImagePattern = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const profileTones = new Set(['coral', 'teal', 'orange', 'purple', 'blue', 'green']);

const getProfile = async (req, res) => {
    try {
        const result = await query(
            `
                SELECT
                    full_name AS "name",
                    email,
                    phone_country_code AS "phoneCountryCode",
                    phone_number AS "phoneNumber",
                    workspace,
                    role,
                    collaboration_type AS "collaborationType",
                    collaboration_details AS "collaborationDetails",
                    industry,
                    avatar_tone AS tone,
                    status,
                    timezone,
                    updated_at AS "updatedAt"
                FROM user_profiles
                WHERE firebase_uid = $1
            `,
            [req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { profile: result.rows[0] || null }
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        return res.status(500).json({
            success: false,
            code: 'USER_PROFILE_FETCH_FAILED',
            message: 'Your profile could not be retrieved.'
        });
    }
};

const saveProfile = async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const phoneCountryCode = typeof req.body?.phoneCountryCode === 'string' ? req.body.phoneCountryCode.trim() : '';
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const workspace = typeof req.body?.workspace === 'string' ? req.body.workspace.trim() : '';
    const role = typeof req.body?.role === 'string' ? req.body.role.trim() : '';
    const collaborationType = typeof req.body?.collaborationType === 'string' ? req.body.collaborationType.trim() : '';
    const collaborationDetails = typeof req.body?.collaborationDetails === 'string' ? req.body.collaborationDetails.trim() : '';
    const industry = typeof req.body?.industry === 'string' ? req.body.industry.trim() : '';
    const tone = typeof req.body?.tone === 'string' ? req.body.tone : '';
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    const timezone = typeof req.body?.timezone === 'string' ? req.body.timezone : '';
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    let timezoneValid = false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        timezoneValid = true;
    } catch {
        timezoneValid = false;
    }

    if (
        !name || name.length > 120 ||
        !emailValid || email.length > 320 ||
        !/^\+\d{1,4}$/.test(phoneCountryCode) ||
        !phoneNumber || phoneNumber.length > 32 || !/^[\d\s().+-]+$/.test(phoneNumber) ||
        !workspace || workspace.length > 160 ||
        !role || role.length > 120 ||
        !collaborationType || collaborationType.length > 100 ||
        (collaborationType === 'Other' && !collaborationDetails) ||
        collaborationDetails.length > 500 ||
        !industry || industry.length > 120 ||
        !profileTones.has(tone) ||
        status.length > 120 ||
        !timezoneValid
    ) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_USER_PROFILE',
            message: 'Check the required profile fields and try again.'
        });
    }

    try {
        const result = await query(
            `
                INSERT INTO user_profiles (
                    firebase_uid,
                    profile_image,
                    full_name,
                    email,
                    phone_country_code,
                    phone_number,
                    workspace,
                    role,
                    collaboration_type,
                    collaboration_details,
                    industry,
                    avatar_tone,
                    status,
                    timezone,
                    updated_at
                )
                VALUES ($1, '', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
                ON CONFLICT (firebase_uid)
                DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    email = EXCLUDED.email,
                    phone_country_code = EXCLUDED.phone_country_code,
                    phone_number = EXCLUDED.phone_number,
                    workspace = EXCLUDED.workspace,
                    role = EXCLUDED.role,
                    collaboration_type = EXCLUDED.collaboration_type,
                    collaboration_details = EXCLUDED.collaboration_details,
                    industry = EXCLUDED.industry,
                    avatar_tone = EXCLUDED.avatar_tone,
                    status = EXCLUDED.status,
                    timezone = EXCLUDED.timezone,
                    updated_at = NOW()
                RETURNING
                    full_name AS "name",
                    email,
                    phone_country_code AS "phoneCountryCode",
                    phone_number AS "phoneNumber",
                    workspace,
                    role,
                    collaboration_type AS "collaborationType",
                    collaboration_details AS "collaborationDetails",
                    industry,
                    avatar_tone AS tone,
                    status,
                    timezone,
                    updated_at AS "updatedAt"
            `,
            [
                req.firebaseUid,
                name,
                email,
                phoneCountryCode,
                phoneNumber,
                workspace,
                role,
                collaborationType,
                collaborationDetails,
                industry,
                tone,
                status,
                timezone
            ]
        );
        return res.status(200).json({
            success: true,
            data: { profile: result.rows[0] }
        });
    } catch (error) {
        console.error('Save user profile error:', error);
        return res.status(500).json({
            success: false,
            code: 'USER_PROFILE_SAVE_FAILED',
            message: 'Your profile could not be saved.'
        });
    }
};

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

const getProjectMembers = async (req, res) => {
    try {
        const result = await query(
            `
                WITH accessible_projects AS (
                    SELECT p.project_id, p.name, p.creator_firebase_uid,
                           p.creator_email, p.creator_name, p.creator_initials
                    FROM projects p
                    WHERE p.creator_firebase_uid = $1
                       OR EXISTS (
                            SELECT 1
                            FROM project_invitations access_invitation
                            WHERE access_invitation.project_id = p.project_id
                              AND access_invitation.invited_firebase_uid = $1
                              AND access_invitation.status = 'accepted'
                        )
                ),
                invited_members AS (
                    SELECT
                        p.project_id,
                        p.name AS project_name,
                        p.creator_firebase_uid,
                        i.invitation_id,
                        i.invited_firebase_uid AS firebase_uid,
                        i.invited_email AS email,
                        i.invited_name AS name,
                        i.role,
                        CASE WHEN i.status = 'pending' THEN 'Pending' ELSE 'Active' END AS status,
                        ROW_NUMBER() OVER (
                            PARTITION BY p.project_id, i.invited_firebase_uid
                            ORDER BY
                                CASE WHEN i.status = 'accepted' THEN 0 ELSE 1 END,
                                i.created_at DESC
                        ) AS invitation_rank
                    FROM accessible_projects p
                    JOIN project_invitations i
                      ON i.project_id = p.project_id
                     AND (
                        i.status = 'accepted'
                        OR (i.status = 'pending' AND p.creator_firebase_uid = $1)
                     )
                     AND i.invited_firebase_uid IS NOT NULL
                    WHERE i.invited_firebase_uid <> p.creator_firebase_uid
                ),
                project_members AS (
                    SELECT
                        pm.project_id,
                        pm.project_name,
                        pm.creator_firebase_uid,
                        pm.invitation_id,
                        pm.firebase_uid,
                        pm.email,
                        pm.name,
                        pm.role,
                        pm.status
                    FROM invited_members pm
                    WHERE pm.invitation_rank = 1

                    UNION ALL

                    SELECT
                        p.project_id,
                        p.name AS project_name,
                        p.creator_firebase_uid,
                        NULL::uuid AS invitation_id,
                        p.creator_firebase_uid AS firebase_uid,
                        p.creator_email AS email,
                        p.creator_name AS name,
                        'Project Lead' AS role,
                        'Active' AS status
                    FROM accessible_projects p
                )
                SELECT
                    pm.project_id,
                    pm.project_name,
                    pm.creator_firebase_uid,
                    pm.invitation_id,
                    pm.firebase_uid,
                    pm.email,
                    pm.name,
                    pm.role,
                    pm.status,
                    up.profile_image
                FROM project_members pm
                LEFT JOIN user_profiles up
                  ON up.firebase_uid = pm.firebase_uid
                ORDER BY LOWER(pm.project_name), LOWER(pm.name)
            `,
            [req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { members: result.rows }
        });
    } catch (error) {
        console.error('Get project members error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEMBERS_FETCH_FAILED',
            message: 'Project members could not be retrieved.'
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

module.exports = {
    getProfile,
    getProfileImage,
    getProjectMembers,
    saveProfile,
    saveProfileImage,
    searchUsers
};
