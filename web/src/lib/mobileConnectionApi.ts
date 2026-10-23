/**
 * Whisper Hub Mobile Connection API Client
 *
 * Provides functions to dispatch push notifications and Glance widget updates
 * to Android terminals via Whisper Hub (https://go-tide.app/whisper/api).
 */

export const WHISPER_API_BASE = 'https://go-tide.app/whisper/api';

export interface WhisperNotificationPayload {
  channel_id?: string;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  title: string;
  body: string;
  sound?: 'alarm_beep' | 'default' | string;
  data?: Record<string, unknown>;
}

export interface WhisperWidgetPayload {
  widget_id: string;
  template: string;
  data: {
    title: string;
    value: string;
    status?: 'normal' | 'info' | 'warning' | 'alert' | 'success' | string;
    accent_color?: string;
    progress?: number;
    subtitle?: string;
    [key: string]: unknown;
  };
}

export interface WhisperApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Helper to parse response body as JSON or text error
 */
async function parseResponsePayload(res: Response): Promise<{ data?: unknown; error?: string }> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const errorMsg =
          typeof json?.message === 'string'
            ? json.message
            : typeof json?.error === 'string'
              ? json.error
              : JSON.stringify(json);
        return { error: errorMsg, data: json };
      }
      return { data: json };
    } catch {
      // Fall through to text parsing
    }
  }

  try {
    const text = await res.text();
    if (!res.ok) {
      return { error: text || `HTTP error ${res.status}` };
    }
    return { data: text };
  } catch {
    return { error: `HTTP error ${res.status}` };
  }
}

/**
 * Sends a push notification to devices connected via Whisper Hub.
 */
export async function sendWhisperNotification(
  token: string,
  payload: WhisperNotificationPayload
): Promise<WhisperApiResponse> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return {
      success: false,
      error: 'Whisper API token is required',
    };
  }

  try {
    const res = await fetch(`${WHISPER_API_BASE}/notify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const parsed = await parseResponsePayload(res);

    return {
      success: res.ok,
      data: parsed.data,
      error: !res.ok ? (parsed.error || `Request failed with status ${res.status}`) : undefined,
      status: res.status,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Updates a Glance home screen widget state on devices connected via Whisper Hub.
 */
export async function updateWhisperWidget(
  token: string,
  payload: WhisperWidgetPayload
): Promise<WhisperApiResponse> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return {
      success: false,
      error: 'Whisper API token is required',
    };
  }

  try {
    const res = await fetch(`${WHISPER_API_BASE}/widgets/update`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const parsed = await parseResponsePayload(res);

    return {
      success: res.ok,
      data: parsed.data,
      error: !res.ok ? (parsed.error || `Request failed with status ${res.status}`) : undefined,
      status: res.status,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Verifies that a Whisper API token is valid and active.
 */
export async function verifyWhisperToken(
  token: string
): Promise<{ valid: boolean; error?: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { valid: false, error: 'Whisper API token is required' };
  }

  try {
    const res = await fetch(`${WHISPER_API_BASE}/tokens`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
      },
    });

    if (res.status === 200) {
      return { valid: true };
    }

    const parsed = await parseResponsePayload(res);
    return {
      valid: false,
      error: parsed.error || `Verification failed with status ${res.status}`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: message,
    };
  }
}
