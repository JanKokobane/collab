# Collab Frontend

Collab is a browser-based team workspace for organizing projects, tasks, calendars, team updates, and conversations. The frontend is built with semantic HTML, CSS, and native JavaScript ES modules. It does not use a frontend framework or a bundler.

## What the frontend contains

- A public landing page with product information, pricing, FAQs, testimonials, and sign-up links.
- An authentication page for email/password registration and sign-in, plus Google, GitHub, and Microsoft sign-in through Firebase Authentication.
- A single-page dashboard with projects, tasks, calendar, team administration, notifications, brainstorming boards, sticky notes, and realtime messaging.
- Privacy and terms pages.

## Run locally

Serve the `frontend` directory over HTTP. Native browser modules and Firebase authentication should be tested through a local web server rather than opening the HTML files with `file://`.

```sh
cd frontend
python3 -m http.server 8000
```

Open <http://localhost:8000/> in a browser. The dashboard is at <http://localhost:8000/dashboard/dashboard.html>, and authentication is at <http://localhost:8000/auth/auth.html>.

Any static HTTP server can be used in place of Python's server. The frontend package manifest currently declares a Firebase dependency but has no `dev`, `build`, or `test` scripts, and the application has no compilation step.

### Firebase authentication setup

Authentication is configured in `firebase.js` and implemented by the modules under `auth/js/` using the Firebase Authentication browser SDK. The SDK is imported from Google's hosted CDN. To use email/password or social sign-in in another Firebase project:

1. Configure the Firebase web app in `firebase.js`.
2. Enable Email/Password, Google, GitHub, and Microsoft providers as needed in Firebase Authentication.
3. Add the development and production hostnames to Firebase Authentication's authorized domains.
4. Configure provider-specific OAuth credentials and redirect domains in Firebase and the respective provider consoles.

Firebase signs users in on the frontend. The API uses the user's Firebase ID token to authorize data that is persisted by the backend. Some sample and preference data is still stored locally in the browser; see [State and persistence](#state-and-persistence).

## Page and application flow

1. `index.html` is the public entry page. It loads `main.js` for the landing page's testimonial carousel, newsletter-form feedback, and current-year labels.
2. The landing page links to `auth/auth.html` and `dashboard/dashboard.html`.
3. `auth/auth.html` loads `auth/auth.js`, a compatibility entry that imports `auth/js/auth.js`. Users register and sign in with an email and password or use a configured social provider. Registration collects profile and collaboration details; profile details are persisted through the authenticated backend.
4. `dashboard/dashboard.html` is the application shell and loads `dashboard.js` as a module.
5. `dashboard.js` imports the dashboard feature modules, registers their render/actions in the shared `hub` object from `dashboard/js/state.js`, initializes event handlers, and renders the initial view.
6. `dashboard/js/navigation.js` switches views by showing the matching dashboard section and asking the relevant module to render it.

`dashboard/js/app.js` is a separate module; the dashboard page currently loads `dashboard.js`, not `js/app.js`.

## Dashboard features

- **Workspace and projects:** Project navigation, workspace overview, sprint summaries, task board, and list view. Project and sprint management lives in `dashboard/js/projects.js`.
- **Header search:** Live results for accessible tasks, projects, and team members are wired in `dashboard/js/events.js`.
- **Tasks:** Filtering, task status changes, board drag-and-drop, list rendering, and task creation are handled by `dashboard/js/tasks.js`.
- **Calendar:** Month navigation, project meetings, pinned meetings, task dates, reminders, and scheduling dialogs are handled by `dashboard/js/calendar.js`. Meeting API loading and normalization are in `dashboard/js/meetings.js`; `dashboard/js/calendarData.js` loads project tasks and reminders for calendar views.
- **Administration:** Member, task, meeting, and audit-log tables are rendered by `dashboard/js/admin.js`. Role and project-creator helpers are in `dashboard/js/auth.js`.
- **Workspace hub:** `dashboard/js/workspaceHub.js` wires views implemented in `dashboard/js/workspaceCore.js`. Workspace summaries, project-scoped resources, a scratchpad, and notifications are displayed here. Resources load from the backend for accessible projects; only project creators can add links.
- **Brainstorming:** Choose an accessible project, create private brainstorm boards, invite accepted project members, and receive in-dashboard invitation and board-update notifications. Notes, votes, positions, and links are saved to PostgreSQL through the backend; only board members can read or update a board.
- **Sticky notes:** Project notes float above the dashboard and can be moved around the viewport. Note content and positions are saved through the backend. Closing a note with its X hides it only in the current user's browser.
- **Polls and announcements:** Workspace polls and announcements are implemented in `dashboard/js/polls.js` and `dashboard/js/announcements.js`; their current state is browser-local.
- **Messages:** Direct conversations, groups, and channels use PostgreSQL for membership and live messages. Conversation members can edit, pin, or delete messages in that conversation; messages also support attachments, voice notes, reactions, replies, forwarding, per-user deletion, read receipts, and unread badges. Voice notes use browser echo cancellation and noise suppression with a 24 kbps speech-optimized bitrate; they are sent as audio attachments within the 512 KiB per-message attachment limit. The recording panel's send action sends directly without staging an attachment preview in the composer. Each note's measured duration is encoded in its generated filename for display in the waveform player. Direct conversations use browser WebRTC for one-to-one voice/video calls and authenticated Socket.IO signaling; the client prefers WebSocket with XHR polling fallback. STUN is configured by default, and an optional backend TURN relay improves connectivity through restrictive networks. Calls require HTTPS (except localhost) and microphone/camera permission. Unanswered calls are recorded as persistent missed-call activity in the direct-message timeline. Call controls and modal rendering live in `dashboard/js/messageCallUI.js`; signaling and call lifecycle remain in `dashboard/js/messages.js`.
- **Notifications:** Workspace notifications can be marked read individually or in bulk, or cleared. State and badge updates are in `dashboard/js/state.js`; view rendering is in `dashboard/js/workspaceCore.js`.
- **Settings and appearance:** Profile controls, collaboration settings, theme, and accent handling are implemented in `dashboard/js/theme.js`.
- **User profile:** Profile details are loaded and saved with `GET|PUT /api/users/profile`; the profile photo uses `GET|PUT /api/users/profile-image`.
- **Responsive navigation and dialogs:** `dashboard/js/events.js` wires dashboard controls, while `dashboard/js/modalChrome.js` applies shared headers and body structure to supported dialogs.

## Frontend file map

```text
frontend/
├── index.html                 Landing page
├── main.js                    Landing-page interactions
├── style.css                  Landing-page styles
├── firebase.js                Firebase app and Auth initialization
├── package.json               Frontend dependency declaration
├── package-lock.json          Locked npm dependency tree
├── auth/
│   ├── auth.html              Sign-in and registration page
│   ├── auth.js                Compatibility module for the auth entry
│   ├── auth.css               Authentication-page styles
│   └── js/
│       ├── auth.js            Auth-page initialization
│       ├── forms.js           Email/password sign-in and registration
│       ├── profile.js         Profile completion and API persistence
│       ├── providers.js       Google, GitHub, and Microsoft sign-in
│       ├── shared.js          Shared auth state and DOM references
│       └── ui.js              Auth feedback and page navigation
├── dashboard/
│   ├── dashboard.html         Dashboard shell and feature containers
│   ├── dashboard.js           Dashboard application entry point
│   ├── dashboard.css          Shared shell and dashboard styles
│   ├── meetingsPage.css       Dedicated team meetings view
│   ├── zoomMeetingModal.css  Custom video meeting modal styling
│   ├── workspaceHub.css       Workspace, brainstorm, and messaging styles
│   └── js/
│       ├── admin.js           Administration tables and dialogs
│       ├── announcements.js      Workspace announcements
│       ├── api.js                Authenticated backend API client
│       ├── app.js                Alternate/legacy bootstrap module
│       ├── auth.js               User UI and role/creator helpers
│       ├── brainstorm.js         Project brainstorm boards and ideas
│       ├── calendar.js           Calendar views and scheduling dialogs
│       ├── calendarData.js       Project task and reminder API loading
│       ├── dateUtils.js          Local date parsing and formatting
│       ├── events.js             Dashboard UI event wiring and search
│       ├── icons.js              Shared inline SVG icon generator
│       ├── meetings.js           Project meeting API and normalization
│       ├── meetingsPage.js       Meetings page rendering and actions
│       ├── meteredMeetingModal.js Metered room, media, and custom modal behavior
│       ├── messageCallUI.js      WebRTC call modal and controls
│       ├── messages.js           Persistent messaging, signaling, and call lifecycle
│       ├── modalChrome.js        Shared modal enhancement
│       ├── navigation.js         Dashboard view switching
│       ├── polls.js              Workspace polls
│       ├── profileOnboarding.js  Profile onboarding flow
│       ├── projectStickyNotes.js Project sticky-note overlay
│       ├── projects.js           Projects, sprints, collaborator management
│       ├── state.js              Shared state, API loading, and hub
│       ├── tasks.js              Task boards, lists, filtering, status workflow
│       ├── theme.js              Theme, accent, profile, settings
│       ├── workspaceCore.js      Workspace views and summary rendering
│       ├── workspaceHub.js       Workspace event wiring and notifications
│       └── workspaceResources.js Project resources and scratchpad
├── images/                    Logos, favicon, and landing-page imagery
└── legal/
    ├── privacy.html           Privacy policy
    ├── terms.html             Terms of service
    └── legal.css              Shared legal-page styles
```

Scheduled and instant project meetings use Metered Video rooms in the
dashboard. The database meeting UUID is the Metered room name. Before joining,
the browser requests a short-lived, room-scoped access token from the
authenticated backend; the backend verifies project access and the meeting
attendee list, and provisions the private Metered room when needed. Configure
`METERED_APP_NAME` and `METERED_API_KEY` in the backend environment. The
browser loads Metered's JavaScript SDK from its CDN when the meeting is opened.
The existing custom meeting modal and CSS provide microphone and camera
controls, screen sharing, a participant list, and in-meeting chat.

## State and persistence

The frontend uses Firebase Authentication for sign-in. `dashboard/js/api.js` attaches the current Firebase ID token to API requests and provides the configured API base URL (the deployed Collab API by default). Set `window.COLLAB_API_BASE_URL` before the dashboard modules load to point the frontend at another API environment.

Projects, tasks, invitations, meetings, reminders, resources, scratchpads, brainstorm boards, sticky notes, user profiles, and messages use authenticated backend APIs. Messages also use authenticated WebSockets for live updates. The API and database setup are documented in [`../backend/README.md`](../backend/README.md).

Some interface/demo state and preferences are still browser-local, including seeded sample members/tasks, polls, announcements, theme/accent settings, selected brainstorm board, and per-user sticky-note hiding. Local storage is scoped to the browser origin and device; it is not shared across team members. Project sticky-note contents and positions are server-persisted, but each user's hidden-note list is local.

## Styling and assets

- `style.css` styles the marketing landing page and shared footer.
- `auth/auth.css` styles sign-in and registration.
- `dashboard/dashboard.css` styles the dashboard shell and shared components.
- `dashboard/workspaceHub.css` styles workspace hub content, brainstorming, polls, and messaging.
- `legal/legal.css` styles the privacy and terms pages.
- `images/` contains the logo, favicon, marketing imagery, and dashboard preview.

The dashboard uses native CSS breakpoints and responsive layouts. Most feature behavior is implemented with standard DOM APIs and ES modules, with no client-side framework.

## Development notes

- Keep import paths relative to each ES module and serve the frontend from HTTP.
- `dashboard/dashboard.html` is the active dashboard entry page; it loads `dashboard/dashboard.js` as a native JavaScript module.
- The landing newsletter form currently displays local success feedback; no newsletter service is connected.
- `frontend/package.json` declares Firebase but does not define frontend `dev`, `build`, or `test` scripts. There is no frontend compilation step. Validate UI changes in a browser at desktop and mobile widths, and use the editor's JavaScript/CSS/HTML diagnostics where available.
- Privacy and terms pages are static frontend documents; review their content before deploying a production service.
