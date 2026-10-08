const express = require('express');

const {
    checkPhoneNumber,
    savePhoneNumber,
    updatePhoneNumber
} = require('../controllers/phoneController');

const {
    requireFirebaseAuth
} = require('../middleware/requireFirebaseAuth');

const router = express.Router();

router.post(
    '/check',
    checkPhoneNumber
);

router.post(
    '/save',
    requireFirebaseAuth,
    savePhoneNumber
);

router.put(
    '/update',
    requireFirebaseAuth,
    updatePhoneNumber
);

module.exports = router;