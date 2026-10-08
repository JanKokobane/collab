import {
    createUserWithEmailAndPassword,
    signOut,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { validatePhoneNumber } from "../../shared/phoneValidation.js";

import {
    auth,
    authFlowInProgress,
    PENDING_PROFILE_KEY,
    tabSignin,
    tabRegister,
    formSignin,
    formRegister,
    signinUserInput,
    signinPasswordInput,
    regNameInput,
    regEmailInput,
    regPhoneCountryInput,
    regPhoneInput,
    regPasswordInput,
    regPasswordConfirmInput,
    regWorkspaceInput,
    regRoleInput,
    regCollaborationTypeInput,
    regCollaborationOtherGroup,
    regCollaborationOtherInput,
    regIndustryInput,
    signinSubmitBtn,
    registerSubmitBtn,
    signinErrorAlert,
    registerErrorAlert
} from "./shared.js";

import {
    clearAllErrors,
    setFieldError,
    showAlert,
    setButtonLoading,
    isValidEmail,
    getFirebaseErrorMessage,
    showSuccessToast,
    showErrorToast,
    switchTab,
    clearFieldError,
    redirectAfterLogin
} from "./ui.js";

import {
    getCurrentRegistrationData,
    completePendingProfile
} from "./profile.js";


// ============================================================
// BACKEND API
// ============================================================

const API_BASE_URL = "https://collab-y7pb.onrender.com";


// ============================================================
// SIGN IN
// ============================================================

export async function handleSignin(event) {
    event.preventDefault();

    clearAllErrors();

    const email =
        signinUserInput?.value
            .trim()
            .toLowerCase() || "";

    const password =
        signinPasswordInput?.value || "";

    // --------------------------------------------------------
    // Validate email
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // Validate password
    // --------------------------------------------------------

    if (!password) {
        setFieldError(
            "signin-password",
            "Please enter your password."
        );

        showAlert(
            signinErrorAlert,
            "Please enter your password."
        );

        signinPasswordInput?.focus();

        return;
    }

    // --------------------------------------------------------
    // Loading state
    // --------------------------------------------------------

    setButtonLoading(
        signinSubmitBtn,
        true,
        "Signing in...",
        "Sign In"
    );

    authFlowInProgress.value = true;

    try {
        // ----------------------------------------------------
        // Firebase sign in
        // ----------------------------------------------------

        const result =
            await signInWithEmailAndPassword(
                auth,
                email,
                password
            );

        // ----------------------------------------------------
        // Complete pending profile
        // ----------------------------------------------------

        await completePendingProfile(
            result.user
        );

        showSuccessToast(
            "Sign in successful."
        );

        setTimeout(() => {
            redirectAfterLogin();
        }, 500);

    } catch (error) {
        console.error(
            "Email and password sign-in error:",
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

        showErrorToast(
            message
        );

    } finally {
        authFlowInProgress.value = false;

        setButtonLoading(
            signinSubmitBtn,
            false,
            "Signing in...",
            "Sign In"
        );
    }
}


// ============================================================
// PHONE AVAILABILITY CHECK
// ============================================================

async function checkPhoneAvailability(
    countryCode,
    phoneNumber
) {
    const response =
        await fetch(
            `${API_BASE_URL}/api/phone/check`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    countryCode,
                    phoneNumber
                })
            }
        );

    let data;

    try {
        data =
            await response.json();

    } catch {
        throw new Error(
            "The server returned an invalid response."
        );
    }

    if (!response.ok) {
        const error =
            new Error(
                data.message ||
                "Unable to check the phone number."
            );

        error.code =
            data.code;

        throw error;
    }

    return data;
}


// ============================================================
// SAVE PHONE NUMBER
// ============================================================

async function savePhoneNumber(
    user,
    countryCode,
    phoneNumber
) {
    if (!user) {
        throw new Error(
            "Firebase authentication is required."
        );
    }

    // --------------------------------------------------------
    // Get Firebase ID token
    // --------------------------------------------------------

    const idToken =
        await user.getIdToken(
            true
        );

    // --------------------------------------------------------
    // Send authenticated request
    // --------------------------------------------------------

    const response =
        await fetch(
            `${API_BASE_URL}/api/phone/save`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",

                    "Authorization":
                        `Bearer ${idToken}`
                },

                body: JSON.stringify({
                    countryCode,
                    phoneNumber
                })
            }
        );

    let data;

    try {
        data =
            await response.json();

    } catch {
        throw new Error(
            "The server returned an invalid response while saving your phone number."
        );
    }

    if (!response.ok) {
        const error =
            new Error(
                data.message ||
                "The phone number could not be saved."
            );

        error.code =
            data.code;

        error.status =
            response.status;

        throw error;
    }

    return data;
}


// ============================================================
// REGISTRATION
// ============================================================

export async function handleRegister(event) {
    event.preventDefault();

    clearAllErrors();

    const registrationData =
        getCurrentRegistrationData();

    let hasError = false;
    let firstInvalid = null;


    // ========================================================
    // REQUIRED FIELDS
    // ========================================================

    const requiredFields = [
        [
            "reg-name",
            regNameInput,
            registrationData.name,
            "Please enter your full name."
        ],

        [
            "reg-email",
            regEmailInput,
            registrationData.email,
            "Please enter your email address."
        ],

        [
            "reg-phone",
            regPhoneInput,
            registrationData.phoneNumber,
            "Please enter your phone number."
        ],

        [
            "reg-collaboration-type",
            regCollaborationTypeInput,
            registrationData.collaborationType,
            "Please choose a collaboration type."
        ],

        [
            "reg-workspace",
            regWorkspaceInput,
            registrationData.workspace,
            "Please enter your brand or company name."
        ],

        [
            "reg-role",
            regRoleInput,
            registrationData.role,
            "Please enter your role or job title."
        ],

        [
            "reg-industry",
            regIndustryInput,
            registrationData.industry,
            "Please choose your industry."
        ]
    ];


    // ========================================================
    // CHECK REQUIRED FIELDS
    // ========================================================

    for (
        const [
            fieldId,
            input,
            value,
            message
        ] of requiredFields
    ) {
        if (!value) {
            setFieldError(
                fieldId,
                message
            );

            hasError = true;

            firstInvalid ||= input;
        }
    }


    // ========================================================
    // EMAIL VALIDATION
    // ========================================================

    if (
        registrationData.email &&
        !isValidEmail(
            registrationData.email
        )
    ) {
        setFieldError(
            "reg-email",
            "Please enter a valid email address."
        );

        hasError = true;

        firstInvalid ||=
            regEmailInput;
    }


    // ========================================================
    // PHONE COUNTRY CODE
    // ========================================================

    if (
        !registrationData.phoneCountryCode
    ) {
        setFieldError(
            "reg-phone",
            "Please select your country calling code."
        );

        hasError = true;

        firstInvalid ||=
            regPhoneCountryInput;
    }


    // ========================================================
    // PHONE FORMAT VALIDATION
    // ========================================================

    if (
        registrationData.phoneNumber &&
        registrationData.phoneCountryCode
    ) {
        const phoneValidation =
            validatePhoneNumber(
                registrationData.phoneNumber,
                regPhoneCountryInput
            );

        if (!phoneValidation.valid) {
            setFieldError(
                "reg-phone",
                phoneValidation.message
            );

            hasError = true;

            firstInvalid ||=
                regPhoneInput;
        }
    }


    // ========================================================
    // PASSWORD VALIDATION
    // ========================================================

    const password =
        regPasswordInput?.value || "";

    const passwordConfirmation =
        regPasswordConfirmInput?.value || "";


    if (password.length < 6) {
        setFieldError(
            "reg-password",
            "Your password must be at least 6 characters."
        );

        hasError = true;

        firstInvalid ||=
            regPasswordInput;
    }


    if (!passwordConfirmation) {
        setFieldError(
            "reg-password-confirm",
            "Please confirm your password."
        );

        hasError = true;

        firstInvalid ||=
            regPasswordConfirmInput;

    } else if (
        password !==
        passwordConfirmation
    ) {
        setFieldError(
            "reg-password-confirm",
            "The passwords do not match."
        );

        hasError = true;

        firstInvalid ||=
            regPasswordConfirmInput;
    }


    // ========================================================
    // OTHER COLLABORATION TYPE
    // ========================================================

    if (
        registrationData.collaborationType ===
        "Other" &&
        !registrationData.collaborationDetails
    ) {
        setFieldError(
            "reg-collaboration-other",
            "Please describe your campaign or collaboration."
        );

        hasError = true;

        firstInvalid ||=
            regCollaborationOtherInput;
    }


    // ========================================================
    // STOP IF FORM VALIDATION FAILED
    // ========================================================

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


    // ========================================================
    // START REGISTRATION
    // ========================================================

    setButtonLoading(
        registerSubmitBtn,
        true,
        "Creating account...",
        "Create Account"
    );

    authFlowInProgress.value = true;

    let accountCreated = false;
    let firebaseUser = null;


    try {

        // ====================================================
        // STEP 1
        // CHECK PHONE AGAINST BACKEND
        // ====================================================

        console.log(
            "Checking phone number availability..."
        );

        const phoneCheck =
            await checkPhoneAvailability(
                registrationData.phoneCountryCode,
                registrationData.phoneNumber
            );


        // ====================================================
        // PHONE ALREADY EXISTS
        // ====================================================

        if (
            !phoneCheck.available
        ) {
            const message =
                phoneCheck.message ||
                "This phone number is already registered.";

            setFieldError(
                "reg-phone",
                message
            );

            showAlert(
                registerErrorAlert,
                message
            );

            showErrorToast(
                message
            );

            regPhoneInput?.focus();

            return;
        }


        // ====================================================
        // PHONE IS AVAILABLE
        // ====================================================

        console.log(
            "Phone number is available."
        );


        // ====================================================
        // STEP 2
        // REMOVE OLD PENDING PROFILE
        // ====================================================

        window.localStorage.removeItem(
            PENDING_PROFILE_KEY
        );


        // ====================================================
        // STEP 3
        // CREATE FIREBASE ACCOUNT
        // ====================================================

        console.log(
            "Creating Firebase account..."
        );

        const result =
            await createUserWithEmailAndPassword(
                auth,
                registrationData.email,
                password
            );

        firebaseUser =
            result.user;

        accountCreated = true;

        console.log(
            "Firebase account created:",
            firebaseUser.uid
        );


        // ====================================================
        // STEP 4
        // SAVE PHONE AGAINST FIREBASE UID
        // ====================================================

        console.log(
            "Saving phone number to backend..."
        );

        const saveResult =
            await savePhoneNumber(
                firebaseUser,
                registrationData.phoneCountryCode,
                registrationData.phoneNumber
            );

        console.log(
            "Phone number saved successfully:",
            saveResult
        );


        // ====================================================
        // STEP 5
        // SIGN OUT AFTER SUCCESSFUL REGISTRATION
        // ====================================================

        await signOut(
            auth
        );


        // ====================================================
        // STEP 6
        // PREPARE SIGN-IN FORM
        // ====================================================

        if (signinUserInput) {
            signinUserInput.value =
                registrationData.email;
        }


        // ====================================================
        // STEP 7
        // SWITCH TO SIGN-IN
        // ====================================================

        switchTab(
            "signin"
        );


        showAlert(
            signinErrorAlert,
            "Your account has been created. Please sign in to continue.",
            "success"
        );


        showSuccessToast(
            "Account created. Please sign in."
        );


    } catch (error) {

        console.error(
            "Registration error:",
            error
        );


        // ====================================================
        // PHONE DUPLICATE FROM BACKEND
        // ====================================================

        if (
            error.code ===
            "PHONE_ALREADY_EXISTS"
        ) {
            const message =
                "This phone number is already registered.";

            setFieldError(
                "reg-phone",
                message
            );

            showAlert(
                registerErrorAlert,
                message
            );

            showErrorToast(
                message
            );

            regPhoneInput?.focus();

            return;
        }


        // ====================================================
        // PHONE SAVE FAILED AFTER FIREBASE ACCOUNT CREATION
        // ====================================================

        if (
            accountCreated &&
            error.status
        ) {
            const message =
                "Your account was created, but we couldn't save your phone number. Please contact support before trying to register again.";

            console.error(
                "Firebase account was created but phone save failed:",
                error
            );

            showAlert(
                registerErrorAlert,
                message
            );

            showErrorToast(
                message
            );

            return;
        }


        // ====================================================
        // FIREBASE ACCOUNT WAS CREATED BUT SIGN-OUT FAILED
        // ====================================================

        if (
            accountCreated &&
            !error.status
        ) {
            const message =
                "Your account was created, but we couldn't complete the registration automatically. Please sign in with your new credentials.";

            if (signinUserInput) {
                signinUserInput.value =
                    registrationData.email;
            }

            switchTab(
                "signin"
            );

            showAlert(
                signinErrorAlert,
                message
            );

            showErrorToast(
                message
            );

            return;
        }


        // ====================================================
        // NORMAL FIREBASE REGISTRATION ERROR
        // ====================================================

        const message =
            getFirebaseErrorMessage(
                error
            );


        showAlert(
            registerErrorAlert,
            message
        );

        showErrorToast(
            message
        );

    } finally {

        authFlowInProgress.value =
            false;

        if (regPasswordInput) {
            regPasswordInput.value =
                "";
        }

        if (regPasswordConfirmInput) {
            regPasswordConfirmInput.value =
                "";
        }

        setButtonLoading(
            registerSubmitBtn,
            false,
            "Creating account...",
            "Create Account"
        );
    }
}


// ============================================================
// SOCIAL AUTHENTICATION / INPUT EVENTS
// ============================================================

export function setupInputEvents() {

    [
        "signin-user",
        "signin-password",
        "reg-name",
        "reg-email",
        "reg-phone",
        "reg-phone-country",
        "reg-password",
        "reg-password-confirm",
        "reg-workspace",
        "reg-role",
        "reg-collaboration-type",
        "reg-collaboration-other",
        "reg-industry"
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
                clearFieldError(
                    id
                );
            }
        );

        element.addEventListener(
            "change",
            () => {
                clearFieldError(
                    id
                );
            }
        );
    });


    // --------------------------------------------------------
    // Collaboration type
    // --------------------------------------------------------

    regCollaborationTypeInput?.addEventListener(
        "change",
        () => {

            const isOther =
                regCollaborationTypeInput.value ===
                "Other";


            if (regCollaborationOtherGroup) {
                regCollaborationOtherGroup.hidden =
                    !isOther;
            }


            if (!isOther) {

                if (
                    regCollaborationOtherInput
                ) {
                    regCollaborationOtherInput.value =
                        "";
                }

                clearFieldError(
                    "reg-collaboration-other"
                );
            }
        }
    );


    // --------------------------------------------------------
    // Phone country
    // --------------------------------------------------------

    regPhoneCountryInput?.addEventListener(
        "change",
        () => {
            clearFieldError(
                "reg-phone"
            );
        }
    );
}


// ============================================================
// PASSWORD VISIBILITY TOGGLES
// ============================================================

export function setupPasswordVisibilityToggles() {

    document
        .querySelectorAll(
            "[data-password-toggle]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const input =
                        document.getElementById(
                            button.dataset.passwordToggle
                        );


                    if (
                        !(input instanceof HTMLInputElement)
                    ) {
                        return;
                    }


                    const isVisible =
                        input.type ===
                        "text";


                    input.type =
                        isVisible
                            ? "password"
                            : "text";


                    button.setAttribute(
                        "aria-label",
                        isVisible
                            ? "Show password"
                            : "Hide password"
                    );


                    button.setAttribute(
                        "aria-pressed",
                        String(
                            !isVisible
                        )
                    );


                    const showIcon =
                        button.querySelector(
                            ".password-toggle-show"
                        );

                    const hideIcon =
                        button.querySelector(
                            ".password-toggle-hide"
                        );


                    if (
                        !showIcon ||
                        !hideIcon
                    ) {
                        return;
                    }


                    showIcon.style.display =
                        isVisible
                            ? "inline-flex"
                            : "none";


                    hideIcon.style.display =
                        isVisible
                            ? "none"
                            : "inline-flex";
                }
            );
        });
}


// ============================================================
// TAB EVENTS
// ============================================================

export function setupTabs() {

    tabSignin?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            switchTab(
                "signin"
            );
        }
    );


    tabRegister?.addEventListener(
        "click",
        event => {

            event.preventDefault();

            switchTab(
                "register"
            );
        }
    );
}


// ============================================================
// FORM EVENTS
// ============================================================

export function setupForms() {

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

export function initializeTabFromUrl() {

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


    // --------------------------------------------------------
    // Populate email from URL
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Register tab
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // Default sign-in tab
    // --------------------------------------------------------

    switchTab(
        "signin",
        false
    );
}


// ============================================================
// AUTH OBSERVER
// ============================================================

// Authentication state handling is managed by the
// shared authentication/profile modules.