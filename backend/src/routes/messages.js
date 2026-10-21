const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
    getConversations,
    createConversation,
    deleteConversationForMe,
    updateOwnPresence,
    getMessages,
    createMessage,
    mutateMessage,
    deleteMessage,
    clearConversationMessages,
    markConversationRead
} = require('../controllers/messageController');
const {
    getCallHistory,
    startCall,
    updateCall,
    inviteCallParticipants,
    joinInvitedCall,
    declineInvitedCall
} = require('../controllers/messageCallController');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();
const callStartRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
        success: false,
        code: 'CALL_RATE_LIMITED',
        message: 'Too many calls were started. Please wait a few minutes and try again.'
    })
});
router.use(requireFirebaseAuth);

router.get('/conversations', getConversations);
router.post('/conversations', createConversation);
router.post('/presence', updateOwnPresence);
router.delete('/conversations/:conversationId', deleteConversationForMe);
router.get('/conversations/:conversationId/messages', getMessages);
router.post('/conversations/:conversationId/messages', createMessage);
router.delete('/conversations/:conversationId/messages/:messageId', deleteMessage);
router.delete('/conversations/:conversationId/messages', clearConversationMessages);
router.post('/conversations/:conversationId/read', markConversationRead);
router.patch('/conversations/:conversationId/messages/:messageId/:action', mutateMessage);
router.get('/conversations/:conversationId/calls', getCallHistory);
router.post('/conversations/:conversationId/calls', callStartRateLimit, startCall);
router.post('/conversations/:conversationId/calls/:callId/invite', inviteCallParticipants);
router.post('/conversations/:conversationId/calls/:callId/join', joinInvitedCall);
router.post('/conversations/:conversationId/calls/:callId/decline-invite', declineInvitedCall);
router.post('/conversations/:conversationId/calls/:callId/:action', updateCall);

module.exports = router;
