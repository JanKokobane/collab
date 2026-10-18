import {
    tabSignin,
    tabRegister,
    formSignin,
    formRegister,
    heading,
    subheading,
    regNameInput,
    signinUserInput,
    signinErrorAlert,
    registerErrorAlert
} from "./shared.js";

export function getReturnUrl() {
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

export function redirectAfterLogin() {
    window.location.href = getReturnUrl();
}


// ============================================================
// TABS
// ============================================================

export function switchTab(tab, updateUrl = true) {
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
            ? "Create your account"
            : "Sign in to Collab";
    }


    if (subheading) {
        subheading.textContent = isRegister
            ? "Sign up with your email and password to access your Collab workspace."
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

export function showAlert(element, message, type = "error") {
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

export function clearAlert(element) {
    if (!element) {
        return;
    }

    element.style.display = "none";
    element.textContent = "";
}


// ============================================================
// TOASTS
// ============================================================

export function showErrorToast(message) {
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

export function showSuccessToast(message) {
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

export function setButtonLoading(
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

export function setFieldError(fieldId, message) {
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

export function clearFieldError(fieldId) {
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

export function clearAllErrors() {
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

export function getFirebaseErrorMessage(error) {
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

        "auth/invalid-credential":
            "The email address or password is incorrect.",

        "auth/weak-password":
            "Please choose a stronger password with at least 6 characters.",

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
// EMAIL VALIDATION
// ============================================================

export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// ============================================================
// USER HELPERS
// ============================================================

export function getInitials(name) {
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
