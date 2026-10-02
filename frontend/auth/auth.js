import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
    getAuth,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    onAuthStateChanged,
    signInWithPopup,
    fetchSignInMethodsForEmail,
    linkWithCredential,
    GoogleAuthProvider,
    GithubAuthProvider,
    OAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


// ============================================================
// FIREBASE CONFIGURATION
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyAjQOsgPTgrc3VyNxx58UppAbm7JvP1Vuo",
    authDomain: "collab-5a8c2.firebaseapp.com",
    projectId: "collab-5a8c2",
    storageBucket: "collab-5a8c2.firebasestorage.app",
    messagingSenderId: "936144338981",
    appId: "1:936144338981:web:906ae3373266e523667fcc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// ============================================================
// STORAGE KEYS
// ============================================================

const EMAIL_STORAGE_KEY = "emailForSignIn";
const PENDING_PROFILE_KEY = "collab-pending-user";
const USER_STORAGE_KEY = "collab-user";
const LOGIN_STORAGE_KEY = "collab-logged-in";


// ============================================================
// AUTH FLOW STATE
// ============================================================

let authFlowInProgress = false;


// ============================================================
// DOM ELEMENTS
// ============================================================

const tabSignin = document.querySelector("#tab-signin");
const tabRegister = document.querySelector("#tab-register");

const formSignin = document.querySelector("#form-signin");
const formRegister = document.querySelector("#form-register");

const heading = document.querySelector("#auth-heading");
const subheading = document.querySelector("#auth-subheading");

const signinUserInput = document.querySelector("#signin-user");

const regNameInput = document.querySelector("#reg-name");
const regEmailInput = document.querySelector("#reg-email");
const regWorkspaceInput = document.querySelector("#reg-workspace");
const regRoleInput = document.querySelector("#reg-role");

const signinSubmitBtn = document.querySelector("#signin-submit-btn");
const registerSubmitBtn = document.querySelector("#register-submit-btn");

const signinErrorAlert = document.querySelector("#signin-error-alert");
const registerErrorAlert = document.querySelector("#register-error-alert");

const googleSigninBtn = document.querySelector("#google-signin-btn");
const githubSigninBtn = document.querySelector("#github-signin-btn");
const microsoftSigninBtn = document.querySelector("#microsoft-signin-btn");

const googleRegisterBtn = document.querySelector("#google-register-btn");
const githubRegisterBtn = document.querySelector("#github-register-btn");
const microsoftRegisterBtn = document.querySelector("#microsoft-register-btn");


// ============================================================
// RETURN URL
// ============================================================

function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get("return");

    if (!returnUrl) {
        return "../dashboard/dashboard.html";
    }

    if (
        returnUrl.startsWith("http://") ||
        returnUrl.startsWith("https://")
    ) {
        try {
            const url = new URL(returnUrl);

            if (url.origin !== window.location.origin) {
                return "../dashboard/dashboard.html";
            }

            return url.href;
        } catch {
            return "../dashboard/dashboard.html";
        }
    }

    if (
        returnUrl.startsWith("/") ||
        returnUrl.startsWith("../") ||
        returnUrl.startsWith("./")
    ) {
        return returnUrl;
    }

    return "../dashboard/dashboard.html";
}


function redirectAfterLogin() {
    window.location.href = getReturnUrl();
}


// ============================================================
// TABS
// ============================================================

function switchTab(tab, updateUrl = true) {
    const isRegister = tab === "register";

    clearAllErrors();

    tabSignin?.classList.toggle("active", !isRegister);
    tabRegister?.classList.toggle("active", isRegister);

    tabSignin?.setAttribute(
        "aria-selected",
        String(!isRegister)
    );

    tabRegister?.setAttribute(
        "aria-selected",
        String(isRegister)
    );

    formSignin?.classList.toggle("active", !isRegister);
    formRegister?.classList.toggle("active", isRegister);

    if (heading) {
        heading.textContent = isRegister
            ? "Register your workspace"
            : "Sign in to Collab";
    }

    if (subheading) {
        subheading.textContent = isRegister
            ? "Create your account to start collaborating with your team."
            : "Sign in to access your Collab workspace dashboard.";
    }

    if (updateUrl) {
        const url = new URL(window.location.href);

        url.searchParams.set(
            "mode",
            isRegister ? "register" : "signin"
        );

        window.history.replaceState(
            {},
            "",
            url.toString()
        );
    }

    requestAnimationFrame(() => {
        if (isRegister) {
            regNameInput?.focus();
        } else {
            signinUserInput?.focus();
        }
    });
}


// ============================================================
// ALERTS
// ============================================================

function showAlert(element, message, type = "error") {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.style.display = "flex";

    if (type === "success") {
        element.style.backgroundColor = "#dcfce7";
        element.style.color = "#166534";
    } else if (type === "info") {
        element.style.backgroundColor = "#dcfce7";
        element.style.color = "#166534";
    } else {
        element.style.backgroundColor = "#fee2e2";
        element.style.color = "#991b1b";
    }
}


function clearAlert(element) {
    if (!element) {
        return;
    }

    element.style.display = "none";
    element.textContent = "";
}


// ============================================================
// TOASTS
// ============================================================

function showErrorToast(message) {
    let toast = document.querySelector("#auth-error-toast");

    if (!toast) {
        toast = document.createElement("div");

        toast.id = "auth-error-toast";

        toast.style.position = "fixed";
        toast.style.bottom = "24px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";
        toast.style.backgroundColor = "#DC2626";
        toast.style.color = "#FFFFFF";
        toast.style.padding = "10px 18px";
        toast.style.borderRadius = "8px";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "500";
        toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
        toast.style.zIndex = "9999";
        toast.style.transition = "opacity 0.3s ease";

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";

    clearTimeout(toast._timeout);

    toast._timeout = setTimeout(() => {
        toast.style.opacity = "0";
    }, 3500);
}


function showSuccessToast(message) {
    let toast = document.querySelector("#auth-success-toast");

    if (!toast) {
        toast = document.createElement("div");

        toast.id = "auth-success-toast";

        toast.style.position = "fixed";
        toast.style.bottom = "24px";
        toast.style.left = "50%";
        toast.style.transform = "translateX(-50%)";
        toast.style.backgroundColor = "#16A34A";
        toast.style.color = "#FFFFFF";
        toast.style.padding = "10px 18px";
        toast.style.borderRadius = "8px";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "500";
        toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
        toast.style.zIndex = "9999";
        toast.style.transition = "opacity 0.3s ease";

        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";

    clearTimeout(toast._timeout);

    toast._timeout = setTimeout(() => {
        toast.style.opacity = "0";
    }, 4000);
}


// ============================================================
// BUTTON LOADING
// ============================================================

function setButtonLoading(
    button,
    loading,
    loadingText,
    normalText
) {
    if (!button) {
        return;
    }

    button.disabled = loading;

    const textElement = button.querySelector("span");

    if (textElement) {
        textElement.textContent = loading
            ? loadingText
            : normalText;
    } else {
        button.textContent = loading
            ? loadingText
            : normalText;
    }
}


// ============================================================
// FIELD ERRORS
// ============================================================

function setFieldError(fieldId, message) {
    const group = document.querySelector(
        `#group-${fieldId}`
    );

    const errorElement = document.querySelector(
        `#${fieldId}-error`
    );

    group?.classList.add("has-error");

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add("visible");
    }
}


function clearFieldError(fieldId) {
    const group = document.querySelector(
        `#group-${fieldId}`
    );

    const errorElement = document.querySelector(
        `#${fieldId}-error`
    );

    group?.classList.remove("has-error");

    if (errorElement) {
        errorElement.textContent = "";
        errorElement.classList.remove("visible");
    }
}


function clearAllErrors() {
    document
        .querySelectorAll(".input-group")
        .forEach(group => {
            group.classList.remove("has-error");
        });

    document
        .querySelectorAll(".field-error-msg")
        .forEach(element => {
            element.textContent = "";
            element.classList.remove("visible");
        });

    clearAlert(signinErrorAlert);
    clearAlert(registerErrorAlert);
}


// ============================================================
// FIREBASE ERROR MESSAGES
// ============================================================

function getFirebaseErrorMessage(error) {
    const messages = {
        "auth/invalid-email":
            "Please enter a valid email address.",

        "auth/missing-email":
            "Please enter your email address.",

        "auth/operation-not-allowed":
            "This authentication method is not enabled in Firebase.",

        "auth/unauthorized-continue-uri":
            "This website domain is not authorized in Firebase Authentication.",

        "auth/invalid-continue-uri":
            "The Firebase authentication redirect URL is invalid.",

        "auth/invalid-action-code":
            "This authentication link is invalid.",

        "auth/expired-action-code":
            "This authentication link has expired. Please request a new one.",

        "auth/network-request-failed":
            "Network error. Please check your internet connection.",

        "auth/popup-closed-by-user":
            "The sign-in window was closed before authentication was completed.",

        "auth/popup-blocked":
            "Your browser blocked the sign-in popup. Please allow popups for Collab and try again.",

        "auth/cancelled-popup-request":
            "Another authentication window is already open.",

        "auth/account-exists-with-different-credential":
            "An account already exists with this email. Please continue with the sign-in method already connected to that account.",

        "auth/credential-already-in-use":
            "This sign-in account is already connected to another Firebase account.",

        "auth/email-already-in-use":
            "An account already exists with this email address.",

        "auth/user-disabled":
            "This account has been disabled.",

        "auth/too-many-requests":
            "Too many authentication attempts. Please wait a moment and try again.",

        "auth/popup-operation-not-supported":
            "Popup authentication is not supported by this browser.",

        "auth/unauthorized-domain":
            "This domain is not authorized in your Firebase Authentication settings.",

        "auth/internal-error":
            "Firebase encountered an internal error. Please try again.",

        "auth/provider-already-linked":
            "This sign-in method is already linked to your account.",

        "auth/requires-recent-login":
            "Please sign in again before connecting this account.",

        "auth/user-mismatch":
            "The selected account does not match the existing Collab account.",

        "auth/operation-not-supported-in-this-environment":
            "This authentication operation is not supported in the current browser environment."
    };

    return (
        messages[error?.code] ||
        error?.message ||
        "Authentication failed. Please try again."
    );
}


// ============================================================
// EMAIL ACTION CODE SETTINGS
// ============================================================

function createActionCodeSettings() {
    const callbackUrl = new URL(
        window.location.href
    );

    /*
     * Keep the return URL so that the user can be sent back
     * to the page they originally wanted to access.
     */

    return {
        url: callbackUrl.toString(),
        handleCodeInApp: true
    };
}


// ============================================================
// EMAIL LOGIN LINK
// ============================================================

async function sendEmailLoginLink(email) {
    const normalizedEmail = email
        .trim()
        .toLowerCase();

    await sendSignInLinkToEmail(
        auth,
        normalizedEmail,
        createActionCodeSettings()
    );

    window.localStorage.setItem(
        EMAIL_STORAGE_KEY,
        normalizedEmail
    );
}


// ============================================================
// EMAIL VALIDATION
// ============================================================

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// ============================================================
// USER HELPERS
// ============================================================

function getInitials(name) {
    if (!name) {
        return "CU";
    }

    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 1) {
        return parts[0]
            .slice(0, 2)
            .toUpperCase();
    }

    return (
        parts[0][0] +
        parts[parts.length - 1][0]
    ).toUpperCase();
}


function getCurrentRegistrationData() {
    return {
        name:
            regNameInput?.value.trim() || "",

        workspace:
            regWorkspaceInput?.value.trim() || "",

        role:
            regRoleInput?.value || ""
    };
}


// ============================================================
// BUILD USER PROFILE
// ============================================================

function buildUserProfile(
    firebaseUser,
    extraProfile = {}
) {
    const displayName =
        extraProfile.name ||
        firebaseUser.displayName ||
        firebaseUser.email?.split("@")[0] ||
        "Collab User";

    const email =
        firebaseUser.email ||
        extraProfile.email ||
        "";

    return {
        uid: firebaseUser.uid,

        name: displayName,

        email,

        initials: getInitials(displayName),

        workspace:
            extraProfile.workspace || "",

        role:
            extraProfile.role || "",

        photoURL:
            firebaseUser.photoURL || "",

        provider:
            firebaseUser.providerData?.[0]?.providerId ||
            "passwordless",

        emailVerified:
            firebaseUser.emailVerified,

        createdAt:
            extraProfile.createdAt ||
            new Date().toISOString(),

        lastLoginAt:
            new Date().toISOString()
    };
}


// ============================================================
// SAVE AUTHENTICATED USER
// ============================================================

function saveAuthenticatedUser(
    firebaseUser,
    extraProfile = {}
) {
    const userProfile =
        buildUserProfile(
            firebaseUser,
            extraProfile
        );

    window.localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify(userProfile)
    );

    window.localStorage.setItem(
        LOGIN_STORAGE_KEY,
        "true"
    );

    return userProfile;
}


// ============================================================
// PENDING PROFILE
// ============================================================

async function completePendingProfile(
    firebaseUser
) {
    const pendingProfileRaw =
        window.localStorage.getItem(
            PENDING_PROFILE_KEY
        );

    if (!pendingProfileRaw) {
        return saveAuthenticatedUser(
            firebaseUser
        );
    }

    try {
        const pendingProfile =
            JSON.parse(
                pendingProfileRaw
            );

        if (
            pendingProfile.email &&
            firebaseUser.email &&
            pendingProfile.email.toLowerCase() !==
                firebaseUser.email.toLowerCase()
        ) {
            window.localStorage.removeItem(
                PENDING_PROFILE_KEY
            );

            return saveAuthenticatedUser(
                firebaseUser
            );
        }

        const profile =
            saveAuthenticatedUser(
                firebaseUser,
                {
                    name:
                        pendingProfile.name ||
                        firebaseUser.displayName ||
                        "",

                    email:
                        firebaseUser.email ||
                        pendingProfile.email ||
                        "",

                    workspace:
                        pendingProfile.workspace ||
                        "",

                    role:
                        pendingProfile.role ||
                        "",

                    createdAt:
                        pendingProfile.createdAt ||
                        new Date().toISOString()
                }
            );

        window.localStorage.removeItem(
            PENDING_PROFILE_KEY
        );

        return profile;

    } catch (error) {
        console.error(
            "Unable to process pending profile:",
            error
        );

        window.localStorage.removeItem(
            PENDING_PROFILE_KEY
        );

        return saveAuthenticatedUser(
            firebaseUser
        );
    }
}


// ============================================================
// EMAIL LINK SIGN-IN
// ============================================================

async function completeEmailLinkSignIn() {
    if (
        !isSignInWithEmailLink(
            auth,
            window.location.href
        )
    ) {
        return null;
    }

    let email =
        window.localStorage.getItem(
            EMAIL_STORAGE_KEY
        );

    if (!email) {
        email = window.prompt(
            "Please enter the email address used to request this sign-in link."
        );
    }

    if (!email) {
        throw new Error(
            "An email address is required to complete sign in."
        );
    }

    email =
        email.trim().toLowerCase();

    if (!isValidEmail(email)) {
        throw new Error(
            "The email address entered is not valid."
        );
    }

    const result =
        await signInWithEmailLink(
            auth,
            email,
            window.location.href
        );

    window.localStorage.removeItem(
        EMAIL_STORAGE_KEY
    );

    return result;
}


async function handleEmailLinkOnLoad() {
    if (
        !isSignInWithEmailLink(
            auth,
            window.location.href
        )
    ) {
        return;
    }

    authFlowInProgress = true;

    try {
        const result =
            await completeEmailLinkSignIn();

        if (!result?.user) {
            return;
        }

        await completePendingProfile(
            result.user
        );

        showSuccessToast(
            "Authentication successful."
        );

        setTimeout(() => {
            redirectAfterLogin();
        }, 700);

    } catch (error) {
        console.error(
            "Email link completion failed:",
            error
        );

        const message =
            getFirebaseErrorMessage(
                error
            );

        showAlert(
            signinErrorAlert,
            message
        );

        showErrorToast(message);

    } finally {
        authFlowInProgress = false;
    }
}


// ============================================================
// PROVIDER NAME
// ============================================================

function getProviderDisplayName(
    providerId
) {
    const providers = {
        "google.com": "Google",
        "github.com": "GitHub",
        "microsoft.com": "Microsoft",
        "password": "email",
        "emailLink": "email"
    };

    return (
        providers[providerId] ||
        "another sign-in method"
    );
}


// ============================================================
// CREATE PROVIDER FROM PROVIDER ID
// ============================================================

function createProviderFromId(
    providerId
) {
    switch (providerId) {
        case "google.com": {
            const provider =
                new GoogleAuthProvider();

            provider.setCustomParameters({
                prompt: "select_account"
            });

            return provider;
        }

        case "github.com":
            return new GithubAuthProvider();

        case "microsoft.com": {
            const provider =
                new OAuthProvider(
                    "microsoft.com"
                );

            provider.setCustomParameters({
                prompt: "select_account"
            });

            return provider;
        }

        default:
            return null;
    }
}


// ============================================================
// RECOVER ORIGINAL OAUTH CREDENTIAL
// ============================================================

function recoverCredentialFromError(
    error,
    attemptedProviderId
) {
    try {
        switch (attemptedProviderId) {
            case "google.com":
                return GoogleAuthProvider.credentialFromError(
                    error
                );

            case "github.com":
                return GithubAuthProvider.credentialFromError(
                    error
                );

            case "microsoft.com":
                return OAuthProvider.credentialFromError(
                    error
                );

            default:
                return null;
        }
    } catch (credentialError) {
        console.warn(
            "Unable to recover OAuth credential:",
            credentialError
        );

        return null;
    }
}


// ============================================================
// FIND EXISTING SIGN-IN METHODS
// ============================================================

async function getExistingSignInMethods(
    email
) {
    try {
        const methods =
            await fetchSignInMethodsForEmail(
                auth,
                email
            );

        if (Array.isArray(methods)) {
            return methods;
        }

        return [];

    } catch (error) {
        /*
         * Email Enumeration Protection can prevent Firebase
         * from revealing the existing providers.
         */

        console.warn(
            "Firebase did not reveal existing sign-in methods:",
            error
        );

        return [];
    }
}


// ============================================================
// HANDLE ACCOUNT EXISTS WITH DIFFERENT CREDENTIAL
// ============================================================

async function handleAccountExistsWithDifferentCredential(
    error,
    attemptedProviderId,
    isRegisterMode
) {
    const email =
        error?.customData?.email ||
        error?.customData?.emailAddress;

    const activeAlert =
        isRegisterMode
            ? registerErrorAlert
            : signinErrorAlert;

    if (!email) {
        showAlert(
            activeAlert,
            "This email is already associated with a Collab account. Please sign in using the method originally connected to the account."
        );

        return null;
    }

    const normalizedEmail =
        email.trim().toLowerCase();

    const attemptedProviderName =
        getProviderDisplayName(
            attemptedProviderId
        );

    console.log(
        "Firebase account conflict:",
        {
            email: normalizedEmail,
            attemptedProvider: attemptedProviderId
        }
    );


    // ========================================================
    // RECOVER ORIGINAL CREDENTIAL
    // ========================================================

    const pendingCredential =
        recoverCredentialFromError(
            error,
            attemptedProviderId
        );

    if (!pendingCredential) {
        console.warn(
            "Firebase did not provide a recoverable credential for:",
            attemptedProviderId
        );
    }


    // ========================================================
    // ASK FIREBASE WHICH PROVIDER OWNS THE EMAIL
    // ========================================================

    const signInMethods =
        await getExistingSignInMethods(
            normalizedEmail
        );

    console.log(
        "Existing Firebase sign-in methods:",
        signInMethods
    );


    // ========================================================
    // IMPORTANT:
    //
    // If Firebase returns [] we CANNOT assume that the account
    // does not exist.
    //
    // Email Enumeration Protection can intentionally hide the
    // existing provider.
    // ========================================================

    if (signInMethods.length === 0) {
        showAlert(
            activeAlert,
            `The email ${normalizedEmail} is already associated with a Collab account. Firebase is not revealing which sign-in method is connected to that account. Please use the sign-in method you originally used for this email.`
        );

        showErrorToast(
            "This email already has a Collab account."
        );

        return null;
    }


    // ========================================================
    // EMAIL / PASSWORD / EMAIL LINK ACCOUNT
    // ========================================================

    const hasEmailAuthentication =
        signInMethods.includes("password") ||
        signInMethods.includes("emailLink");

    if (hasEmailAuthentication) {
        showAlert(
            activeAlert,
            `This email already has a Collab account using email authentication. We will send a secure login link to ${normalizedEmail}. Sign in with that link first, then connect ${attemptedProviderName}.`,
            "info"
        );

        try {
            await sendEmailLoginLink(
                normalizedEmail
            );

            showSuccessToast(
                "A secure login link has been sent to your email."
            );

        } catch (emailError) {
            console.error(
                "Unable to send existing-account email link:",
                emailError
            );

            const message =
                getFirebaseErrorMessage(
                    emailError
                );

            showAlert(
                activeAlert,
                message
            );

            showErrorToast(message);
        }

        return null;
    }


    // ========================================================
    // FIND EXISTING SOCIAL PROVIDER
    // ========================================================

    const existingProviderId =
        signInMethods.find(providerId =>
            [
                "google.com",
                "github.com",
                "microsoft.com"
            ].includes(providerId)
        );


    if (!existingProviderId) {
        const existingProviderName =
            getProviderDisplayName(
                signInMethods[0]
            );

        showAlert(
            activeAlert,
            `This email already has a Collab account using ${existingProviderName}. Please sign in using ${existingProviderName} first.`
        );

        showErrorToast(
            `Please sign in using ${existingProviderName}.`
        );

        return null;
    }


    // ========================================================
    // EXISTING PROVIDER
    // ========================================================

    const existingProvider =
        createProviderFromId(
            existingProviderId
        );

    if (!existingProvider) {
        showAlert(
            activeAlert,
            "The existing authentication provider could not be identified."
        );

        return null;
    }

    const existingProviderName =
        getProviderDisplayName(
            existingProviderId
        );


    // ========================================================
    // SAME PROVIDER
    // ========================================================

    if (
        existingProviderId ===
        attemptedProviderId
    ) {
        showAlert(
            activeAlert,
            `This ${existingProviderName} account already exists. Continue with ${existingProviderName}.`,
            "info"
        );

        try {
            const existingResult =
                await signInWithPopup(
                    auth,
                    existingProvider
                );

            if (!existingResult?.user) {
                return null;
            }

            await completePendingProfile(
                existingResult.user
            );

            saveAuthenticatedUser(
                existingResult.user
            );

            showSuccessToast(
                `${existingProviderName} sign-in successful.`
            );

            setTimeout(() => {
                redirectAfterLogin();
            }, 500);

            return existingResult.user;

        } catch (existingError) {
            if (
                existingError?.code ===
                "auth/popup-closed-by-user"
            ) {
                showAlert(
                    activeAlert,
                    `${existingProviderName} sign-in was cancelled.`
                );

                return null;
            }

            throw existingError;
        }
    }


    // ========================================================
    // SIGN IN TO THE EXISTING ACCOUNT
    // ========================================================

    showAlert(
        activeAlert,
        `This email is already connected to ${existingProviderName}. Continue with ${existingProviderName} to access your existing Collab account and connect ${attemptedProviderName}.`,
        "info"
    );

    showSuccessToast(
        `Continue with ${existingProviderName}.`
    );


    try {
        const existingResult =
            await signInWithPopup(
                auth,
                existingProvider
            );

        if (!existingResult?.user) {
            return null;
        }


        // ====================================================
        // VERIFY EMAIL MATCH
        // ====================================================

        const existingEmail =
            existingResult.user.email
                ?.trim()
                .toLowerCase();

        if (
            !existingEmail ||
            existingEmail !== normalizedEmail
        ) {
            await auth.signOut();

            throw new Error(
                `The ${existingProviderName} account you selected does not match ${normalizedEmail}.`
            );
        }


        // ====================================================
        // LINK ORIGINAL SOCIAL CREDENTIAL
        // ====================================================

        if (pendingCredential) {
            try {
                await linkWithCredential(
                    existingResult.user,
                    pendingCredential
                );

                console.log(
                    `${attemptedProviderName} successfully linked to the existing ${existingProviderName} account.`
                );

                showSuccessToast(
                    `${attemptedProviderName} has been connected to your existing Collab account.`
                );

            } catch (linkError) {
                console.error(
                    "Provider linking failed:",
                    linkError
                );

                if (
                    linkError?.code ===
                    "auth/provider-already-linked"
                ) {
                    showSuccessToast(
                        `${attemptedProviderName} is already connected to your Collab account.`
                    );

                } else if (
                    linkError?.code ===
                    "auth/credential-already-in-use"
                ) {
                    showAlert(
                        activeAlert,
                        `The ${attemptedProviderName} account is already connected to another Collab account. Firebase will not merge the two accounts automatically.`
                    );

                    showErrorToast(
                        `${attemptedProviderName} is already connected to another account.`
                    );

                    return null;

                } else {
                    throw linkError;
                }
            }

        } else {
            /*
             * We successfully authenticated the existing account,
             * but Firebase did not give us the original credential.
             *
             * Never fake a link and never store OAuth credentials
             * in localStorage.
             */

            console.warn(
                "No OAuth credential available for automatic linking."
            );

            showAlert(
                activeAlert,
                `You are signed in to your existing ${existingProviderName} account. Firebase did not provide the ${attemptedProviderName} credential needed to link it automatically.`,
                "info"
            );
        }


        // ====================================================
        // SAVE USER
        // ====================================================

        await completePendingProfile(
            existingResult.user
        );

        saveAuthenticatedUser(
            existingResult.user
        );


        // ====================================================
        // REDIRECT
        // ====================================================

        setTimeout(() => {
            redirectAfterLogin();
        }, 700);

        return existingResult.user;

    } catch (popupError) {
        if (
            popupError?.code ===
            "auth/popup-closed-by-user"
        ) {
            showAlert(
                activeAlert,
                `${existingProviderName} sign-in was cancelled.`
            );

            return null;
        }

        if (
            popupError?.code ===
            "auth/popup-blocked"
        ) {
            showAlert(
                activeAlert,
                `Your browser blocked the ${existingProviderName} sign-in popup. Please allow popups for Collab and try again.`
            );

            showErrorToast(
                "Please allow authentication popups and try again."
            );

            return null;
        }

        console.error(
            "Existing account authentication failed:",
            popupError
        );

        throw popupError;
    }
}


// ============================================================
// EMAIL SIGN-IN
// ============================================================

async function handleSignin(event) {
    event.preventDefault();

    clearAllErrors();

    const email =
        signinUserInput?.value
            .trim()
            .toLowerCase() || "";

    if (!email) {
        setFieldError(
            "signin-user",
            "Please enter your email address."
        );

        showAlert(
            signinErrorAlert,
            "Please enter your email address."
        );

        signinUserInput?.focus();

        return;
    }

    if (!isValidEmail(email)) {
        setFieldError(
            "signin-user",
            "Please enter a valid email address."
        );

        showAlert(
            signinErrorAlert,
            "Please enter a valid email address."
        );

        signinUserInput?.focus();

        return;
    }

    setButtonLoading(
        signinSubmitBtn,
        true,
        "Sending...",
        "Send Secure Login Link"
    );

    try {
        await sendEmailLoginLink(
            email
        );

        showAlert(
            signinErrorAlert,
            `A secure login link has been sent to ${email}. Check your inbox/spam and click the link to continue.`,
            "success"
        );

        showSuccessToast(
            "Secure login link sent to your email."
        );

    } catch (error) {
        console.error(
            "Email link sign-in error:",
            error
        );

        const message =
            getFirebaseErrorMessage(
                error
            );

        showAlert(
            signinErrorAlert,
            message
        );

        showErrorToast(message);

    } finally {
        setButtonLoading(
            signinSubmitBtn,
            false,
            "Sending...",
            "Send Secure Login Link"
        );
    }
}


// ============================================================
// REGISTRATION
// ============================================================

async function handleRegister(event) {
    event.preventDefault();

    clearAllErrors();

    const name =
        regNameInput?.value.trim() ||
        "";

    const email =
        regEmailInput?.value
            .trim()
            .toLowerCase() ||
        "";

    const workspace =
        regWorkspaceInput?.value.trim() ||
        "";

    const role =
        regRoleInput?.value ||
        "";

    let hasError = false;
    let firstInvalid = null;


    if (!name) {
        setFieldError(
            "reg-name",
            "Please enter your full name."
        );

        hasError = true;
        firstInvalid ||= regNameInput;
    }


    if (!email) {
        setFieldError(
            "reg-email",
            "Please enter your email address."
        );

        hasError = true;
        firstInvalid ||= regEmailInput;

    } else if (!isValidEmail(email)) {
        setFieldError(
            "reg-email",
            "Please enter a valid email address."
        );

        hasError = true;
        firstInvalid ||= regEmailInput;
    }


    if (!workspace) {
        setFieldError(
            "reg-workspace",
            "Please enter your workspace name."
        );

        hasError = true;
        firstInvalid ||= regWorkspaceInput;
    }


    if (!role) {
        setFieldError(
            "reg-role",
            "Please select your role."
        );

        hasError = true;
        firstInvalid ||= regRoleInput;
    }


    if (hasError) {
        showAlert(
            registerErrorAlert,
            "Please complete all required fields."
        );

        showErrorToast(
            "Please complete all required fields."
        );

        firstInvalid?.focus();

        return;
    }


    const pendingProfile = {
        name,
        email,
        workspace,
        role,
        createdAt:
            new Date().toISOString()
    };


    setButtonLoading(
        registerSubmitBtn,
        true,
        "Sending...",
        "Register & Create Workspace"
    );


    try {
        window.localStorage.setItem(
            PENDING_PROFILE_KEY,
            JSON.stringify(
                pendingProfile
            )
        );

        await sendEmailLoginLink(
            email
        );

        showAlert(
            registerErrorAlert,
            `Your secure registration link has been sent to ${email}. Check your inbox and click the link to complete your account setup.`,
            "success"
        );

        showSuccessToast(
            "Registration link sent to your email."
        );

    } catch (error) {
        console.error(
            "Registration error:",
            error
        );

        window.localStorage.removeItem(
            PENDING_PROFILE_KEY
        );

        const message =
            getFirebaseErrorMessage(
                error
            );

        showAlert(
            registerErrorAlert,
            message
        );

        showErrorToast(message);

    } finally {
        setButtonLoading(
            registerSubmitBtn,
            false,
            "Sending...",
            "Register & Create Workspace"
        );
    }
}


// ============================================================
// SOCIAL AUTHENTICATION
// ============================================================

async function signInWithProvider(
    provider,
    providerId
) {
    if (authFlowInProgress) {
        return;
    }

    authFlowInProgress = true;

    const isRegisterMode =
        formRegister?.classList.contains(
            "active"
        );

    const providerName =
        getProviderDisplayName(
            providerId
        );

    const activeAlert =
        isRegisterMode
            ? registerErrorAlert
            : signinErrorAlert;

    try {
        const result =
            await signInWithPopup(
                auth,
                provider
            );

        if (!result?.user) {
            return;
        }


        // ====================================================
        // REGISTRATION PROFILE
        // ====================================================

        let extraProfile = {};

        if (isRegisterMode) {
            extraProfile =
                getCurrentRegistrationData();

            extraProfile.email =
                result.user.email || "";

            const pendingProfile = {
                ...extraProfile,
                createdAt:
                    new Date().toISOString()
            };

            window.localStorage.setItem(
                PENDING_PROFILE_KEY,
                JSON.stringify(
                    pendingProfile
                )
            );
        }


        // ====================================================
        // COMPLETE PROFILE
        // ====================================================

        await completePendingProfile(
            result.user
        );


        // ====================================================
        // SAVE USER
        // ====================================================

        if (isRegisterMode) {
            saveAuthenticatedUser(
                result.user,
                {
                    ...extraProfile,
                    createdAt:
                        new Date().toISOString()
                }
            );
        } else {
            saveAuthenticatedUser(
                result.user
            );
        }


        showSuccessToast(
            `${providerName} authentication successful.`
        );


        setTimeout(() => {
            redirectAfterLogin();
        }, 500);

    } catch (error) {
        console.error(
            `${providerName} authentication error:`,
            error
        );


        // ====================================================
        // ACCOUNT EXISTS WITH DIFFERENT CREDENTIAL
        // ====================================================

        if (
            error?.code ===
            "auth/account-exists-with-different-credential"
        ) {
            try {
                await handleAccountExistsWithDifferentCredential(
                    error,
                    providerId,
                    isRegisterMode
                );

                return;

            } catch (linkError) {
                console.error(
                    "Existing account linking flow failed:",
                    linkError
                );

                const message =
                    getFirebaseErrorMessage(
                        linkError
                    );

                showAlert(
                    activeAlert,
                    message
                );

                showErrorToast(
                    message
                );

                return;
            }
        }


        // ====================================================
        // POPUP CLOSED
        // ====================================================

        if (
            error?.code ===
            "auth/popup-closed-by-user"
        ) {
            return;
        }


        // ====================================================
        // POPUP BLOCKED
        // ====================================================

        if (
            error?.code ===
            "auth/popup-blocked"
        ) {
            const message =
                `Your browser blocked the ${providerName} sign-in popup. Please allow popups for Collab and try again.`;

            showAlert(
                activeAlert,
                message
            );

            showErrorToast(
                message
            );

            return;
        }


        // ====================================================
        // UNAUTHORIZED DOMAIN
        // ====================================================

        if (
            error?.code ===
            "auth/unauthorized-domain"
        ) {
            const message =
                "This AI Studio domain is not authorized in your Firebase Authentication settings.";

            showAlert(
                activeAlert,
                message
            );

            showErrorToast(
                message
            );

            return;
        }


        // ====================================================
        // NORMAL FIREBASE ERROR
        // ====================================================

        const message =
            getFirebaseErrorMessage(
                error
            );

        showAlert(
            activeAlert,
            message
        );

        showErrorToast(
            message
        );

    } finally {
        authFlowInProgress = false;
    }
}


// ============================================================
// SOCIAL PROVIDERS
// ============================================================

function setupSocialButtons() {
    const googleProvider =
        new GoogleAuthProvider();

    googleProvider.setCustomParameters({
        prompt: "select_account"
    });


    const githubProvider =
        new GithubAuthProvider();


    const microsoftProvider =
        new OAuthProvider(
            "microsoft.com"
        );

    microsoftProvider.setCustomParameters({
        prompt: "select_account"
    });


    // ========================================================
    // GOOGLE SIGN IN
    // ========================================================

    googleSigninBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            signInWithProvider(
                googleProvider,
                "google.com"
            );
        }
    );


    // ========================================================
    // GITHUB SIGN IN
    // ========================================================

    githubSigninBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            signInWithProvider(
                githubProvider,
                "github.com"
            );
        }
    );


    // ========================================================
    // MICROSOFT SIGN IN
    // ========================================================

    microsoftSigninBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            signInWithProvider(
                microsoftProvider,
                "microsoft.com"
            );
        }
    );


    // ========================================================
    // GOOGLE REGISTER
    // ========================================================

    googleRegisterBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            signInWithProvider(
                googleProvider,
                "google.com"
            );
        }
    );


    // ========================================================
    // GITHUB REGISTER
    // ========================================================

    githubRegisterBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            signInWithProvider(
                githubProvider,
                "github.com"
            );
        }
    );


    // ========================================================
    // MICROSOFT REGISTER
    // ========================================================

    microsoftRegisterBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();

            signInWithProvider(
                microsoftProvider,
                "microsoft.com"
            );
        }
    );
}


// ============================================================
// INPUT EVENTS
// ============================================================

function setupInputEvents() {
    [
        "signin-user",
        "reg-name",
        "reg-email",
        "reg-workspace",
        "reg-role"
    ].forEach(id => {
        const element =
            document.querySelector(
                `#${id}`
            );

        if (!element) {
            return;
        }

        element.addEventListener(
            "input",
            () => {
                clearFieldError(id);
            }
        );

        element.addEventListener(
            "change",
            () => {
                clearFieldError(id);
            }
        );
    });
}


// ============================================================
// TAB EVENTS
// ============================================================

function setupTabs() {
    tabSignin?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            switchTab("signin");
        }
    );

    tabRegister?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            switchTab("register");
        }
    );
}


// ============================================================
// FORM EVENTS
// ============================================================

function setupForms() {
    formSignin?.addEventListener(
        "submit",
        handleSignin
    );

    formRegister?.addEventListener(
        "submit",
        handleRegister
    );
}


// ============================================================
// INITIAL TAB
// ============================================================

function initializeTabFromUrl() {
    const params =
        new URLSearchParams(
            window.location.search
        );

    const mode =
        (
            params.get("mode") ||
            params.get("tab") ||
            params.get("action") ||
            ""
        ).toLowerCase();

    const hash =
        window.location.hash
            .replace("#", "")
            .toLowerCase();

    const email =
        params.get("email");


    if (email) {
        try {
            const decodedEmail =
                decodeURIComponent(
                    email
                );

            if (signinUserInput) {
                signinUserInput.value =
                    decodedEmail;
            }

            if (regEmailInput) {
                regEmailInput.value =
                    decodedEmail;
            }

        } catch {
            if (signinUserInput) {
                signinUserInput.value =
                    email;
            }

            if (regEmailInput) {
                regEmailInput.value =
                    email;
            }
        }
    }


    if (
        mode === "register" ||
        mode === "signup" ||
        hash === "register" ||
        hash === "signup"
    ) {
        switchTab(
            "register",
            false
        );

        return;
    }


    switchTab(
        "signin",
        false
    );
}


// ============================================================
// AUTH OBSERVER
// ============================================================

function initializeAuthObserver() {
    onAuthStateChanged(
        auth,
        async user => {
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


            /*
             * Email-link authentication has its own redirect
             * handler.
             */

            const isEmailLink =
                isSignInWithEmailLink(
                    auth,
                    window.location.href
                );

            if (isEmailLink) {
                return;
            }


            /*
             * Do not redirect while an explicit authentication
             * operation is still running.
             *
             * This prevents the auth observer from redirecting
             * before the social-account linking process finishes.
             */

            if (authFlowInProgress) {
                return;
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

function initializeYear() {
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

async function initialize() {
    setupTabs();

    setupForms();

    setupInputEvents();

    setupSocialButtons();

    initializeTabFromUrl();

    initializeYear();

    /*
     * Process an incoming Firebase email-login link before
     * starting the normal auth observer.
     */

    await handleEmailLinkOnLoad();

    initializeAuthObserver();
}


initialize();