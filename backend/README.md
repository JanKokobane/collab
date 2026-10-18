# Collab backend

The API uses PostgreSQL for persistence and Firebase Admin to verify Firebase
ID tokens. The verified Firebase UID is synchronized to the application user
record; clients cannot choose the authenticated user by sending a user ID.

## Configuration

Copy `.env.example` to `.env` for local development and set:

- `DATABASE_URL`: PostgreSQL connection URL. Use a local database URL for
  development and Render's PostgreSQL URL in production.
- `FIREBASE_PROJECT_ID`: project that signs the frontend's Firebase ID tokens.
- Firebase Admin credentials through `GOOGLE_APPLICATION_CREDENTIALS`
  (local) or Render's secret environment variables
  (`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`).
- `CORS_ALLOWED_ORIGINS`: comma-separated, exact frontend origins. Include
  the local development origin and the deployed frontend origin.
- `DAILY_API_KEY`: Daily REST API key used by the backend to create private
  call rooms and short-lived participant tokens. Keep it in Render's secret
  environment settings; never expose it to the frontend.

Do not commit `.env` files or service-account credentials. The API defaults to
the Render backend URL in the frontend API client for non-local hosts; set
`window.COLLAB_API_BASE_URL` before loading the client to override it.

### Enabling calls and voice notes

1. Create or sign in to a Daily account at <https://dashboard.daily.co/> and
 copy an API key from its developer/API settings.
2. In Render, open the backend service's **Environment** settings and add
 `DAILY_API_KEY` with that value. Save and redeploy the backend. Do not put
 this key in GitHub Pages files, Firebase config, or browser code.
3. Deploy the backend and frontend changes. Calls require the browser to be on HTTPS and
 each participant must grant microphone/camera access.

Daily call rooms and tokens are created by the authenticated backend. Call
state, voice-note attachments, messages, presence, and conversation membership
are stored in PostgreSQL; Socket.IO delivers authorized real-time updates.
Messaging no longer reads or writes Firestore, so this migration does not
require a Firestore rules deployment. Other Firestore-backed application
features continue to use the existing rules.

## Database

PostgreSQL connections require TLS with server-certificate and hostname
verification. Use a database provider whose certificate chain is trusted by
Node.js; unverified TLS is not supported.

Run `npm run migrate` to apply the numbered SQL files in `db/migrations/`.
Startup also applies pending migrations before the HTTP server listens.
Migrations run transactionally and use a PostgreSQL advisory lock so multiple
server instances do not apply the same migration simultaneously.

## Messaging (PostgreSQL + Socket.IO)

The authenticated backend verifies Firebase ID tokens, authorizes each
conversation against PostgreSQL project membership, and stores conversations,
messages, reactions, read receipts, per-user hiding, presence, and Daily call
state in PostgreSQL. Socket.IO authenticates the same Firebase tokens and
checks database membership before joining conversation rooms. REST endpoints
remain the source for history and mutations; socket events deliver new,
updated, deleted, read, delivery, presence, and call-state changes. Message
history is fetched in pages of 100, with older pages loaded as the user scrolls.
Direct conversations are shared by the same two users across projects when
they are both accepted members of the selected project. Groups and channels
remain tied to their project. Removing or clearing a conversation only affects
the requesting user's view.

Migration `019_message_realtime.sql` adds the realtime, per-user conversation
state, delivery, presence, and call tables. Startup applies it automatically.
To preserve conversations that currently exist only in Firestore:

1. Pause message and call writes during the cutover.
2. Deploy the backend so the PostgreSQL schema migration is applied.
3. From `backend/`, run `npm run migrate:messages:postgres` with PostgreSQL and
   Firebase Admin credentials for the same Firebase project as the current
   messaging data.
4. Review the importer summary and any skipped-conversation warnings. It
   imports only conversations whose project and members still exist in the
   SQL project-access records, preserves message IDs, reactions, reads,
   per-user hidden messages, chat hiding, and call state, and can be rerun.
5. Deploy the frontend and resume writes. Do not run the old
   `migrate:messages:firestore` script after this cutover; it copies SQL data
   in the opposite direction.

No messaging Firestore rules change is required. The existing Firestore rules
remain in place for unrelated Firestore-backed features.

Authenticated users can retrieve and update their profile through
`GET|PUT /api/users/profile`. Profile fields are stored in PostgreSQL's
`user_profiles` table. Profile photos remain stored in the same table and are
managed through `GET|PUT /api/users/profile-image`. Migration
`011_persistent_user_profile_fields.sql` adds the profile detail columns.

## Project invitations

Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FRONTEND_URL`, and `PUBLIC_API_URL`
in the backend deployment environment. The sender address must belong to a
verified Resend domain. Keep the Resend API key in Render's secret environment
settings or an ignored local `.env`; never add it to source control. Invitation
links expire after 14 days. The recipient signs in or creates an account with
the invited email before accepting, and accepted membership grants project
view access only; project writes remain restricted to the creator.

## Project tasks and sprints

Project sprints are persisted in the existing `projects.sprints` JSONB field.
Migration `005_project_tasks.sql` adds PostgreSQL-backed, project-scoped tasks;
`006_project_task_comments.sql` adds persistent comments for those tasks.
Authenticated project owners can create, edit, and delete tasks; project owners
and accepted project invitees can read them. A task must reference a sprint on
its project and an invitee whose invitation has been accepted. Pending invitees
and the project creator are not valid task assignees.
New tasks must be assigned to the accepted invitee recorded as the sprint lead;
task creation and assignment are validated by the API. Task categories are
stored as text and accept any non-empty value up to 100 characters. Existing
tasks on older sprints without a recorded lead can retain their current
accepted invitee when edited.

- `GET /api/projects/:projectId/tasks`: list tasks for a project the caller
  owns or has accepted an invitation to.
- `POST /api/projects/:projectId/tasks`: create a task as the project creator.
- `PUT /api/projects/:projectId/tasks/:taskId`: update a task as its project
  creator.
- `PATCH /api/projects/:projectId/tasks/:taskId/status`: update status as the
  project creator or the invitee assigned to that task.
- `DELETE /api/projects/:projectId/tasks/:taskId`: delete a task as its project
  creator.
- `GET|POST /api/projects/:projectId/tasks/:taskId/comments`: read or add task
  comments as the project creator or an accepted invitee.
  Task start and due dates must be today or later; this is validated by the
  API as well as the dashboard date picker.
- `GET|POST /api/projects/:projectId/meetings` and
  `DELETE /api/projects/:projectId/meetings/:meetingId`: list, schedule, and
  cancel project meetings. Owners and accepted invitees can list or schedule;
  only the host or project owner can cancel. Meeting attendees must be accepted
  members of that project. Scheduling creates persisted in-dashboard meeting
  invitation notifications for selected attendees other than the host in the
  same database transaction as the meeting. Meeting dates must be today or
  later.
- `GET|POST /api/projects/:projectId/reminders`: list and create reminders for
  a project the caller owns or has joined. Reminder dates must be today or
  later, and priorities are limited to Normal, High, and Urgent.
- `GET /api/projects/:projectId/resources`: list pinned resources for a project
  the caller owns or has accepted an invitation to join.
- `POST /api/projects/:projectId/resources`: pin an HTTP(S) resource to a
  project as its creator.
- `PUT|DELETE /api/projects/:projectId/resources/:resourceId`: edit or remove a
  specific resource as its project creator. Create, edit, and removal persist
  in-dashboard notifications for the other accepted project members. Resource
  links are only returned to the project creator and accepted invitees.
- `GET|POST /api/projects/:projectId/brainstorm-boards`: list boards the caller
  belongs to, or create a private project board. Board invitees must already be
  accepted members of that project.
- `GET|PUT /api/projects/brainstorm-boards/:boardId`: load or save board notes
  and links as a board member. Members can reposition shared ideas and create,
  and edit any idea. Only the creator of an idea can remove it.
- `PATCH|DELETE /api/projects/brainstorm-boards/:boardId`: rename or remove a
  board as its creator.
- `POST /api/projects/brainstorm-boards/:boardId/members`: invite additional
  accepted project members as the board creator. Membership and in-dashboard
  invitation notifications with a direct board reference are saved in the same
  transaction. Board members can contribute ideas and remove only their own
  ideas. Board updates notify the other members.
- `PUT /api/projects/:projectId` with a `sprints` array: persist sprint changes
  as the project creator. Sprint deletion may include a `sprint_name_map`
  object mapping every existing sprint name to a remaining sprint name; the
  update, task sprint changes, and task reassignment to the destination sprint
  lead (when present) are committed atomically. Newly assigned accepted
  invitee sprint leads receive a persisted in-dashboard notification.

## Implemented API foundation

All endpoints below require `Authorization: Bearer <Firebase ID token>`.

- `GET|POST /api/workspaces`: list the caller's memberships or create a
  workspace owned by the caller.
- `GET|PATCH|DELETE /api/workspaces/:workspaceId`: read/update an authorized
  workspace or soft-delete it as its owner.
- `GET /api/workspaces/:workspaceId/members`: list active members.
- `GET|POST /api/workspaces/:workspaceId/projects`: list/create projects.
- `GET /api/projects/:projectId`, `PATCH|DELETE /api/projects/:projectId`:
  access-controlled project operations.
- `GET|POST /api/projects/:projectId/tasks`, `GET|PATCH|DELETE
  /api/tasks/:taskId`, and task comment routes: project-authorized task
  operations. Any accepted project member or the project creator can update a
  task's status; task edits and deletes remain creator-only.
- `GET /api/notifications`, `PATCH /api/notifications/:notificationId/read`,
  `PATCH /api/notifications/read-all`, and
  `DELETE /api/notifications[/:notificationId]`: manage only the signed-in
  user's notifications. Creating a project inserts a notification for its
  creator in the same database transaction.
- `GET|PUT /api/users/profile-image`: retrieve or save the authenticated user's
  compressed profile photo, keyed only by their verified Firebase UID.
- `GET /api/users/members`: list project creators and collaborators for projects
  the authenticated user can access, including each member's project role and
  saved profile photo.
- `POST /api/invitations`: create invitations for projects owned by the caller
  and send branded Resend emails. `GET /api/projects/:projectId/invitations`
  lists their invitation status, and
  `DELETE /api/projects/:projectId/invitations/:invitationId` revokes an invite
  or removes accepted access. `POST /api/invitations/accept` requires the
  invited email to be signed in; `GET|POST /api/invitations/decline` provides
  a confirmation page before declining. Acceptance/rejection notifications are
  addressed to the project creator only.
- `src/routes/messages.js` provides Firebase-authenticated conversation,
  message, reaction, pin, read-receipt, attachment, and per-user conversation
  clearing operations. Clearing hides messages only for the caller. The
  `DELETE /api/messages/conversations/:conversationId` endpoint removes a
  conversation from only the caller's chat list. Direct conversations missing
  from Firestore are recreated with their original SQL conversation ID when
  available, so a rerun of the message backfill can restore their history.
  dashboard reads and subscribes to Firestore directly; message sends are
  written directly to Firestore, and snapshots update the UI without backend
  polling or a backend WebSocket. Conversation creation, read receipts, and
  operations that need the existing SQL authorization checks continue through
  the authenticated API.
- Direct conversations support one-to-one Daily voice/video calls. The backend
  creates private two-person rooms and short-lived, room-scoped participant
  tokens; Firestore stores invitation/status metadata and a private room
  reference, never participant tokens. Add
  `DAILY_API_KEY` to Render's secrets, deploy the backend and matching
  `firestore.rules`, and then deploy the frontend. Microphone/camera access
  requires HTTPS and user permission. Configure Firestore TTL for the `calls`
  collection group on `expires_at` to clean up expired call metadata. Calls
  are not recorded by this app.

Migration `007_project_meetings.sql` adds persistent project-scoped meetings,
`008_project_reminders.sql` adds persistent project-scoped calendar reminders,
`009_project_resources.sql` creates project-scoped pinned resources, and
`010_expand_project_resource_categories.sql` permits the full set of 50
resource categories. These are applied automatically during backend startup.
Migration `012_project_brainstorm_boards.sql` creates private project-scoped
brainstorm boards and their membership table. Migration
`013_brainstorm_board_notifications.sql` links invitations and board updates
to their boards so dashboard notifications can open the correct board.
Migration `014_persistent_messages.sql` creates persistent conversations,
members, messages, reactions, and read receipts; it is applied automatically
during backend startup.
Migration `015_message_delete_scopes.sql` adds per-user message hiding and
delete-for-everyone state for persistent messages.
Migration `016_project_scratchpads.sql` adds a shared notes document for each
project. Authenticated project creators and accepted members can load and save
it through `GET` and `PUT /api/projects/:projectId/scratchpad`.
Migration `017_project_sticky_notes.sql` adds project-scoped floating notes and
their tagged-recipient visibility. Creators can add, edit, and delete notes;
tagged members can view and reposition them. Tagged members receive a
notification when a note is created.
Migration `018_message_presence.sql` adds the persisted last-seen timestamp
used by direct-message presence.

## Remaining local demo features

Other dashboard sections still seed and read demo records in `localStorage`.
That data is not shared or access-controlled; only features with documented
API endpoints should be treated as backend-persistent.
