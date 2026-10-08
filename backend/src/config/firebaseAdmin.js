const admin = require('firebase-admin');

let initialized = false;

const initializeFirebaseAdmin = () => {
    if (initialized) {
        return admin.app();
    }

    if (admin.apps.length > 0) {
        initialized = true;
        return admin.app();
    }

    const projectId =
        process.env.FIREBASE_PROJECT_ID;

    const clientEmail =
        process.env.FIREBASE_CLIENT_EMAIL;

    const privateKey =
        process.env.FIREBASE_PRIVATE_KEY
            ?.replace(/\\n/g, '\n');

    if (
        !projectId ||
        !clientEmail ||
        !privateKey
    ) {
        throw new Error(
            'Missing Firebase Admin environment variables.'
        );
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey
        })
    });

    initialized = true;

    console.log('Firebase Admin initialized');

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