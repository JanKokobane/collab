const express = require('express');
const {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    deleteNotification
} = require('../controllers/notificationController');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();

router.use(requireFirebaseAuth);
router.get('/', getNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.delete('/', clearNotifications);
router.patch('/:notificationId/read', markNotificationRead);
router.delete('/:notificationId', deleteNotification);

module.exports = router;
