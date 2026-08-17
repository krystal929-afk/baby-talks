// Public VAPID key. Safe to expose — clients need it to subscribe.
export const VAPID_PUBLIC_KEY =
  "BBDzWEz7oghWrwYF8foRPSZEy2B7wi49V0n3gLLZrmurhtJ5V0U4AN4PrygWv4jiploJFSPGMGr8O7kRYEl1sew";

export const VAPID_SUBJECT = "mailto:baby@mr-satan.app";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
