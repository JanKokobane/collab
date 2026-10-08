const express = require('express');
const { rateLimit } = require('express-rate-limit');

const {
    createInvitations,
    acceptInvitation,
    declineInvitation,
    showDeclineConfirmation
} = require('../controllers/invitationController');

const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();

/*
 * Public invitation response routes
 *
 * These must remain above requireFirebaseAuth because
 * recipients access them directly from their email.
 */

// Show the decline confirmation page.
router.get('/decline', showDeclineConfirmation);

// Process the decline form.
router.post('/decline', declineInvitation);

/*
 * Everything below this point requires a valid
 * Firebase ID token.
 */
router.use(requireFirebaseAuth);

/*
 * Create project invitations.
 *
 * Rate limited to 10 invitation requests per hour
 * per client.
 */
router.post(
    '/',
    rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: 10,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: {
            success: false,
            code: 'INVITATION_RATE_LIMITED',
            message:
                'Too many invitation requests. Please try again later.'
        }
    }),
    createInvitations
);

router.post(
    '/accept',
    acceptInvitation
);

module.exports = router;