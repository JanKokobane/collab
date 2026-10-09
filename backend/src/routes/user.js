const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
    getProfileImage,
    saveProfileImage,
    searchUsers
} = require('../controllers/userController');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();

router.use(requireFirebaseAuth);
router.get('/profile-image', getProfileImage);
router.put('/profile-image', saveProfileImage);
router.get(
    '/search',
    rateLimit({
        windowMs: 60 * 1000,
        limit: 30,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => res.status(429).json({
            success: false,
            code: 'USER_SEARCH_RATE_LIMITED',
            message: 'Too many user searches. Please wait before trying again.'
        })
    }),
    searchUsers
);

module.exports = router;
