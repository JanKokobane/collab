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

Do not commit `.env` files or service-account credentials. The API defaults to
the Render backend URL in the frontend API client for non-local hosts; set
`window.COLLAB_API_BASE_URL` before loading the client to override it.

## Database

Run `npm run migrate` to apply the numbered SQL files in `db/migrations/`.
Startup also applies pending migrations before the HTTP server listens.
Migrations run transactionally and use a PostgreSQL advisory lock so multiple
server instances do not apply the same migration simultaneously.

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
Migration `005_project_tasks.sql` adds PostgreSQL-backed, project-scoped tasks.
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
- `PUT /api/projects/:projectId` with a `sprints` array: persist sprint changes
  as the project creator.

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
  operations.
- `GET /api/notifications`, `PATCH /api/notifications/:notificationId/read`,
  `PATCH /api/notifications/read-all`, and
  `DELETE /api/notifications[/:notificationId]`: manage only the signed-in
  user's notifications. Creating a project inserts a notification for its
  creator in the same database transaction.
- `GET|PUT /api/users/profile-image`: retrieve or save the authenticated user's
  compressed profile photo, keyed only by their verified Firebase UID.
- `GET /api/users/members`: list creators and accepted collaborators for projects
  the authenticated user can access, with each member's project invitation role.
- `POST /api/invitations`: create invitations for projects owned by the caller
  and send branded Resend emails. `GET /api/projects/:projectId/invitations`
  lists their invitation status, and
  `DELETE /api/projects/:projectId/invitations/:invitationId` revokes an invite
  or removes accepted access. `POST /api/invitations/accept` requires the
  invited email to be signed in; `GET|POST /api/invitations/decline` provides
  a confirmation page before declining. Acceptance/rejection notifications are
  addressed to the project creator only.
- Workspace invitation, channel, conversation, and message routes are
  documented in their route implementation in `src/routes/workspaces.js`.

The database migration includes tables for the planned calendar, messaging,
announcements, resources, polls, brainstorm, notifications, activity, and
files features. A table existing does not mean its API or frontend feature is
implemented.

## Remaining local demo features

Other dashboard sections still seed and read demo records in `localStorage`.
That data is not shared or access-controlled; only features with documented
API endpoints should be treated as backend-persistent.
