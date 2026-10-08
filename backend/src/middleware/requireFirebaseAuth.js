const {
    getFirebaseAdmin
} = require('../config/firebaseAdmin');

const requireFirebaseAuth = async (req, res, next) => {
    try {
        const authorization =
            req.headers.authorization || '';

        if (!authorization.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Authentication is required.'
            });
        }

        const token =
            authorization.substring(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                code: 'INVALID_TOKEN',
                message: 'Authentication token is missing.'
            });
        }

        const admin = getFirebaseAdmin();

        const decodedToken =
            await admin.auth().verifyIdToken(token);

        req.firebaseUser = decodedToken;
        req.firebaseUid = decodedToken.uid;
        req.firebaseEmail = decodedToken.email || null;

        next();

    } catch (error) {
        console.error(
            'Firebase authentication failed:',
            error.message
        );

        return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired authentication token.'
        });
    }
};

module.exports = {
    requireFirebaseAuth
};