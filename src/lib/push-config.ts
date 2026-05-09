// Public VAPID key. Safe to expose — clients need it to subscribe.
export const VAPID_PUBLIC_KEY =
  "BED6fJrN0Y8Zv3m4zcdrT2QbyRQEm4XKtNgRVqDWQJwkyRTG39owgOWLlb4kG7U7dp5wmUtLfGU4SD9JRJYqI-I";

export const VAPID_SUBJECT = "mailto:baby@mr-satan.app";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
