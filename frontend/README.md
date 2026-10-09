# Collab Frontend

Collab is a browser-based team workspace for organizing projects, tasks, calendars, team updates, and conversations. The frontend is built with semantic HTML, CSS, and native JavaScript ES modules. It does not use a frontend framework or a bundler.

## What the frontend contains

- A public landing page with product information, pricing, FAQs, testimonials, and sign-up links.
- An authentication page for email-link sign-in and registration, plus Google, GitHub, and Microsoft sign-in.
- A single-page dashboard with project boards, calendar, workspace administration, notifications, brainstorming tools, settings, and local-demo messaging. Project meetings are persisted by the backend and scoped to accessible projects.
- Privacy and terms pages.

## Run locally

Serve the `frontend` directory over HTTP. Native browser modules and Firebase authentication links should be tested through a local web server rather than opening the HTML files with `file://`.

```sh
cd frontend
python3 -m http.server 8000
```

Open <http://localhost:8000/> in a browser. The dashboard is at <http://localhost:8000/dashboard/dashboard.html>, and authentication is at <http://localhost:8000/auth/auth.html>.

Any static HTTP server can be used in place of Python's server. The frontend package manifest currently declares a Firebase dependency but has no `dev`, `build`, or `test` scripts, and the application has no compilation step.

### Firebase authentication setup

Authentication is configured in `firebase.js` and implemented in `auth/auth.js` using the Firebase Authentication browser SDK. The current page imports the SDK from Google's hosted CDN. To use email/password or social sign-in in another Firebase project:

1. Configure the Firebase web app in `firebase.js`.
2. Enable Email/Password, Google, GitHub, and Microsoft providers as needed in Firebase Authentication.
3. Add the development and production hostnames to Firebase Authentication's authorized domains.
4. Configure provider-specific OAuth credentials and redirect domains in Firebase and the respective provider consoles.

Firebase authentication is separate from the dashboard's demo data storage; signing in does not make the local workspace data a shared, server-synchronized workspace.

## Page and application flow

1. `index.html` is the public entry page. It loads `main.js` for the landing page's testimonial carousel, newsletter-form feedback, and current-year labels.
2. The landing page links to `auth/auth.html` and `dashboard/dashboard.html`.
3. `auth/auth.html` loads `auth/auth.js`. Users register and sign in with an email and password, or use a social provider. Registration also collects collaboration type, brand/company, job title, and industry; choosing “Other” requires a collaboration description. Successful authentication saves a browser-local user profile and redirects to the dashboard.
4. `dashboard/dashboard.html` is the application shell and loads `dashboard.js` as a module.
5. `dashboard.js` imports the dashboard feature modules, registers their render/actions in the shared `hub` object from `dashboard/js/state.js`, initializes event handlers and modal chrome, and renders the initial view.
6. `dashboard/js/navigation.js` switches views by showing the matching dashboard section and asking the relevant module to render it.

`dashboard/js/app.js` is an additional dashboard bootstrap module. The dashboard page currently loads `dashboard.js`, not `js/app.js`.

## Dashboard features

- **Workspace and projects:** Project navigation, workspace overview, sprint summaries, task board, and list view. Project and sprint management lives in `dashboard/js/projects.js`.
- **Tasks:** Filtering, task status changes, board drag-and-drop, list rendering, and task creation are handled by `dashboard/js/tasks.js`.
- **Calendar:** Month navigation, backend-persisted project meetings, pinned meetings, task dates, reminders, and scheduling dialogs are handled by `dashboard/js/calendar.js`. Meeting API loading and normalization are in `dashboard/js/meetings.js`; `dashboard/js/dateUtils.js` centralizes local date-key parsing and relative date display.
- **Administration:** Member, task, meeting, and audit-log tables are rendered by `dashboard/js/admin.js`. Role and project-creator helpers are in `dashboard/js/auth.js`.
- **Workspace hub:** Workspace summaries, announcements, resources, scratchpad, and team notifications are managed by `dashboard/js/workspaceHub.js`.
- **Brainstorming:** Sticky notes can be categorized, repositioned, and linked on a board; board changes can be explicitly saved. The same workspace module manages this feature.
- **Polls:** Polls are created in the workspace-management area. Only included audience members see them; votes are stored per member, and a new poll can appear in a dismissible voting popup.
- **Messages:** The browser-local messaging demo supports direct conversations, groups, channels, attachments, media previews, reactions, reply/edit/forward/pin/delete actions, simulated read receipts, and unread badges. Its UI and persistence are in `dashboard/js/messages.js`.
- **Notifications:** Workspace notifications can be marked read individually or in bulk, or cleared. The notification state and badge updates are in `dashboard/js/state.js`; the table and confirmation flows are in `dashboard/js/workspaceHub.js`.
- **Settings and appearance:** Profile controls, collaboration settings, theme, and accent handling are implemented in `dashboard/js/theme.js`.
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
│   ├── auth.js                Firebase email-link and social authentication
│   └── auth.css               Authentication-page styles
├── dashboard/
│   ├── dashboard.html         Dashboard shell and feature containers
│   ├── dashboard.js           Dashboard application entry point
│   ├── dashboard.css          Shared shell and dashboard styles
│   ├── workspaceHub.css       Workspace, brainstorm, and messaging styles
│   └── js/
│       ├── app.js             Additional dashboard bootstrap module
│       ├── admin.js           Administration tables and dialogs
│       ├── auth.js            User UI and role/creator helpers
│       ├── calendar.js        Calendar, meetings, reminders, date dialogs
│       ├── dateUtils.js       Local date parsing and formatting
│       ├── events.js          Dashboard UI event wiring
│       ├── icons.js           Shared inline SVG icon generator
│       ├── messages.js        Browser-local messaging demo
│       ├── modalChrome.js     Shared modal chrome enhancement
│       ├── navigation.js      Dashboard view switching
│       ├── projects.js        Projects, sprints, collaborator management
│       ├── meetings.js        Project meeting API, loading, and normalization
│       ├── state.js           Seed data, shared state, persistence, hub
│       ├── tasks.js           Task filtering, boards, list, status workflow
│       ├── theme.js           Theme, accent, profile, settings
│       └── workspaceHub.js    Workspace hub, notifications, polls, brainstorm
├── images/                    Logos, favicon, and landing-page imagery
└── legal/
    ├── privacy.html           Privacy policy
    ├── terms.html             Terms of service
    └── legal.css              Shared legal-page styles
```

## State and persistence

Some dashboard sections still seed demo members, tasks, reminders, notifications, and collaboration activity in `dashboard/js/state.js`; local-only state remains scoped to the browser origin and device. Projects and project tasks use the backend API, and project meetings are stored in PostgreSQL through the authenticated project meeting endpoints. Meetings are not loaded from or saved to browser storage.

Common storage keys include:

| Data | Local storage key |
| --- | --- |
| Authenticated profile and login marker | `collab-user`, `collab-logged-in` |
| Pending registration and email-link flow | `collab-pending-user`, `emailForSignIn` |
| Members, projects, tasks | `collab-members`, `collab-projects`, `collab-tasks` |
| Local reminders | `collab-reminders` |
| Workspace notifications | `collab_notifications` |
| Announcements, sticky notes, links, polls, resources | `collab_announcements`, `collab_sticky_notes`, `collab_sticky_links`, `collab_team_polls`, `collab_team_resources` |
| Scratchpad and workspace preferences | `collab_workspace_scratchpad`, `collab-workspace-settings`, `collab_tool_settings` |
| Appearance | `collab_theme`, `collab_accent` |
| Messaging demo | `collab-demo-messaging` |

Messaging attachments are converted to data URLs and stored with the conversation; the current implementation limits the combined attachment size to 512 KB per message to reduce browser storage pressure. Incoming-message read state and outgoing demo read receipts are simulated in local state.

Firebase provides authentication tokens to the backend API. Project meetings and other documented project APIs are persisted by the server; reminders, polls, and demo messaging remain local unless their module is explicitly wired to an API.

The backend provides Firebase-ID-token authenticated project, task, invitation,
notification, and meeting APIs. Other dashboard features may still use
browser-local demo state; see `../backend/README.md` for API setup and the
current migration boundary.

## Styling and assets

- `style.css` styles the marketing landing page and shared footer.
- `auth/auth.css` styles sign-in and registration.
- `dashboard/dashboard.css` styles the dashboard shell and shared components.
- `dashboard/workspaceHub.css` styles workspace hub content, brainstorming, polls, and messages.
- `legal/legal.css` styles the privacy and terms pages.
- `images/` contains the logo, favicon, marketing imagery, and dashboard preview.

The dashboard uses native CSS breakpoints and responsive layouts. Most feature behavior is implemented with standard DOM APIs and ES modules, with no client-side framework.

## Development notes

- Keep import paths relative to each ES module and serve the frontend from HTTP.
- `dashboard/dashboard.html` is the active dashboard entry page; it loads `dashboard/dashboard.js`.
- The landing newsletter form currently displays local success feedback; no newsletter service is connected.
- There is no automated frontend test or build command configured in `frontend/package.json`. Validate UI changes in a browser at desktop and mobile widths, and use the editor's JavaScript/CSS/HTML diagnostics where available.
- Privacy and terms pages are static frontend documents; review their content before deploying a production service.
