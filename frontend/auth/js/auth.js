import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, authFlowInProgress } from "./shared.js";
import { completePendingProfile } from "./profile.js";
import { redirectAfterLogin } from "./ui.js";
import {
    setupForms,
    setupInputEvents,
    setupPasswordVisibilityToggles,
    setupTabs,
    initializeTabFromUrl
} from "./forms.js";
import { setupSocialButtons } from "./providers.js";

export function initializeAuthObserver() {
    onAuthStateChanged(
        auth,
        async user => {
            /*
             * Explicit authentication handlers manage their own
             * profile persistence and navigation. This also keeps
             * account creation from persisting a profile or redirecting.
             *
             * Returning here prevents the observer from racing those
             * operations, including the sign-out after account creation.
             */
            if (authFlowInProgress.value) {
                return;
            }

            if (!user) {
                return;
            }

            try {
                await completePendingProfile(
                    user
                );
            } catch (error) {
                console.error(
                    "Unable to update authenticated user:",
                    error
                );
            }

            const params =
                new URLSearchParams(
                    window.location.search
                );

            /*
             * Only redirect an already-authenticated user when
             * the page was opened with a return destination.
             */

            if (params.has("return")) {
                redirectAfterLogin();
            }
        }
    );
}


// ============================================================
// CURRENT YEAR
// ============================================================

export function initializeYear() {
    document
        .querySelectorAll(".current-year")
        .forEach(element => {
            element.textContent =
                new Date().getFullYear();
        });
}


// ============================================================
// INITIALIZE
// ============================================================

function initialize() {
    setupTabs();
    setupForms();
    setupInputEvents();
    setupPasswordVisibilityToggles();
    setupSocialButtons();
    initializeTabFromUrl();
    initializeYear();
    initializeAuthObserver();
}

initialize();


