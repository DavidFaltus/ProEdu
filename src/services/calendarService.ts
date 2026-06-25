export const getGoogleAccessToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "333169829281-a6s2824rddb4iuaq6sh2t5sivvmbp07i.apps.googleusercontent.com"; // dummy fallback
      
      // Combine default identity scopes with required Workspace scopes.
      const SCOPES = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' ');

      // @ts-ignore - google is loaded from external script in index.html
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('Failed to get access token: ' + (response.error || 'Unknown error')));
          }
        },
      });
      client.requestAccessToken();
    } catch (error) {
      reject(error);
    }
  });
};

export const syncEventToGoogleCalendar = async (
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }
) => {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error?.message || 'Failed to sync to Google Calendar');
  }

  return await res.json();
};
