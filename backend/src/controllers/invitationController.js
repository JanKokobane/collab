const {
    createHash,
    randomBytes,
    randomUUID
} = require('node:crypto');

const {
    pool,
    query
} = require('../config/db');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const allowedRoles = new Set([
    'Workspace Admin',
    'Product Lead',
    'Designer',
    'Engineer',
    'QA Specialist',
    'Content Strategist',
    'Member'
]);

const frontendUrl = (
    process.env.FRONTEND_URL ||
    process.env.PRODUCTION_FRONTEND_URL ||
    ''
).replace(/\/+$/, '');

const mailerSendApiKey = (
    process.env.MAILERSEND_API_KEY || ''
).trim();

const mailerSendFromEmail = (
    process.env.MAILERSEND_FROM_EMAIL || ''
).trim();

const mailerSendFromName = (
    process.env.MAILERSEND_FROM_NAME ||
    'Collab'
).trim();

const isValidEmail = email =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidNotificationAvatar = value => {
    if (typeof value !== 'string' || value.length > 350_000) {
        return false;
    }

    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
        return true;
    }

    try {
        const url = new URL(value);
        return url.protocol === 'https:' &&
            Boolean(url.hostname) &&
            value.length <= 2048;
    } catch {
        return false;
    }
};

function makeEmailError(
    code,
    message,
    statusCode = 502
) {
    const error = new Error(message);

    error.code = code;
    error.statusCode = statusCode;

    return error;
}

const escapeHtml = value =>
    String(value ?? '').replace(
        /[&<>"']/g,
        char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char])
    );

function validateInvitationEmailConfiguration() {
    const missing = [];

    if (!mailerSendApiKey) {
        missing.push('MAILERSEND_API_KEY');
    }

    if (!mailerSendFromEmail) {
        missing.push('MAILERSEND_FROM_EMAIL');
    }

    if (!frontendUrl) {
        missing.push('FRONTEND_URL');
    }

    if (
        !(process.env.PUBLIC_API_URL || '').trim()
    ) {
        missing.push('PUBLIC_API_URL');
    }

    if (missing.length) {
        const error = new Error(
            `Configure ${missing.join(', ')} in the backend environment.`
        );

        error.code =
            'INVITATION_EMAIL_CONFIG_MISSING';

        error.statusCode = 503;

        throw error;
    }
}

function invitationLinks(token) {
    if (!frontendUrl) {
        throw new Error(
            'FRONTEND_URL must be configured to send project invitations.'
        );
    }

    const apiUrl = (
        process.env.PUBLIC_API_URL || ''
    ).replace(/\/+$/, '');

    if (!apiUrl) {
        throw new Error(
            'PUBLIC_API_URL must be configured for invitation response links.'
        );
    }

    return {
        accept:
            `${frontendUrl}/auth/auth.html?mode=signin&return=` +
            encodeURIComponent(
                `../dashboard/dashboard.html?invite=${token}`
            ),

        decline:
            `${apiUrl}/api/invitations/decline?token=` +
            encodeURIComponent(token)
    };
}

async function sendInvitationEmail({
    invitation,
    project,
    inviterName,
    token
}) {
    if (!mailerSendApiKey) {
        throw makeEmailError(
            'MAILERSEND_API_KEY_NOT_CONFIGURED',
            'MAILERSEND_API_KEY is not configured.',
            503
        );
    }

    if (!mailerSendFromEmail) {
        throw makeEmailError(
            'MAILERSEND_FROM_EMAIL_NOT_CONFIGURED',
            'MAILERSEND_FROM_EMAIL is not configured.',
            503
        );
    }

    if (!isValidEmail(invitation.invited_email)) {
        throw makeEmailError(
            'INVALID_INVITEE',
            'The invitation recipient email address is invalid.',
            400
        );
    }

    const links = invitationLinks(token);

    const name = escapeHtml(
        invitation.invited_name
    );

    const projectName = escapeHtml(
        project.name
    );

    const projectType = escapeHtml(
        project.project_type ||
        'Collaboration project'
    );

    const timeSpan = escapeHtml(
        project.time_span ||
        'Ongoing'
    );

    const description = escapeHtml(
        project.description ||
        'A shared space to plan and track work.'
    );

    const inviter = escapeHtml(
        inviterName ||
        'A Collab project owner'
    );

    const role = escapeHtml(
        invitation.role
    );

    const logoUrl =
        `${frontendUrl}/images/logo.png`;

    const accent = ({
        yellow: '#EAB308',
        green: '#2E8B57',
        blue: '#4A90E2',
        purple: '#7C3AED',
        coral: '#E07A5F',
        orange: '#F97316',
        rose: '#E11D48'
    })[project.color] || '#EAB308';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >
    <title>Collab Project Invitation</title>
</head>
<body
    style="
        margin:0;
        padding:0;
        background:#f4f6f8;
        font-family:Arial,Helvetica,sans-serif;
        color:#182230;
    "
>
    <div
        style="
            max-width:640px;
            margin:40px auto;
            background:#ffffff;
            border:1px solid #e4e8ee;
            border-radius:16px;
            overflow:hidden;
        "
    >
        <div
            style="
                padding:24px 32px;
                border-bottom:1px solid #edf0f4;
            "
        >
            <img
                src="${escapeHtml(logoUrl)}"
                alt="Collab"
                style="
                    display:block;
                    max-width:142px;
                    max-height:42px;
                "
            >
        </div>

        <div style="padding:32px">
            <p
                style="
                    margin:0 0 10px;
                    color:#718096;
                    font-size:12px;
                    font-weight:bold;
                    letter-spacing:1px;
                "
            >
                PROJECT INVITATION
            </p>

            <h1
                style="
                    margin:0 0 16px;
                    font-size:26px;
                    line-height:1.25;
                "
            >
                You're invited to collaborate
            </h1>

            <p
                style="
                    margin:0;
                    font-size:15px;
                    line-height:1.65;
                    color:#475467;
                "
            >
                Hi ${name},
                ${inviter} invited you to join
                <strong>${projectName}</strong>
                on Collab.
            </p>

            <div
                style="
                    margin:24px 0;
                    padding:20px;
                    border:1px solid #e4e8ee;
                    border-left:4px solid ${accent};
                    border-radius:10px;
                "
            >
                <h2
                    style="
                        margin:0 0 12px;
                        font-size:19px;
                    "
                >
                    ${projectName}
                </h2>

                <p
                    style="
                        margin:5px 0;
                        color:#475467;
                    "
                >
                    <strong>Project type:</strong>
                    ${projectType}
                </p>

                <p
                    style="
                        margin:5px 0;
                        color:#475467;
                    "
                >
                    <strong>Timeline:</strong>
                    ${timeSpan}
                </p>

                <p
                    style="
                        margin:12px 0 0;
                        color:#475467;
                        line-height:1.55;
                    "
                >
                    ${description}
                </p>

                <p
                    style="
                        margin:14px 0 0;
                        color:#475467;
                    "
                >
                    <strong>Your listed role:</strong>
                    ${role}
                </p>
            </div>

            <p
                style="
                    font-size:14px;
                    line-height:1.6;
                    color:#475467;
                "
            >
                Accept to sign in or create your Collab account.
                You will only be able to view projects you have
                been invited to. Project editing stays with its
                creator.
            </p>

            <p style="margin:28px 0">
                <a
                    href="${escapeHtml(links.accept)}"
                    style="
                        display:inline-block;
                        background:${accent};
                        color:#182230;
                        text-decoration:none;
                        font-weight:bold;
                        padding:13px 22px;
                        border-radius:8px;
                    "
                >
                    Accept invitation
                </a>
            </p>

            <p
                style="
                    font-size:12px;
                    line-height:1.6;
                    color:#718096;
                "
            >
                If you don't want to join,
                <a
                    href="${escapeHtml(links.decline)}"
                    style="color:#475467;"
                >
                    decline this invitation
                </a>.
            </p>
        </div>

        <div
            style="
                padding:18px 32px;
                background:#f9fafb;
                color:#8a94a3;
                font-size:11px;
            "
        >
            Collab · Focused work, together.
        </div>
    </div>
</body>
</html>
`.trim();

    const text = `
You're invited to collaborate on Collab.

Hi ${invitation.invited_name},

${inviterName || 'A Collab project owner'} invited you to join
${project.name} on Collab.

Project type: ${project.project_type || 'Collaboration project'}

Timeline: ${project.time_span || 'Ongoing'}

Your listed role: ${invitation.role}

${project.description || 'A shared space to plan and track work.'}

Accept your invitation:

${links.accept}

Decline this invitation:

${links.decline}

Collab · Focused work, together.
`.trim();

    const subject =
        `${inviterName || 'Someone'} invited you to ` +
        `${project.name} on Collab`;

    console.log(
        `Starting MailerSend invitation delivery to ${invitation.invited_email}.`
    );

    const sendStartedAt = Date.now();

    try {
        const response = await fetch(
            'https://api.mailersend.com/v1/email',
            {
                method: 'POST',
                headers: {
                    'Authorization':
                        `Bearer ${mailerSendApiKey}`,
                    'Content-Type':
                        'application/json',
                    'Accept':
                        'application/json'
                },
                body: JSON.stringify({
                    from: {
                        email: mailerSendFromEmail,
                        name: mailerSendFromName
                    },
                    to: [
                        {
                            email:
                                invitation.invited_email,
                            name:
                                invitation.invited_name
                        }
                    ],
                    subject,
                    text,
                    html
                })
            }
        );

        const responseText =
            await response.text();

        let responseData = null;

        if (responseText) {
            try {
                responseData =
                    JSON.parse(responseText);
            } catch {
                responseData = {
                    message: responseText
                };
            }
        }

        if (!response.ok) {
            console.error(
                'MailerSend invitation delivery failed:',
                {
                    status: response.status,
                    response: responseData
                }
            );

            let message =
                responseData?.message ||
                'MailerSend could not send the invitation email.';

            if (
                response.status === 401 ||
                response.status === 403 ||
                /api key|unauthorized|authentication|token/i.test(
                    message
                )
            ) {
                message =
                    'MailerSend rejected the API key. Check MAILERSEND_API_KEY in Render.';
            } else if (
                /sender|from|domain/i.test(
                    message
                )
            ) {
                message =
                    `MailerSend rejected the sender "${mailerSendFromEmail}". ` +
                    'Check the verified sender/domain in your MailerSend account.';
            } else if (
                response.status === 422
            ) {
                message =
                    `MailerSend rejected the email request: ${message}`;
            }

            throw makeEmailError(
                'MAILERSEND_SEND_FAILED',
                `Could not send the invitation email through MailerSend: ${message}`,
                502
            );
        }

        const messageId =
            response.headers.get(
                'x-message-id'
            ) ||
            response.headers.get(
                'x-message-id'.toLowerCase()
            ) ||
            responseData?.message_id ||
            null;

        console.log(
            `Invitation email accepted by MailerSend for ` +
            `${invitation.invited_email}. ` +
            `Message ID: ${messageId || 'unknown'}. ` +
            `Delivery time: ${Date.now() - sendStartedAt}ms`
        );

        return {
            success: true,
            emailId: messageId,
            recipient:
                invitation.invited_email
        };

    } catch (error) {
        if (
            error?.code ===
            'MAILERSEND_SEND_FAILED'
        ) {
            throw error;
        }

        console.error(
            'MailerSend request failed:',
            error
        );

        throw makeEmailError(
            'MAILERSEND_NETWORK_FAILED',
            `Could not send the invitation email through MailerSend: ${error.message}`,
            502
        );
    }
};

/*
 * CREATE / RESEND INVITATIONS
 */

const createInvitations = async (
    req,
    res
) => {
    let projectIds = [];

    if (
        typeof req.body?.projectId === 'string' &&
        req.body.projectId.trim()
    ) {
        projectIds = [
            req.body.projectId.trim()
        ];
    } else if (
        Array.isArray(req.body?.project_ids)
    ) {
        projectIds =
            req.body.project_ids
                .filter(
                    id =>
                        typeof id === 'string' &&
                        id.trim()
                )
                .map(
                    id => id.trim()
                );
    }

    projectIds = [
        ...new Set(projectIds)
    ];

    let invitees = [];

    if (
        Array.isArray(req.body?.invitations)
    ) {
        invitees =
            req.body.invitations;
    } else if (
        req.body?.email ||
        req.body?.name ||
        req.body?.role
    ) {
        invitees = [
            {
                email:
                    req.body.email,
                name:
                    req.body.name,
                role:
                    req.body.role
            }
        ];
    }

    if (
        !projectIds.length ||
        projectIds.length > 50
    ) {
        return res.status(400).json({
            success: false,
            code:
                'INVALID_PROJECT_SELECTION',
            message:
                'Choose at least one project you created.'
        });
    }

    if (
        !invitees.length ||
        invitees.length > 50
    ) {
        return res.status(400).json({
            success: false,
            code:
                'INVALID_INVITEE',
            message:
                'Provide at least one email address and name.'
        });
    }

    const normalizedInvitees = [];

    for (
        const invitee of invitees
    ) {
        const email =
            typeof invitee?.email === 'string'
                ? invitee.email
                    .trim()
                    .toLowerCase()
                : '';

        const name =
            typeof invitee?.name === 'string'
                ? invitee.name.trim()
                : '';

        const role =
            typeof invitee?.role === 'string'
                ? invitee.role.trim()
                : '';

        if (
            !isValidEmail(email) ||
            email.length > 320 ||
            !name ||
            name.length > 255
        ) {
            return res.status(400).json({
                success: false,
                code:
                    'INVALID_INVITEE',
                message:
                    'A valid email address and name are required for every invitation.'
            });
        }

        if (
            !allowedRoles.has(role)
        ) {
            return res.status(400).json({
                success: false,
                code:
                    'INVALID_INVITEE_ROLE',
                message:
                    `Choose a valid project role for ${email}.`
            });
        }

        normalizedInvitees.push({
            email,
            name,
            role
        });
    }

    const uniqueInvitees = [
        ...new Map(
            normalizedInvitees.map(
                invitee => [
                    `${invitee.email}|${invitee.role}`,
                    invitee
                ]
            )
        ).values()
    ];

    try {
        validateInvitationEmailConfiguration();

        invitationLinks(
            'configuration-check'
        );

    } catch (error) {
        console.error(
            'Invitation email configuration error:',
            error.message
        );

        return res.status(
            error.statusCode || 503
        ).json({
            success: false,
            code:
                error.code ||
                'INVITATION_EMAIL_CONFIG_INVALID',
            message:
                error.message
        });
    }

    const client =
        await pool.connect();

    const created = [];

    try {
        await client.query(
            'BEGIN'
        );

        const ownedProjects =
            await client.query(
                `
                    SELECT
                        project_id,
                        name,
                        project_type,
                        time_span,
                        description,
                        color,
                        creator_firebase_uid,
                        creator_name
                    FROM projects
                    WHERE project_id = ANY($1::text[])
                      AND creator_firebase_uid = $2
                    FOR UPDATE
                `,
                [
                    projectIds,
                    req.firebaseUid
                ]
            );

        if (
            ownedProjects.rowCount !==
            projectIds.length
        ) {
            await client.query(
                'ROLLBACK'
            );

            return res.status(403).json({
                success: false,
                code:
                    'PROJECT_INVITE_FORBIDDEN',
                message:
                    'You may invite collaborators only to projects you created.'
            });
        }

        for (
            const project
            of ownedProjects.rows
        ) {
            for (
                const invitee
                of uniqueInvitees
            ) {
                const alreadyAccepted =
                    await client.query(
                        `
                            SELECT 1
                            FROM project_invitations
                            WHERE project_id = $1
                              AND invited_email = $2
                              AND status = 'accepted'
                            LIMIT 1
                        `,
                        [
                            project.project_id,
                            invitee.email
                        ]
                    );

                if (
                    alreadyAccepted.rowCount
                ) {
                    await client.query(
                        'ROLLBACK'
                    );

                    return res.status(409).json({
                        success: false,
                        code:
                            'INVITATION_ALREADY_ACCEPTED',
                        message:
                            `${invitee.email} already has access to ${project.name}.`
                    });
                }

                const token =
                    randomBytes(32)
                        .toString('base64url');

                const tokenHash =
                    createHash('sha256')
                        .update(token)
                        .digest('hex');

                const existingInvitation =
                    await client.query(
                        `
                            SELECT
                                id,
                                invitation_id,
                                project_id,
                                invited_email,
                                invited_name,
                                role,
                                status,
                                created_at,
                                expires_at
                            FROM project_invitations
                            WHERE project_id = $1
                              AND invited_email = $2
                              AND status IN ('pending', 'delivery_failed')
                            ORDER BY created_at DESC
                            LIMIT 1
                            FOR UPDATE
                        `,
                        [
                            project.project_id,
                            invitee.email
                        ]
                    );

                let invitation;

                if (
                    existingInvitation.rowCount
                ) {
                    const updated =
                        await client.query(
                            `
                                UPDATE project_invitations
                                SET
                                    invited_name = $1,
                                    role = $2,
                                    token_hash = $3,
                                    status = 'pending',
                                    expires_at = NOW() + INTERVAL '14 days',
                                    responded_at = NULL
                                WHERE invitation_id = $4::uuid
                                RETURNING
                                    id,
                                    invitation_id,
                                    project_id,
                                    invited_email,
                                    invited_name,
                                    role,
                                    status,
                                    created_at,
                                    expires_at
                            `,
                            [
                                invitee.name,
                                invitee.role,
                                tokenHash,
                                existingInvitation
                                    .rows[0]
                                    .invitation_id
                            ]
                        );

                    invitation =
                        updated.rows[0];

                    console.log(
                        `Resending existing invitation ` +
                        `${invitation.invitation_id} ` +
                        `to ${invitation.invited_email}.`
                    );

                } else {
                    const invitationId =
                        randomUUID();

                    const inserted =
                        await client.query(
                            `
                                INSERT INTO project_invitations (
                                    invitation_id,
                                    project_id,
                                    invited_by_firebase_uid,
                                    invited_email,
                                    invited_name,
                                    role,
                                    token_hash,
                                    expires_at
                                )
                                VALUES (
                                    $1,
                                    $2,
                                    $3,
                                    $4,
                                    $5,
                                    $6,
                                    $7,
                                    NOW() + INTERVAL '14 days'
                                )
                                RETURNING
                                    id,
                                    invitation_id,
                                    project_id,
                                    invited_email,
                                    invited_name,
                                    role,
                                    status,
                                    created_at,
                                    expires_at
                            `,
                            [
                                invitationId,
                                project.project_id,
                                req.firebaseUid,
                                invitee.email,
                                invitee.name,
                                invitee.role,
                                tokenHash
                            ]
                        );

                    invitation =
                        inserted.rows[0];

                    console.log(
                        `Created new invitation ` +
                        `${invitation.invitation_id} ` +
                        `for ${invitation.invited_email}.`
                    );
                }

                created.push({
                    invitation,
                    project,
                    token
                });
            }
        }

        await client.query(
            'COMMIT'
        );

    } catch (error) {
        await client.query(
            'ROLLBACK'
        ).catch(
            rollbackError => {
                console.error(
                    'Invitation transaction rollback error:',
                    rollbackError
                );
            }
        );

        if (
            error.code === '23505'
        ) {
            console.error(
                'Invitation unique constraint violation:',
                error.detail || error.message
            );

            return res.status(409).json({
                success: false,
                code:
                    'INVITATION_ALREADY_EXISTS',
                message:
                    'An invitation for this email already exists for the selected project.'
            });
        }

        console.error(
            'Create/resend invitation error:',
            error
        );

        return res.status(500).json({
            success: false,
            code:
                'INVITATION_CREATE_FAILED',
            message:
                'The invitation could not be created.'
        });

    } finally {
        client.release();
    }

    const delivered = [];
    const failed = [];

    for (
        const item
        of created
    ) {
        try {
            await sendInvitationEmail({
                invitation:
                    item.invitation,
                project:
                    item.project,
                inviterName:
                    item.project.creator_name ||
                    req.firebaseUser?.name ||
                    req.firebaseEmail,
                token:
                    item.token
            });

            delivered.push(
                item.invitation
            );

        } catch (error) {
            failed.push({
                invitation:
                    item.invitation,
                error
            });
        }
    }

    if (
        failed.length
    ) {
        const failedIds =
            failed.map(
                item =>
                    item.invitation
                        .invitation_id
            );

        await query(
            `
                UPDATE project_invitations
                SET status = 'delivery_failed'
                WHERE invitation_id = ANY($1::uuid[])
                  AND status = 'pending'
            `,
            [
                failedIds
            ]
        ).catch(
            error => {
                console.error(
                    'Failed to update invitation delivery status:',
                    error
                );
            }
        );
    }

    if (
        !delivered.length
    ) {
        const firstError =
            failed[0]?.error;

        console.error(
            'Invitation email error:',
            firstError
        );

        return res.status(
            firstError?.statusCode || 502
        ).json({
            success: false,
            code:
                firstError?.code ||
                'INVITATION_EMAIL_FAILED',
            message:
                firstError?.message ||
                'Invitation email could not be delivered.'
        });
    }

    if (
        failed.length
    ) {
        return res.status(207).json({
            success: true,
            message:
                'Some invitation emails were sent; others could not be delivered.',
            data: {
                invitations:
                    delivered,
                failedCount:
                    failed.length,
                failed:
                    failed.map(
                        item => ({
                            email:
                                item.invitation
                                    .invited_email,
                            code:
                                item.error?.code ||
                                'INVITATION_EMAIL_FAILED',
                            message:
                                item.error?.message ||
                                'Invitation email could not be delivered.'
                        })
                    )
            }
        });
    }

    return res.status(201).json({
        success: true,
        message:
            'Invitation email sent.',
        data: {
            invitations:
                delivered
        }
    });
};

const listProjectInvitations = async (
    req,
    res
) => {
    try {
        const project =
            await query(
                `
                    SELECT 1
                    FROM projects
                    WHERE project_id = $1
                      AND creator_firebase_uid = $2
                `,
                [
                    req.params.projectId,
                    req.firebaseUid
                ]
            );

        if (!project.rowCount) {
            return res.status(404).json({
                success: false,
                code:
                    'PROJECT_NOT_FOUND',
                message:
                    'Project not found.'
            });
        }

        const result =
            await query(
                `
                    SELECT
                        i.id,
                        i.invitation_id,
                        i.project_id,
                        i.invited_email,
                        i.invited_name,
                        i.role,
                        i.status,
                        i.created_at,
                        i.expires_at,
                        i.responded_at
                    FROM project_invitations i
                    WHERE i.project_id = $1
                    ORDER BY i.created_at DESC
                `,
                [
                    req.params.projectId
                ]
            );

        return res.status(200).json({
            success: true,
            data: {
                invitations:
                    result.rows
            }
        });

    } catch (error) {
        console.error(
            'List project invitations error:',
            error
        );

        return res.status(500).json({
            success: false,
            code:
                'INVITATIONS_FETCH_FAILED',
            message:
                'Project invitations could not be retrieved.'
        });
    }
};

const revokeInvitation = async (
    req,
    res
) => {
    try {
        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                req.params.invitationId
            )
        ) {
            return res.status(400).json({
                success: false,
                code:
                    'INVALID_INVITATION_ID',
                message:
                    'Invitation ID is invalid.'
            });
        }

        const result =
            await query(
                `
                    UPDATE project_invitations i
                    SET status = 'revoked'
                    FROM projects p
                    WHERE i.invitation_id = $1::uuid
                      AND i.project_id = p.project_id
                      AND p.creator_firebase_uid = $2
                      AND i.status IN ('pending', 'accepted')
                    RETURNING
                        i.invitation_id,
                        i.status
                `,
                [
                    req.params.invitationId,
                    req.firebaseUid
                ]
            );

        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code:
                    'PENDING_INVITATION_NOT_FOUND',
                message:
                    'Pending invitation not found.'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                invitation:
                    result.rows[0]
            }
        });

    } catch (error) {
        console.error(
            'Revoke invitation error:',
            error
        );

        return res.status(500).json({
            success: false,
            code:
                'INVITATION_REVOKE_FAILED',
            message:
                'The invitation could not be revoked.'
        });
    }
};

const acceptInvitation = async (
    req,
    res
) => {
    const invitationId =
        typeof req.body?.invitationId === 'string'
            ? req.body.invitationId.trim()
            : '';

    if (invitationId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_INVITATION_ID',
                message: 'Invitation ID is invalid.'
            });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(
                `
                    UPDATE project_invitations i
                    SET status = 'accepted', responded_at = NOW()
                    FROM projects p
                    WHERE i.invitation_id = $1::uuid
                      AND i.invited_firebase_uid = $2
                      AND i.status = 'pending'
                      AND i.expires_at > NOW()
                      AND i.project_id = p.project_id
                    RETURNING i.project_id, i.invited_by_firebase_uid,
                              i.invited_name, i.role, p.name AS project_name
                `,
                [invitationId, req.firebaseUid]
            );

            if (!result.rowCount) {
                const alreadyAccepted = await client.query(
                    `
                        SELECT i.project_id, i.role
                        FROM project_invitations i
                        WHERE i.invitation_id = $1::uuid
                          AND i.invited_firebase_uid = $2
                          AND i.status = 'accepted'
                    `,
                    [invitationId, req.firebaseUid]
                );
                if (alreadyAccepted.rowCount) {
                    await client.query('COMMIT');
                    return res.status(200).json({
                        success: true,
                        message: 'Invitation was already accepted.',
                        data: alreadyAccepted.rows[0]
                    });
                }
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    code: 'INVITATION_NOT_FOUND',
                    message: 'This invitation is invalid, expired, already used, or belongs to another user.'
                });
            }

            const invitation = result.rows[0];
            await client.query(
                `
                    UPDATE notifications
                    SET is_read = TRUE
                    WHERE invitation_id = $1::uuid
                      AND recipient_firebase_uid = $2
                `,
                [invitationId, req.firebaseUid]
            );
            await client.query(
                `
                    INSERT INTO notifications (
                        recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                    )
                    VALUES ($1, $2, 'invitation_accepted', 'Invitation accepted', $3, $4, 'green-bg')
                `,
                [
                    invitation.invited_by_firebase_uid,
                    invitation.project_id,
                    `${invitation.invited_name} accepted the invitation to "${invitation.project_name}".`,
                    invitation.invited_name
                        .split(/\s+/)
                        .map(part => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                ]
            );
            await client.query('COMMIT');
            return res.status(200).json({
                success: true,
                message: 'Invitation accepted.',
                data: {
                    projectId: invitation.project_id,
                    role: invitation.role
                }
            });
        } catch (error) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('In-app invitation acceptance rollback failed:', rollbackError);
            });
            console.error('Accept in-app invitation error:', error);
            return res.status(500).json({
                success: false,
                code: 'INVITATION_ACCEPT_FAILED',
                message: 'The invitation could not be accepted.'
            });
        } finally {
            client.release();
        }
    }

    const token =
        typeof req.body?.token === 'string'
            ? req.body.token.trim()
            : '';

    const email =
        typeof req.firebaseEmail === 'string'
            ? req.firebaseEmail
                .trim()
                .toLowerCase()
            : '';

    if (!token || !email) {
        return res.status(400).json({
            success: false,
            code:
                'INVITATION_ACCEPTANCE_INVALID',
            message:
                'A valid invitation and signed-in email are required.'
        });
    }

    const tokenHash =
        createHash('sha256')
            .update(token)
            .digest('hex');

    const client =
        await pool.connect();

    try {
        await client.query(
            'BEGIN'
        );

        const result =
            await client.query(
                `
                    UPDATE project_invitations
                    SET
                        status = 'accepted',
                        invited_firebase_uid = $2,
                        responded_at = NOW()
                    FROM projects p
                    WHERE project_invitations.token_hash = $1
                      AND project_invitations.invited_email = $3
                      AND project_invitations.status = 'pending'
                      AND project_invitations.expires_at > NOW()
                      AND project_invitations.project_id = p.project_id
                    RETURNING
                        project_invitations.id,
                        project_invitations.project_id,
                        project_invitations.invited_by_firebase_uid,
                        project_invitations.invited_email,
                        project_invitations.invited_name,
                        project_invitations.role,
                        p.name AS project_name
                `,
                [
                    tokenHash,
                    req.firebaseUid,
                    email
                ]
            );

        if (!result.rowCount) {
            const previousAcceptance =
                await client.query(
                    `
                        SELECT
                            project_id,
                            role
                        FROM project_invitations
                        WHERE token_hash = $1
                          AND invited_email = $2
                          AND invited_firebase_uid = $3
                          AND status = 'accepted'
                    `,
                    [
                        tokenHash,
                        email,
                        req.firebaseUid
                    ]
                );

            if (
                previousAcceptance.rowCount
            ) {
                await client.query(
                    'COMMIT'
                );

                return res.status(200).json({
                    success: true,
                    message:
                        'Invitation was already accepted.',
                    data: {
                        projectId:
                            previousAcceptance
                                .rows[0]
                                .project_id,
                        role:
                            previousAcceptance
                                .rows[0]
                                .role
                    }
                });
            }

            await client.query(
                'ROLLBACK'
            );

            return res.status(404).json({
                success: false,
                code:
                    'INVITATION_NOT_FOUND',
                message:
                    'This invitation is invalid, expired, already used, or belongs to another email address.'
            });
        }

        const invitation =
            result.rows[0];

        await client.query(
            `
                INSERT INTO notifications (
                    recipient_firebase_uid,
                    project_id,
                    type,
                    title,
                    detail,
                    avatar,
                    tone_class
                )
                VALUES (
                    $1,
                    $2,
                    'invitation_accepted',
                    'Invitation accepted',
                    $3,
                    $4,
                    'green-bg'
                )
            `,
            [
                invitation
                    .invited_by_firebase_uid,

                invitation
                    .project_id,

                `${invitation.invited_name} accepted the invitation to "${invitation.project_name}".`,

                invitation
                    .invited_name
                    .split(/\s+/)
                    .map(
                        part => part[0]
                    )
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
            ]
        );

        await client.query(
            'COMMIT'
        );

        return res.status(200).json({
            success: true,
            message:
                'Invitation accepted.',
            data: {
                projectId:
                    invitation.project_id,
                role:
                    invitation.role
            }
        });

    } catch (error) {
        await client.query(
            'ROLLBACK'
        ).catch(
            rollbackError => {
                console.error(
                    'Invitation acceptance rollback error:',
                    rollbackError
                );
            }
        );

        console.error(
            'Accept invitation error:',
            error
        );

        return res.status(500).json({
            success: false,
            code:
                'INVITATION_ACCEPT_FAILED',
            message:
                'The invitation could not be accepted.'
        });

    } finally {
        client.release();
    }
};

const showDeclineConfirmation = async (
    req,
    res
) => {
    const token =
        typeof req.query.token === 'string'
            ? req.query.token.trim()
            : '';

    if (!token) {
        return res
            .status(400)
            .send(
                'This invitation link is invalid.'
            );
    }

    const tokenHash =
        createHash('sha256')
            .update(token)
            .digest('hex');

    try {
        const result =
            await query(
                `
                    SELECT
                        i.invited_name,
                        p.name AS project_name
                    FROM project_invitations i
                    JOIN projects p
                        ON p.project_id = i.project_id
                    WHERE i.token_hash = $1
                      AND i.status = 'pending'
                      AND i.expires_at > NOW()
                `,
                [
                    tokenHash
                ]
            );

        if (!result.rowCount) {
            return res
                .status(404)
                .send(
                    'This invitation is invalid, expired, or already used.'
                );
        }

        const invitation =
            result.rows[0];

        const name =
            escapeHtml(
                invitation.invited_name
            );

        const projectName =
            escapeHtml(
                invitation.project_name
            );

        const logoUrl =
            `${frontendUrl}/images/logo.png`;

        return res
            .status(200)
            .type('html')
            .send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta
        name="viewport"
        content="width=device-width,initial-scale=1"
    >
    <title>Decline Collab invitation</title>
</head>

<body
    style="
        margin:0;
        padding:40px 20px;
        background:#f4f6f8;
        font-family:Arial,Helvetica,sans-serif;
    "
>
    <main
        style="
            max-width:560px;
            margin:0 auto;
            background:#fff;
            border:1px solid #e4e8ee;
            border-radius:16px;
            padding:32px;
        "
    >
        <img
            src="${escapeHtml(logoUrl)}"
            alt="Collab"
            style="
                max-width:142px;
                max-height:42px;
            "
        >

        <p
            style="
                margin:28px 0 8px;
                color:#718096;
                font-size:12px;
                font-weight:bold;
                letter-spacing:1px;
            "
        >
            PROJECT INVITATION
        </p>

        <h1
            style="font-size:24px"
        >
            Decline this invitation?
        </h1>

        <p
            style="
                color:#475467;
                line-height:1.6;
            "
        >
            Hi ${name}, confirm if you do not
            want to join
            <strong>${projectName}</strong>
            on Collab.
        </p>

        <form
            method="post"
            action="/api/invitations/decline"
        >
            <input
                type="hidden"
                name="token"
                value="${escapeHtml(token)}"
            >

            <button
                type="submit"
                style="
                    margin-top:12px;
                    background:#eab308;
                    color:#182230;
                    border:0;
                    border-radius:8px;
                    padding:13px 20px;
                    font-weight:bold;
                    cursor:pointer;
                "
            >
                Confirm decline
            </button>
        </form>
    </main>
</body>
</html>
            `);

    } catch (error) {
        console.error(
            'Show invitation decline confirmation error:',
            error
        );

        return res
            .status(500)
            .send(
                'The invitation could not be loaded.'
            );
    }
};

const declineInvitation = async (
    req,
    res
) => {
    const token =
        typeof req.body?.token === 'string'
            ? req.body.token.trim()
            : '';

    if (!token || !frontendUrl) {
        return res
            .status(400)
            .send(
                'This invitation link is invalid.'
            );
    }

    const tokenHash =
        createHash('sha256')
            .update(token)
            .digest('hex');

    const client =
        await pool.connect();

    try {
        await client.query(
            'BEGIN'
        );

        const result =
            await client.query(
                `
                    UPDATE project_invitations i
                    SET
                        status = 'declined',
                        responded_at = NOW()
                    FROM projects p
                    WHERE i.token_hash = $1
                      AND i.project_id = p.project_id
                      AND i.status = 'pending'
                      AND i.expires_at > NOW()
                    RETURNING
                        i.project_id,
                        i.invited_by_firebase_uid,
                        i.invited_name,
                        p.name AS project_name
                `,
                [
                    tokenHash
                ]
            );

        if (!result.rowCount) {
            await client.query(
                'ROLLBACK'
            );

            return res
                .status(404)
                .send(
                    'This invitation is invalid, expired, or already used.'
                );
        }

        const invitation =
            result.rows[0];

        await client.query(
            `
                INSERT INTO notifications (
                    recipient_firebase_uid,
                    project_id,
                    type,
                    title,
                    detail,
                    avatar,
                    tone_class
                )
                VALUES (
                    $1,
                    $2,
                    'invitation_declined',
                    'Invitation declined',
                    $3,
                    $4,
                    'coral-bg'
                )
            `,
            [
                invitation
                    .invited_by_firebase_uid,

                invitation
                    .project_id,

                `${invitation.invited_name} declined the invitation to "${invitation.project_name}".`,

                invitation
                    .invited_name
                    .split(/\s+/)
                    .map(
                        part => part[0]
                    )
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
            ]
        );

        await client.query(
            'COMMIT'
        );

        return res.redirect(
            `${frontendUrl}/auth/auth.html?invitation=declined`
        );

    } catch (error) {
        await client.query(
            'ROLLBACK'
        ).catch(
            rollbackError => {
                console.error(
                    'Invitation decline rollback error:',
                    rollbackError
                );
            }
        );

        console.error(
            'Decline invitation error:',
            error
        );

        return res
            .status(500)
            .send(
                'The invitation response could not be saved.'
            );

    } finally {
        client.release();
    }
};

const declineInAppInvitation = async (
    req,
    res
) => {
    const invitationId =
        typeof req.body?.invitationId === 'string'
            ? req.body.invitationId.trim()
            : '';

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_INVITATION_ID',
            message: 'Invitation ID is invalid.'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `
                UPDATE project_invitations i
                SET status = 'declined', responded_at = NOW()
                FROM projects p
                WHERE i.invitation_id = $1::uuid
                  AND i.invited_firebase_uid = $2
                  AND i.status = 'pending'
                  AND i.expires_at > NOW()
                  AND i.project_id = p.project_id
                RETURNING i.project_id, i.invited_by_firebase_uid,
                          i.invited_name, p.name AS project_name
            `,
            [invitationId, req.firebaseUid]
        );

        if (!result.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'INVITATION_NOT_FOUND',
                message: 'This invitation is invalid, expired, already used, or belongs to another user.'
            });
        }

        const invitation = result.rows[0];
        await client.query(
            `
                UPDATE notifications
                SET is_read = TRUE
                WHERE invitation_id = $1::uuid
                  AND recipient_firebase_uid = $2
            `,
            [invitationId, req.firebaseUid]
        );
        await client.query(
            `
                INSERT INTO notifications (
                    recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                )
                VALUES ($1, $2, 'invitation_declined', 'Invitation declined', $3, $4, 'coral-bg')
            `,
            [
                invitation.invited_by_firebase_uid,
                invitation.project_id,
                `${invitation.invited_name} declined the invitation to "${invitation.project_name}".`,
                invitation.invited_name
                    .split(/\s+/)
                    .map(part => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()
            ]
        );
        await client.query('COMMIT');
        return res.status(200).json({
            success: true,
            message: 'Invitation declined.'
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('In-app invitation decline rollback failed:', rollbackError);
        });
        console.error('Decline in-app invitation error:', error);
        return res.status(500).json({
            success: false,
            code: 'INVITATION_DECLINE_FAILED',
            message: 'The invitation could not be declined.'
        });
    } finally {
        client.release();
    }
};

const createInAppInvitations = async (
    req,
    res
) => {
    const projectIds = [
        ...new Set(
            (
                Array.isArray(req.body?.project_ids)
                    ? req.body.project_ids
                    : [req.body?.projectId]
            )
                .filter(id => typeof id === 'string' && id.trim())
                .map(id => id.trim())
        )
    ];
    const requestedUsers = Array.isArray(req.body?.users)
        ? req.body.users
        : Array.isArray(req.body?.selectedUsers)
            ? req.body.selectedUsers
            : [];
    const requestedUids = [
        ...(Array.isArray(req.body?.firebaseUids) ? req.body.firebaseUids : []),
        ...(Array.isArray(req.body?.firebase_uids) ? req.body.firebase_uids : []),
        req.body?.firebaseUid,
        req.body?.firebase_uid
    ];
    const requestedEmails = [
        ...(Array.isArray(req.body?.emails) ? req.body.emails : []),
        ...(Array.isArray(req.body?.inviteeEmails) ? req.body.inviteeEmails : []),
        req.body?.email
    ];
    const inviteeInputs = [
        ...requestedUsers.map(user => typeof user === 'string'
            ? { firebaseUid: user }
            : {
                firebaseUid: user?.firebaseUid || user?.firebase_uid || user?.uid,
                email: user?.email
            }),
        ...requestedUids.map(firebaseUid => ({ firebaseUid })),
        ...requestedEmails.map(email => ({ email }))
    ].map(user => ({
        firebaseUid: typeof user.firebaseUid === 'string' ? user.firebaseUid.trim() : '',
        email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : ''
    })).filter(user => user.firebaseUid || user.email);
    const role =
        typeof req.body?.role === 'string'
            ? req.body.role.trim()
            : '';
    const inviterAvatar =
        typeof req.body?.inviterAvatar === 'string'
            ? req.body.inviterAvatar.trim()
            : '';

    if (inviterAvatar && !isValidNotificationAvatar(inviterAvatar)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROFILE_PHOTO',
            message: 'The inviter profile photo is invalid or too large.'
        });
    }

    if (!projectIds.length || projectIds.length > 50) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_SELECTION',
            message: 'Choose at least one project you created.'
        });
    }

    if (!inviteeInputs.length || inviteeInputs.length > 50) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_INVITEE_SELECTION',
            message: 'Select between 1 and 50 users from the registered-user search results.'
        });
    }

    if (!allowedRoles.has(role)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_INVITEE_ROLE',
            message: 'Choose a valid project role.'
        });
    }

    const invitees = [];
    try {
        const auth = getFirebaseAdmin().auth();
        for (const input of inviteeInputs) {
            let user = null;
            if (input.firebaseUid) {
                try {
                    user = await auth.getUser(input.firebaseUid);
                } catch (error) {
                    if (error.code !== 'auth/user-not-found' || !input.email) throw error;
                }
            }
            if (!user && input.email) {
                try {
                    user = await auth.getUserByEmail(input.email);
                } catch (error) {
                    if (error.code === 'auth/user-not-found') {
                        return res.status(404).json({
                            success: false,
                            code: 'REGISTERED_USER_NOT_FOUND',
                            message: `No registered Collab user was found for ${input.email}.`
                        });
                    }
                    throw error;
                }
            }
            if (!user) {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_INVITEE_SELECTION',
                    message: 'Each selected user must include an account ID or registered email.'
                });
            }
            const email = typeof user.email === 'string'
                ? user.email.trim().toLowerCase()
                : '';
            const name = (user.displayName || email).trim();
            if (!email || !name) {
                return res.status(400).json({
                    success: false,
                    code: 'INVITEE_PROFILE_INCOMPLETE',
                    message: 'Every selected user needs a name and email on their Collab account.'
                });
            }
            if (user.uid === req.firebaseUid) {
                return res.status(400).json({
                    success: false,
                    code: 'CANNOT_INVITE_SELF',
                    message: 'You cannot invite yourself to a project.'
                });
            }
            invitees.push({
                firebaseUid: user.uid,
                email,
                name
            });
        }
        const uniqueInvitees = new Map(
            invitees.map(invitee => [invitee.firebaseUid, invitee])
        );
        invitees.splice(0, invitees.length, ...uniqueInvitees.values());
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({
                success: false,
                code: 'REGISTERED_USER_NOT_FOUND',
                message: 'The selected Collab user could not be found.'
            });
        }
        console.error('Unable to verify invitation recipient:', error);
        return res.status(500).json({
            success: false,
            code: 'INVITEE_LOOKUP_FAILED',
            message: 'The selected user could not be verified.'
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const ownedProjects = await client.query(
            `
                SELECT project_id, name, creator_name
                FROM projects
                WHERE project_id = ANY($1::text[])
                  AND creator_firebase_uid = $2
                FOR UPDATE
            `,
            [projectIds, req.firebaseUid]
        );

        if (ownedProjects.rowCount !== projectIds.length) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                code: 'PROJECT_INVITE_FORBIDDEN',
                message: 'You may invite users only to projects you created.'
            });
        }

        const created = [];
        for (const project of ownedProjects.rows) {
            const inviterName =
                project.creator_name ||
                req.firebaseUser?.name ||
                req.firebaseEmail ||
                'A Collab user';
            const initials = inviterName
                .split(/\s+/)
                .filter(Boolean)
                .map(part => part[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
            const firebaseAvatar = isValidNotificationAvatar(req.firebaseUser?.picture)
                ? req.firebaseUser.picture
                : '';
            const avatar = inviterAvatar || firebaseAvatar || initials || '•';
            for (const invitee of invitees) {
                const existing = await client.query(
                    `
                        SELECT invitation_id
                        FROM project_invitations
                        WHERE project_id = $1
                          AND (invited_firebase_uid = $2 OR LOWER(invited_email) = $3)
                          AND status = 'accepted'
                        LIMIT 1
                        FOR UPDATE
                    `,
                    [project.project_id, invitee.firebaseUid, invitee.email]
                );

                if (existing.rowCount) {
                    await client.query('ROLLBACK');
                    return res.status(409).json({
                        success: false,
                        code: 'USER_ALREADY_MEMBER',
                        message: `${invitee.name} is already a member of ${project.name}.`
                    });
                }

                const rawToken = randomBytes(32).toString('base64url');
                const tokenHash = createHash('sha256')
                    .update(rawToken)
                    .digest('hex');
                const previousInvitation = await client.query(
                    `
                        SELECT invitation_id
                        FROM project_invitations
                        WHERE project_id = $1
                          AND LOWER(invited_email) = $2
                          AND status IN ('pending', 'declined', 'revoked', 'delivery_failed')
                        ORDER BY created_at DESC
                        LIMIT 1
                        FOR UPDATE
                    `,
                    [project.project_id, invitee.email]
                );

                let invitationId;
                if (previousInvitation.rowCount) {
                    const refreshedInvitation = await client.query(
                        `
                            UPDATE project_invitations
                            SET invited_by_firebase_uid = $1,
                                invited_name = $2,
                                invited_email = $3,
                                role = $4,
                                token_hash = $5,
                                invited_firebase_uid = $6,
                                status = 'pending',
                                expires_at = NOW() + INTERVAL '14 days',
                                responded_at = NULL
                            WHERE invitation_id = $7::uuid
                            RETURNING invitation_id
                        `,
                        [
                            req.firebaseUid,
                            invitee.name,
                            invitee.email,
                            role,
                            tokenHash,
                            invitee.firebaseUid,
                            previousInvitation.rows[0].invitation_id
                        ]
                    );
                    invitationId = refreshedInvitation.rows[0].invitation_id;
                } else {
                    const insertedInvitation = await client.query(
                        `
                            INSERT INTO project_invitations (
                                invitation_id,
                                project_id,
                                invited_by_firebase_uid,
                                invited_email,
                                invited_name,
                                role,
                                token_hash,
                                invited_firebase_uid,
                                expires_at
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                                    NOW() + INTERVAL '14 days')
                            RETURNING invitation_id
                        `,
                        [
                            randomUUID(),
                            project.project_id,
                            req.firebaseUid,
                            invitee.email,
                            invitee.name,
                            role,
                            tokenHash,
                            invitee.firebaseUid
                        ]
                    );
                    invitationId = insertedInvitation.rows[0].invitation_id;
                }

                const detail =
                    `${inviterName} invited you to join ${project.name} as a ${role}.`;
                let notification = await client.query(
                    `
                        UPDATE notifications
                        SET title = 'You''ve been invited to a project',
                            detail = $1,
                            avatar = $2,
                            tone_class = 'blue-bg',
                            is_read = FALSE,
                            created_at = NOW()
                        WHERE invitation_id = $3::uuid
                          AND recipient_firebase_uid = $4
                        RETURNING id, project_id, invitation_id, type, title, detail,
                                  avatar, tone_class, is_read, created_at
                    `,
                    [detail, avatar, invitationId, invitee.firebaseUid]
                );
                if (!notification.rowCount) {
                    notification = await client.query(
                        `
                            INSERT INTO notifications (
                                recipient_firebase_uid, project_id, invitation_id,
                                type, title, detail, avatar, tone_class
                            )
                            VALUES ($1, $2, $3, 'project_invitation',
                                    'You''ve been invited to a project', $4, $5, 'blue-bg')
                            RETURNING id, project_id, invitation_id, type, title, detail,
                                      avatar, tone_class, is_read, created_at
                        `,
                        [
                            invitee.firebaseUid,
                            project.project_id,
                            invitationId,
                            detail,
                            avatar
                        ]
                    );
                }
                created.push(notification.rows[0]);
            }
        }

        await client.query('COMMIT');
        return res.status(201).json({
            success: true,
            message: 'Invitations sent successfully.',
            data: { invitations: created }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('In-app invitation rollback failed:', rollbackError);
        });
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                code: 'INVITATION_ALREADY_PENDING',
                message: 'This user already has an invitation for the selected project.'
            });
        }
        console.error('Create in-app invitation error:', error);
        return res.status(500).json({
            success: false,
            code: 'INVITATION_CREATE_FAILED',
            message: 'The invitation could not be created.'
        });
    } finally {
        client.release();
    }
};

module.exports = {
    createInAppInvitations,
    listProjectInvitations,
    revokeInvitation,
    acceptInvitation,
    declineInvitation,
    declineInAppInvitation,
    showDeclineConfirmation
};
