import {
    signInWithPopup,
    fetchSignInMethodsForEmail,
    linkWithCredential,
    getAdditionalUserInfo,
    GoogleAuthProvider,
    GithubAuthProvider,
    OAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    auth,
    authFlowInProgress,
    signinUserInput,
    signinErrorAlert,
    registerErrorAlert,
    PROFILE_ONBOARDING_KEY,
    formRegister,
    googleSigninBtn,
    githubSigninBtn,
    microsoftSigninBtn
} from "./shared.js";
import {
    showAlert,
    showErrorToast,
    showSuccessToast,
    getFirebaseErrorMessage,
    switchTab,
    redirectAfterLogin
} from "./ui.js";
import { completePendingProfile } from "./profile.js";

export function getProviderDisplayName(
    providerId
) {
    const providers = {
        "google.com": "Google",
        "github.com": "GitHub",
        "microsoft.com": "Microsoft",
        "password": "email and password"
    };

    return (
        providers[providerId] ||
        "another sign-in method"
    );
}


// ============================================================
// CREATE PROVIDER FROM PROVIDER ID
// ============================================================

export function createProviderFromId(
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

export function recoverCredentialFromError(
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

export async function getExistingSignInMethods(
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

export async function handleAccountExistsWithDifferentCredential(
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

    if (signInMethods.includes("password")) {
        if (signinUserInput) {
            signinUserInput.value = normalizedEmail;
        }
        if (isRegisterMode) {
            switchTab("signin");
        }
        showAlert(
            isRegisterMode ? signinErrorAlert : activeAlert,
            `This email already has a Collab account using email and password. Sign in with that password first, then connect ${attemptedProviderName}.`,
            "info"
        );
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

export async function signInWithProvider(
    provider,
    providerId
) {
    if (authFlowInProgress.value) {
        return;
    }

    if (formRegister?.classList.contains("active")) {
        showAlert(
            registerErrorAlert,
            "Save your profile details, then sign in with a Firebase account."
        );
        return;
    }

    authFlowInProgress.value = true;

    const providerName =
        getProviderDisplayName(
            providerId
        );

    const activeAlert = signinErrorAlert;

    try {
        const result =
            await signInWithPopup(
                auth,
                provider
            );

        if (!result?.user) {
            return;
        }

        let savedProfile = null;
        try {
            savedProfile = JSON.parse(
                window.localStorage.getItem("collab-user") || "null"
            );
        } catch (error) {
            console.warn("Unable to check the saved profile before provider sign-in:", error);
        }
        const profileNeedsUpdate =
            savedProfile?.uid !== result.user.uid ||
            !savedProfile.name ||
            !savedProfile.workspace ||
            !savedProfile.role ||
            !savedProfile.collaborationType ||
            !savedProfile.industry ||
            !savedProfile.phoneCountryCode ||
            !savedProfile.phoneNumber;

        // ====================================================
        // COMPLETE PROFILE
        // ====================================================

        await completePendingProfile(
            result.user
        );
        if (getAdditionalUserInfo(result)?.isNewUser || profileNeedsUpdate) {
            window.localStorage.setItem(
                PROFILE_ONBOARDING_KEY,
                result.user.uid
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
                    false
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
        authFlowInProgress.value = false;
    }
}


// ============================================================
// SOCIAL PROVIDERS
// ============================================================

export function setupSocialButtons() {
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


}


// ============================================================
// INPUT EVENTS
// ============================================================
