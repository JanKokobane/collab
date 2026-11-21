import {
    PENDING_PROFILE_KEY,
    USER_STORAGE_KEY,
    LOGIN_STORAGE_KEY,
    regNameInput,
    regEmailInput,
    regPhoneCountryInput,
    regPhoneInput,
    regWorkspaceInput,
    regRoleInput,
    regCollaborationTypeInput,
    regCollaborationOtherInput,
    regIndustryInput
} from "./shared.js";
import { getInitials } from "./ui.js";

export function getCurrentRegistrationData() {
    const collaborationType =
        regCollaborationTypeInput?.value || "";

    return {
        name:
            regNameInput?.value.trim() || "",

        email:
            regEmailInput?.value.trim().toLowerCase() || "",

        phoneCountryCode:
            regPhoneCountryInput?.value || "",

        phoneNumber:
            regPhoneInput?.value.trim() || "",

        workspace:
            regWorkspaceInput?.value.trim() || "",

        role:
            regRoleInput?.value.trim() || "",

        collaborationType,

        collaborationDetails:
            collaborationType === "Other"
                ? regCollaborationOtherInput?.value.trim() || ""
                : "",

        industry:
            regIndustryInput?.value || ""
    };
}


// ============================================================
// BUILD USER PROFILE
// ============================================================

export function buildUserProfile(
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

        collaborationType:
            extraProfile.collaborationType || "",

        collaborationDetails:
            extraProfile.collaborationDetails || "",

        industry:
            extraProfile.industry || "",

        phoneCountryCode:
            extraProfile.phoneCountryCode || "",

        phoneNumber:
            extraProfile.phoneNumber || "",

        photoURL:
            firebaseUser.photoURL || "",

        provider:
            firebaseUser.providerData?.[0]?.providerId ||
            "password",

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

export function saveAuthenticatedUser(
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

export function saveExistingUserProfile(firebaseUser) {
    let existingProfile = null;

    try {
        existingProfile = JSON.parse(
            window.localStorage.getItem(USER_STORAGE_KEY) || "null"
        );
    } catch (error) {
        console.warn(
            "Unable to read the saved Collab profile:",
            error
        );
    }

    if (existingProfile?.uid === firebaseUser.uid) {
        return saveAuthenticatedUser(
            firebaseUser,
            existingProfile
        );
    }

    return saveAuthenticatedUser(firebaseUser);
}


// ============================================================
// PENDING PROFILE
// ============================================================

export async function completePendingProfile(
    firebaseUser
) {
    const pendingProfileRaw =
        window.localStorage.getItem(
            PENDING_PROFILE_KEY
        );

    if (!pendingProfileRaw) {
        return saveExistingUserProfile(firebaseUser);
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

            return saveExistingUserProfile(firebaseUser);
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

                    collaborationType:
                        pendingProfile.collaborationType ||
                        "",

                    collaborationDetails:
                        pendingProfile.collaborationDetails ||
                        "",

                    industry:
                        pendingProfile.industry ||
                        "",

                    phoneCountryCode:
                        pendingProfile.phoneCountryCode || "",

                    phoneNumber:
                        pendingProfile.phoneNumber || "",

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

        return saveExistingUserProfile(firebaseUser);
    }
}


// ============================================================
// PROVIDER NAME
// ============================================================
