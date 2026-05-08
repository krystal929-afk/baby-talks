// Browser Web Speech API hook for hold-to-dictate. Free, no API needed.
// Falls back gracefully if unsupported (user can type instead).
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal types for the Web Speech API (not in lib.dom standard fully)
type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const finalRef = useRef("");
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const wantListeningRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      wantListeningRef.current = false;
      try { recRef.current?.abort(); } catch { /* noop */ }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    // If already running, don't double-start (throws InvalidStateError).
    if (startingRef.current || recRef.current) {
      wantListeningRef.current = true;
      return;
    }

    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    finalRef.current = "";
    setInterim("");
    wantListeningRef.current = true;
    startingRef.current = true;

    rec.onstart = () => {
      startingRef.current = false;
      setListening(true);
    };
    // iOS Safari quirk: results array is cumulative within a session and
    // resultIndex isn't always reliable. Rebuild final + interim from the
    // entire results array each event, then snapshot finals on session end.
    let sessionFinal = "";
    rec.onresult = (e) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) finalText += t + " ";
        else interimText += t;
      }
      sessionFinal = finalText;
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are benign — don't treat as fatal during a hold.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("dictation error:", e.error);
        wantListeningRef.current = false;
      }
    };
    rec.onend = () => {
      startingRef.current = false;
      // Auto-restart if user is still holding the mic and engine ended early
      // (Chrome/iOS will close the stream after silence even with continuous=true).
      if (wantListeningRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to fully stop
        }
      }
      recRef.current = null;
      setListening(false);
    };

    try {
      rec.start();
      recRef.current = rec;
    } catch {
      startingRef.current = false;
      wantListeningRef.current = false;
      recRef.current = null;
      setListening(false);
    }
  }, []);

  const stop = useCallback((): string => {
    wantListeningRef.current = false;
    const rec = recRef.current;
    if (rec) {
      try { rec.stop(); } catch { /* noop */ }
    }
    const result = (finalRef.current + interim).trim();
    finalRef.current = "";
    setInterim("");
    // listening flag clears in onend
    return result;
  }, [interim]);

  return { supported, listening, interim, start, stop };
}
