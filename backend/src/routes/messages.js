const express = require('express');
const {
    getConversations,
    createConversation,
    getMessages,
    createMessage,
    mutateMessage,
    markConversationRead
} = require('../controllers/messageController');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();
router.use(requireFirebaseAuth);

router.get('/conversations', getConversations);
router.post('/conversations', createConversation);
router.get('/conversations/:conversationId/messages', getMessages);
router.post('/conversations/:conversationId/messages', createMessage);
router.post('/conversations/:conversationId/read', markConversationRead);
router.patch('/conversations/:conversationId/messages/:messageId/:action', mutateMessage);

module.exports = router;
