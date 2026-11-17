/**
 * Helper for browser Credential Management API (Google Password Manager, Chrome, Edge).
 * Enables native password saving and autofill support in modern browsers.
 */

export async function saveCredentialToBrowser(params: {
  id: string;
  password?: string;
  name?: string;
}): Promise<void> {
  if (typeof window === 'undefined' || !navigator.credentials) return;
  if (!params.id || !params.password) return;

  try {
    const PasswordCredentialClass = (window as any).PasswordCredential;
    if (typeof PasswordCredentialClass === 'function') {
      const cred = new PasswordCredentialClass({
        id: params.id.trim(),
        password: params.password,
        name: params.name?.trim() || undefined,
      });
      await navigator.credentials.store(cred);
    }
  } catch (err) {
    // Silently continue if the browser restricts credentials.store() in specific contexts
    console.debug('Credential store skipped or rejected by browser:', err);
  }
}
