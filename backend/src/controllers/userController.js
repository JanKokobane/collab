const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const searchUsers = async (req, res) => {
    const search = typeof req.query.q === 'string'
        ? req.query.q.trim().toLocaleLowerCase()
        : '';

    if (search.length < 2 || search.length > 100) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_USER_SEARCH',
            message: 'Enter between 2 and 100 characters to search users.'
        });
    }

    try {
        const auth = getFirebaseAdmin().auth();
        const users = [];
        let pageToken;

        do {
            const page = await auth.listUsers(1000, pageToken);
            for (const user of page.users) {
                if (user.uid === req.firebaseUid || user.disabled) continue;

                const name = user.displayName || '';
                const email = user.email || '';
                if (!email) continue;
                if (
                    !name.toLocaleLowerCase().includes(search) &&
                    !email.toLocaleLowerCase().includes(search)
                ) continue;

                users.push({
                    firebaseUid: user.uid,
                    name: name || email,
                    email
                });

                if (users.length === 20) break;
            }
            pageToken = users.length === 20 ? undefined : page.pageToken;
        } while (pageToken);

        return res.status(200).json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Search registered users error:', error);
        return res.status(500).json({
            success: false,
            code: 'USER_SEARCH_FAILED',
            message: 'Registered users could not be searched.'
        });
    }
};

module.exports = { searchUsers };
