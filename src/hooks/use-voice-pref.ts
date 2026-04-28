import { useEffect, useState } from "react";

const KEY = "baby:voice-enabled";

function read(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === "1";
}

const listeners = new Set<(v: boolean) => void>();

export function useVoiceEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const fn = (v: boolean) => setEnabled(v);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const update = (v: boolean) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, v ? "1" : "0");
    }
    listeners.forEach((l) => l(v));
  };

  return [enabled, update];
}
