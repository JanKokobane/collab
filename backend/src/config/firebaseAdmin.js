const admin = require('firebase-admin');
const fs = require('node:fs');
const path = require('node:path');

let initialized = false;

const initializeFirebaseAdmin = () => {
    if (initialized) {
        return admin.app();
    }

    if (admin.apps.length > 0) {
        initialized = true;
        return admin.app();
    }

    const clientEmail =
        process.env.FIREBASE_CLIENT_EMAIL;

    const privateKey =
        process.env.FIREBASE_PRIVATE_KEY
            ?.replace(/\\n/g, '\n');

    if (Boolean(clientEmail) !== Boolean(privateKey)) {
        throw new Error(
            'Both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be configured.'
        );
    }

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
        ? path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
        : path.resolve(__dirname, '../../serviceAccountKey.json');
    let credential;
    let credentialProjectId;

    const hasValidPemKey = Boolean(
        privateKey &&
        privateKey.includes('BEGIN') &&
        privateKey.includes('PRIVATE KEY')
    );

    try {
        if (clientEmail && hasValidPemKey) {
            credential = admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail,
                privateKey
            });
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
            credential = admin.credential.applicationDefault();
        } else if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            credential = admin.credential.cert(serviceAccount);
            credentialProjectId = serviceAccount.project_id;
        } else {
            console.warn('[AI Studio] Firebase Admin service account not configured — initializing with projectId only for token verification');
        }
    } catch (error) {
        console.warn('[AI Studio] Firebase Admin credential error — falling back to projectId-only initialization:', error.message);
        credential = undefined;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID || credentialProjectId || 'collab-5a8c2';
    if (credential) {
        admin.initializeApp({ credential, projectId });
    } else {
        admin.initializeApp({ projectId });
    }

    initialized = true;

    console.log('Firebase Admin initialized', projectId ? `for project ${projectId}` : '');

    return admin.app();
};

const getFirebaseAdmin = () => {
    if (!initialized) {
        initializeFirebaseAdmin();
    }

    return admin;
};

module.exports = {
    initializeFirebaseAdmin,
    getFirebaseAdmin
};