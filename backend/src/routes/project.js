const express = require('express');

const {
    createProject,
    getProjects,
    getProject,
    updateProject,
    submitProjectSprint,
    reviewProjectSprint,
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
    getProjectTaskDependencies,
    getProjectTaskComments,
    getProjectTaskDetails,
    getProjectTasks,
    updateProjectTaskDependencies,
    updateProjectTask,
    updateProjectTaskStatus
} = require('../controllers/taskController');
const {
    createMeetingChatMessage,
    createProjectMeetingActionItem,
    createMeeting,
    dispatchProjectMeetingActionItem,
    deleteMeeting,
    endProjectMeeting,
    getProjectMeetingActionItems,
    getProjectMeetingLiveStatus,
    getProjectMeetingNotes,
    getMeetingChatMessages,
    getMeetings,
    getMeteredMeetingToken,
    saveProjectMeetingNotes,
    updateProjectMeetingScreenShare
} = require('../controllers/meetingController');
const {
    createProjectReminder,
    getProjectReminders
} = require('../controllers/reminderController');
const {
    createProjectResource,
    deleteProjectResource,
    updateProjectResource,
    getProjectResources
} = require('../controllers/resourceController');
const {
    getProjectScratchpad,
    saveProjectScratchpad
} = require('../controllers/scratchpadController');
const {
    createProjectStickyNote,
    deleteProjectStickyNote,
    getProjectStickyNotes,
    updateProjectStickyNote
} = require('../controllers/projectStickyNoteController');
const {
    createProjectBoard,
    getBoard,
    getProjectBoards,
    inviteBoardMembers,
    deleteBoard,
    updateBoardSettings,
    saveBoard,
    toggleBoardNoteReaction
} = require('../controllers/brainstormController');

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
router.post('/:projectId/sprints/:sprintName/submit', submitProjectSprint);
router.post('/:projectId/sprints/:sprintName/complete', submitProjectSprint);
router.post('/:projectId/sprints/:sprintName/review', reviewProjectSprint);
router.get('/:projectId/tasks/:taskId', getProjectTaskDetails);
router.get('/:projectId/tasks/:taskId/comments', getProjectTaskComments);
router.post('/:projectId/tasks/:taskId/comments', createProjectTaskComment);
router.get('/:projectId/tasks/:taskId/dependencies', getProjectTaskDependencies);
router.put('/:projectId/tasks/:taskId/dependencies', updateProjectTaskDependencies);
router.patch('/:projectId/tasks/:taskId/status', updateProjectTaskStatus);
router.put('/:projectId/tasks/:taskId', updateProjectTask);
router.delete('/:projectId/tasks/:taskId', deleteProjectTask);
router.get('/:projectId/meetings', getMeetings);
router.post('/:projectId/meetings', createMeeting);
router.post('/:projectId/meetings/:meetingId/token', getMeteredMeetingToken);
router.get('/:projectId/meetings/:meetingId/live-status', getProjectMeetingLiveStatus);
router.post('/:projectId/meetings/:meetingId/screen-share', updateProjectMeetingScreenShare);
router.post('/:projectId/meetings/:meetingId/end', endProjectMeeting);
router.get('/:projectId/meetings/:meetingId/messages', getMeetingChatMessages);
router.post('/:projectId/meetings/:meetingId/messages', createMeetingChatMessage);
router.get('/:projectId/meetings/:meetingId/notes', getProjectMeetingNotes);
router.put('/:projectId/meetings/:meetingId/notes', saveProjectMeetingNotes);
router.get('/:projectId/meetings/:meetingId/action-items', getProjectMeetingActionItems);
router.post('/:projectId/meetings/:meetingId/action-items', createProjectMeetingActionItem);
router.post('/:projectId/meetings/:meetingId/action-items/:actionItemId/dispatch', dispatchProjectMeetingActionItem);
router.delete('/:projectId/meetings/:meetingId', deleteMeeting);
router.get('/:projectId/reminders', getProjectReminders);
router.post('/:projectId/reminders', createProjectReminder);
router.get('/:projectId/resources', getProjectResources);
router.post('/:projectId/resources', createProjectResource);
router.put('/:projectId/resources/:resourceId', updateProjectResource);
router.delete('/:projectId/resources/:resourceId', deleteProjectResource);
router.get('/:projectId/scratchpad', getProjectScratchpad);
router.put('/:projectId/scratchpad', saveProjectScratchpad);
router.get('/:projectId/sticky-notes', getProjectStickyNotes);
router.post('/:projectId/sticky-notes', createProjectStickyNote);
router.put('/:projectId/sticky-notes/:noteId', updateProjectStickyNote);
router.delete('/:projectId/sticky-notes/:noteId', deleteProjectStickyNote);
router.get('/:projectId/brainstorm-boards', getProjectBoards);
router.post('/:projectId/brainstorm-boards', createProjectBoard);
router.get('/brainstorm-boards/:boardId', getBoard);
router.patch('/brainstorm-boards/:boardId', updateBoardSettings);
router.delete('/brainstorm-boards/:boardId', deleteBoard);
router.put('/brainstorm-boards/:boardId', saveBoard);
router.post('/brainstorm-boards/:boardId/notes/:noteId/reactions', toggleBoardNoteReaction);
router.post('/brainstorm-boards/:boardId/members', inviteBoardMembers);

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