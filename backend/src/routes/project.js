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
    createProjectTask,
    createProjectTaskComment,
    deleteProjectTask,
    getProjectTaskComments,
    getProjectTasks,
    updateProjectTask,
    updateProjectTaskStatus
} = require('../controllers/taskController');
const {
    createMeeting,
    deleteMeeting,
    getMeetings
} = require('../controllers/meetingController');
const {
    createProjectReminder,
    getProjectReminders
} = require('../controllers/reminderController');
const {
    createProjectResource,
    getProjectResources
} = require('../controllers/resourceController');

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
router.get('/:projectId/tasks', getProjectTasks);
router.post('/:projectId/tasks', createProjectTask);
router.get('/:projectId/tasks/:taskId/comments', getProjectTaskComments);
router.post('/:projectId/tasks/:taskId/comments', createProjectTaskComment);
router.patch('/:projectId/tasks/:taskId/status', updateProjectTaskStatus);
router.put('/:projectId/tasks/:taskId', updateProjectTask);
router.delete('/:projectId/tasks/:taskId', deleteProjectTask);
router.get('/:projectId/meetings', getMeetings);
router.post('/:projectId/meetings', createMeeting);
router.delete('/:projectId/meetings/:meetingId', deleteMeeting);
router.get('/:projectId/reminders', getProjectReminders);
router.post('/:projectId/reminders', createProjectReminder);
router.get('/:projectId/resources', getProjectResources);
router.post('/:projectId/resources', createProjectResource);

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