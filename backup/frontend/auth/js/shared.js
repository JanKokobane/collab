import { firebaseAuth as auth } from "../../firebase.js";

export { auth };

export const PENDING_PROFILE_KEY = "collab-pending-user";
export const USER_STORAGE_KEY = "collab-user";
export const LOGIN_STORAGE_KEY = "collab-logged-in";
export const PROFILE_ONBOARDING_KEY = "collab-profile-onboarding-uid";
export const authFlowInProgress = { value: false };

export const tabSignin = document.querySelector("#tab-signin");
export const tabRegister = document.querySelector("#tab-register");
export const formSignin = document.querySelector("#form-signin");
export const formRegister = document.querySelector("#form-register");
export const heading = document.querySelector("#auth-heading");
export const subheading = document.querySelector("#auth-subheading");
export const signinUserInput = document.querySelector("#signin-user");
export const signinPasswordInput = document.querySelector("#signin-password");
export const regNameInput = document.querySelector("#reg-name");
export const regEmailInput = document.querySelector("#reg-email");
export const regPhoneCountryInput = document.querySelector("#reg-phone-country");
export const regPhoneInput = document.querySelector("#reg-phone");
export const regPasswordInput = document.querySelector("#reg-password");
export const regPasswordConfirmInput = document.querySelector("#reg-password-confirm");
export const regWorkspaceInput = document.querySelector("#reg-workspace");
export const regRoleInput = document.querySelector("#reg-role");
export const regCollaborationTypeInput = document.querySelector("#reg-collaboration-type");
export const regCollaborationOtherGroup = document.querySelector("#group-reg-collaboration-other");
export const regCollaborationOtherInput = document.querySelector("#reg-collaboration-other");
export const regIndustryInput = document.querySelector("#reg-industry");
export const signinSubmitBtn = document.querySelector("#signin-submit-btn");
export const registerSubmitBtn = document.querySelector("#register-submit-btn");
export const signinErrorAlert = document.querySelector("#signin-error-alert");
export const registerErrorAlert = document.querySelector("#register-error-alert");
export const googleSigninBtn = document.querySelector("#google-signin-btn");
export const githubSigninBtn = document.querySelector("#github-signin-btn");
export const microsoftSigninBtn = document.querySelector("#microsoft-signin-btn");
