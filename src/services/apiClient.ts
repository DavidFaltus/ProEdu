import { auth } from '../lib/firebase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

interface ApiErrorPayload {
  error?: string;
}

async function getAuthHeaders() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Pro pokračování se musíte přihlásit.');
  }

  const token = await user.getIdToken();

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function postApi<TResponse>(path: string, payload: unknown): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Server request failed.';

    try {
      const errorPayload = (await response.json()) as ApiErrorPayload;
      if (errorPayload.error) {
        message = errorPayload.error;
      }
    } catch {
      // Ignore JSON parsing issues and use the generic message.
    }

    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}
