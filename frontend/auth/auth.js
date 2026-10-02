import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
    getAuth,
    sendSignInLinkToEmail,
    isSignInWithEmailLink,
    signInWithEmailLink,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    GithubAuthProvider,
    OAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

const EMAIL_STORAGE_KEY = "emailForSignIn";
const PENDING_PROFILE_KEY = "collab-pending-user";
const USER_STORAGE_KEY = "collab-user";
const LOGIN_STORAGE_KEY = "collab-logged-in";

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

function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get("return");

    if (!returnUrl) {
        return "../dashboard/dashboard.html";
    }

    if (returnUrl.startsWith("http://") || returnUrl.startsWith("https://")) {
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

    if (returnUrl.startsWith("/") || returnUrl.startsWith("../") || returnUrl.startsWith("./")) {
        return returnUrl;
    }

    return "../dashboard/dashboard.html";
}

function redirectAfterLogin() {
    window.location.href = getReturnUrl();
}

function switchTab(tab, updateUrl = true) {
    const isRegister = tab === "register";

    clearAllErrors();

    tabSignin?.classList.toggle("active", !isRegister);
    tabRegister?.classList.toggle("active", isRegister);

    tabSignin?.setAttribute("aria-selected", String(!isRegister));
    tabRegister?.setAttribute("aria-selected", String(isRegister));

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

function showAlert(element, message, type = "error") {
    if (!element) {
        return;
    }

    element.textContent = message;
    element.style.display = "flex";

    if (type === "success") {
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

function setButtonLoading(button, loading, loadingText, normalText) {
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

function setFieldError(fieldId, message) {
    const group = document.querySelector(`#group-${fieldId}`);
    const errorElement = document.querySelector(`#${fieldId}-error`);

    group?.classList.add("has-error");

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add("visible");
    }
}

function clearFieldError(fieldId) {
    const group = document.querySelector(`#group-${fieldId}`);
    const errorElement = document.querySelector(`#${fieldId}-error`);

    group?.classList.remove("has-error");

    if (errorElement) {
        errorElement.textContent = "";
        errorElement.classList.remove("visible");
    }
}

function clearAllErrors() {
    document.querySelectorAll(".input-group").forEach(group => {
        group.classList.remove("has-error");
    });

    document.querySelectorAll(".field-error-msg").forEach(element => {
        element.textContent = "";
        element.classList.remove("visible");
    });

    clearAlert(signinErrorAlert);
    clearAlert(registerErrorAlert);
}

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
            "An account already exists with this email using a different sign-in method.",

        "auth/credential-already-in-use":
            "This authentication account is already linked to another user.",

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
            "Firebase encountered an internal error. Please try again."
    };

    return (
        messages[error?.code] ||
        error?.message ||
        "Authentication failed. Please try again."
    );
}

function createActionCodeSettings() {
    const callbackUrl = new URL(
        window.location.pathname,
        window.location.origin
    );

    return {
        url: callbackUrl.toString(),
        handleCodeInApp: true
    };
}

async function sendEmailLoginLink(email) {
    const normalizedEmail = email.trim().toLowerCase();

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

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getInitials(name) {
    if (!name) {
        return "CU";
    }

    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return (
        parts[0][0] +
        parts[parts.length - 1][0]
    ).toUpperCase();
}

function getCurrentRegistrationData() {
    return {
        name: regNameInput?.value.trim() || "",
        workspace: regWorkspaceInput?.value.trim() || "",
        role: regRoleInput?.value || ""
    };
}

function buildUserProfile(firebaseUser, extraProfile = {}) {
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
        workspace: extraProfile.workspace || "",
        role: extraProfile.role || "",
        photoURL: firebaseUser.photoURL || "",
        provider: firebaseUser.providerData?.[0]?.providerId || "passwordless",
        emailVerified: firebaseUser.emailVerified,
        createdAt: extraProfile.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    };
}

function saveAuthenticatedUser(firebaseUser, extraProfile = {}) {
    const userProfile = buildUserProfile(
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

async function completePendingProfile(firebaseUser) {
    const pendingProfileRaw =
        window.localStorage.getItem(
            PENDING_PROFILE_KEY
        );

    if (!pendingProfileRaw) {
        return saveAuthenticatedUser(firebaseUser);
    }

    try {
        const pendingProfile =
            JSON.parse(pendingProfileRaw);

        if (
            pendingProfile.email &&
            firebaseUser.email &&
            pendingProfile.email.toLowerCase() !==
                firebaseUser.email.toLowerCase()
        ) {
            return saveAuthenticatedUser(firebaseUser);
        }

        const profile = saveAuthenticatedUser(
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
                    pendingProfile.workspace || "",
                role:
                    pendingProfile.role || "",
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

        return saveAuthenticatedUser(
            firebaseUser
        );
    }
}

async function handleSignin(event) {
    event.preventDefault();

    clearAllErrors();

    const email =
        signinUserInput?.value.trim().toLowerCase() || "";

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
        await sendEmailLoginLink(email);

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
            getFirebaseErrorMessage(error);

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

async function handleRegister(event) {
    event.preventDefault();

    clearAllErrors();

    const name =
        regNameInput?.value.trim() || "";

    const email =
        regEmailInput?.value.trim().toLowerCase() || "";

    const workspace =
        regWorkspaceInput?.value.trim() || "";

    const role =
        regRoleInput?.value || "";

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
        createdAt: new Date().toISOString()
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
            JSON.stringify(pendingProfile)
        );

        await sendEmailLoginLink(email);

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
            getFirebaseErrorMessage(error);

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

    email = email.trim().toLowerCase();

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
            getFirebaseErrorMessage(error);

        showAlert(
            signinErrorAlert,
            message
        );

        showErrorToast(message);
    }
}

async function signInWithProvider(provider) {
    const isRegisterMode =
        formRegister?.classList.contains("active");

    try {
        const result =
            await signInWithPopup(
                auth,
                provider
            );

        if (!result?.user) {
            return;
        }

        let extraProfile = {};

        if (isRegisterMode) {
            extraProfile =
                getCurrentRegistrationData();

            extraProfile.email =
                result.user.email || "";
        }

        await completePendingProfile(
            result.user
        );

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
            "Authentication successful."
        );

        setTimeout(() => {
            redirectAfterLogin();
        }, 500);
    } catch (error) {
        console.error(
            "Social authentication error:",
            error
        );

        const message =
            getFirebaseErrorMessage(error);

        const activeAlert =
            isRegisterMode
                ? registerErrorAlert
                : signinErrorAlert;

        showAlert(
            activeAlert,
            message
        );

        showErrorToast(message);
    }
}

function setupSocialButtons() {
    const googleProvider =
        new GoogleAuthProvider();

    const githubProvider =
        new GithubAuthProvider();

    const microsoftProvider =
        new OAuthProvider(
            "microsoft.com"
        );

    googleSigninBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            signInWithProvider(
                googleProvider
            );
        }
    );

    githubSigninBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            signInWithProvider(
                githubProvider
            );
        }
    );

    microsoftSigninBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            signInWithProvider(
                microsoftProvider
            );
        }
    );

    googleRegisterBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            signInWithProvider(
                googleProvider
            );
        }
    );

    githubRegisterBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            signInWithProvider(
                githubProvider
            );
        }
    );

    microsoftRegisterBtn?.addEventListener(
        "click",
        event => {
            event.preventDefault();
            signInWithProvider(
                microsoftProvider
            );
        }
    );
}

function setupInputEvents() {
    [
        "signin-user",
        "reg-name",
        "reg-email",
        "reg-workspace",
        "reg-role"
    ].forEach(id => {
        const element =
            document.querySelector(`#${id}`);

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
                decodeURIComponent(email);

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

function initializeAuthObserver() {
    onAuthStateChanged(
        auth,
        async user => {
            if (!user) {
                return;
            }

            await completePendingProfile(
                user
            );

            const isEmailLink =
                isSignInWithEmailLink(
                    auth,
                    window.location.href
                );

            if (isEmailLink) {
                return;
            }

            const params =
                new URLSearchParams(
                    window.location.search
                );

            if (params.has("return")) {
                redirectAfterLogin();
            }
        }
    );
}

function initializeYear() {
    document
        .querySelectorAll(".current-year")
        .forEach(element => {
            element.textContent =
                new Date().getFullYear();
        });
}

async function initialize() {
    setupTabs();
    setupForms();
    setupInputEvents();
    setupSocialButtons();
    initializeTabFromUrl();
    initializeYear();

    await handleEmailLinkOnLoad();
    initializeAuthObserver();
}

initialize();