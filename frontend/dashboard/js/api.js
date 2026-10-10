import { firebaseAuth } from '../../firebase.js';

import {
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const configuredBaseUrl = window.COLLAB_API_BASE_URL;

const apiBaseUrl = (
    configuredBaseUrl ||
    'https://collab-y7pb.onrender.com'
).replace(/\/+$/, '');

export class ApiError extends Error {
    constructor(message, status, payload = null) {
        super(message);

        this.name = 'ApiError';
        this.status = status;
        this.code = payload?.code || null;
        this.payload = payload;
    }
}

async function request(
    path,
    {
        method = 'GET',
        body,
        retryUnauthorized = true
    } = {}
) {
    const user = firebaseAuth.currentUser;

    if (!user) {
        throw new ApiError(
            'Please sign in to continue.',
            401
        );
    }

    const token = await user.getIdToken(false);

    let response;

    const requestOptions = {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined
                ? {}
                : {
                    'Content-Type': 'application/json'
                })
        },
        ...(body === undefined
            ? {}
            : {
                body: JSON.stringify(body)
            })
    };

    try {
        response = await fetch(
            `${apiBaseUrl}/api${path}`,
            requestOptions
        );
    } catch (error) {
        throw new ApiError(
            'Unable to connect to Collab. Check your connection and try again.',
            0,
            error
        );
    }

    /*
     * If Firebase returns an expired/invalid token,
     * refresh it once and retry the request.
     */
    if (
        response.status === 401 &&
        retryUnauthorized
    ) {
        try {
            const refreshedToken =
                await user.getIdToken(true);

            response = await fetch(
                `${apiBaseUrl}/api${path}`,
                {
                    ...requestOptions,
                    headers: {
                        ...requestOptions.headers,
                        Authorization:
                            `Bearer ${refreshedToken}`
                    }
                }
            );
        } catch (error) {
            throw new ApiError(
                'Unable to connect to Collab. Check your connection and try again.',
                0,
                error
            );
        }
    }

    const payload =
        await response
            .json()
            .catch(() => null);

    if (!response.ok) {
        /*
         * If authentication still fails after
         * refreshing the Firebase token, sign out
         * and return the user to the sign-in page.
         */
        if (response.status === 401) {
            await signOut(firebaseAuth);

            window.location.replace(
                '../auth/auth.html?mode=signin'
            );

            throw new ApiError(
                'Your session has expired. Please sign in again.',
                401,
                payload
            );
        }

        const message =
            payload?.message ||
            (response.status === 403
                ? "You don't have permission to access this resource."
                : 'The request could not be completed.');

        throw new ApiError(
            message,
            response.status,
            payload
        );
    }

    return payload;
}

export const api = {
    get: path =>
        request(path),

    post: (path, body) =>
        request(path, {
            method: 'POST',
            body
        }),

    put: (path, body) =>
        request(path, {
            method: 'PUT',
            body
        }),

    patch: (path, body) =>
        request(path, {
            method: 'PATCH',
            body
        }),

    delete: path =>
        request(path, {
            method: 'DELETE'
        })
};

export {
    apiBaseUrl
};
