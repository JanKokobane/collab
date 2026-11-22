import { signOut } from 'firebase/auth';
import { apiBaseUrl, firebaseAuth, markCurrentUserOffline } from './firebase';

export class ApiError extends Error {
  status: number;
  code: string | null;
  payload: any;

  constructor(message: string, status: number, payload: any = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload?.code || null;
    this.payload = payload;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  retryUnauthorized?: boolean;
}

async function request<T = any>(
  path: string,
  { method = 'GET', body, retryUnauthorized = true }: RequestOptions = {}
): Promise<T> {
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new ApiError('Please sign in to continue.', 401);
  }

  const token = await user.getIdToken(false);
  let response: Response;

  const fetchOptions: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  };

  try {
    response = await fetch(`${apiBaseUrl}/api${path}`, fetchOptions);
  } catch (error) {
    throw new ApiError(
      'Unable to connect to Collab. Check your connection and try again.',
      0,
      error
    );
  }

  if (response.status === 401 && retryUnauthorized) {
    try {
      const refreshedToken = await user.getIdToken(true);
      response = await fetch(`${apiBaseUrl}/api${path}`, {
        ...fetchOptions,
        headers: {
          ...fetchOptions.headers,
          Authorization: `Bearer ${refreshedToken}`
        }
      });
    } catch (error) {
      throw new ApiError(
        'Unable to connect to Collab. Check your connection and try again.',
        0,
        error
      );
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      try {
        await markCurrentUserOffline();
      } catch (error) {
        console.error('Unable to mark presence offline before expired-session sign-out:', error);
      }
      await signOut(firebaseAuth);
      window.location.replace('/auth/auth.html?mode=signin');
      throw new ApiError('Your session has expired. Please sign in again.', 401, payload);
    }

    const message =
      payload?.message ||
      (response.status === 403
        ? "You don't have permission to access this resource."
        : 'The request could not be completed.');
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T = any>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T = any>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = any>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'DELETE',
      ...(body === undefined ? {} : { body })
    })
};

export { apiBaseUrl };
