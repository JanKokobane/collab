const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
    parseTask,
    summarizeMeeting,
    summarizeChat
} = require('../controllers/aiController');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();
const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
        success: false,
        code: 'AI_RATE_LIMITED',
        message: 'Too many AI requests. Please wait a minute and try again.'
    })
});

router.use(requireFirebaseAuth);
router.use(aiRateLimit);
router.post('/parse-task', parseTask);
router.post('/summarize-meeting', summarizeMeeting);
router.post('/summarize-chat', summarizeChat);

module.exports = router;
