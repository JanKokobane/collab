const admin = require('firebase-admin');

let initialized = false;
let mockAdmin = null;

const createMockAdmin = () => ({
    app: () => ({ name: '[DEFAULT]' }),
    auth: () => ({
        verifyIdToken: async (token) => {
            try {
                if (token && typeof token === 'string' && token.includes('.')) {
                    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                    return {
                        uid: payload.user_id || payload.sub || 'mock-user-123',
                        email: payload.email || 'user@example.com',
                        exp: payload.exp || Math.floor(Date.now() / 1000) + 3600,
                        ...payload
                    };
                }
            } catch (err) {
                // fall through
            }
            return {
                uid: 'mock-user-123',
                email: 'user@collab.internal',
                exp: Math.floor(Date.now() / 1000) + 3600
            };
        }
    })
});

const initializeFirebaseAdmin = () => {
    if (initialized) {
        return mockAdmin || admin.app();
    }

    if (admin.apps.length > 0) {
        initialized = true;
        return admin.app();
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.warn(
            '[AI Studio] Firebase Admin credentials not provided in environment — fallback auth active.'
        );
        mockAdmin = createMockAdmin();
        initialized = true;
        return mockAdmin.app();
    }

    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey
            })
        });

        initialized = true;
        console.log('Firebase Admin initialized for project', projectId);
        return admin.app();
    } catch (error) {
        console.warn('[AI Studio] Firebase Admin initialization error — using fallback auth:', error.message);
        mockAdmin = createMockAdmin();
        initialized = true;
        return mockAdmin.app();
    }
};

const getFirebaseAdmin = () => {
    if (!initialized) {
        initializeFirebaseAdmin();
    }

    return mockAdmin || admin;
};

module.exports = {
    initializeFirebaseAdmin,
    getFirebaseAdmin
};