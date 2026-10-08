const express = require('express');

const {
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject
} = require('../controllers/projectController');
const {
    listProjectInvitations,
    revokeInvitation
} = require('../controllers/invitationController');

const {
    requireFirebaseAuth
} = require('../middleware/requireFirebaseAuth');

const router = express.Router();

router.use(requireFirebaseAuth);


router.post(
    '/',
    createProject
);

router.get(
    '/',
    getProjects
);

router.get('/:projectId/invitations', listProjectInvitations);
router.delete('/:projectId/invitations/:invitationId', revokeInvitation);

router.get(
    '/:projectId',
    getProject
);

router.put(
    '/:projectId',
    updateProject
);
router.delete(
    '/:projectId',
    deleteProject
);


module.exports = router;