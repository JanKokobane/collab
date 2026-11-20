export type AuthUser = {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

export function subscribeToAuth(
  callback: (user: AuthUser | null) => void,
  onError: (error: Error) => void,
): () => void

export function signOutCurrentUser(): Promise<void>
