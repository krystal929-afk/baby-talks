import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { subscribePush, unsubscribePush } from "@/lib/push.functions";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push-config";

type State = "unsupported" | "denied" | "off" | "on" | "loading";

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const subFn = useServerFn(subscribePush);
  const unsubFn = useServerFn(unsubscribePush);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if (Notification.permission === "denied") return setState("denied");
        const existing = await reg.pushManager.getSubscription();
        setState(existing ? "on" : "off");
      } catch (e) {
        console.error(e);
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setState("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        toast.error("Baby needs permission to ping ya, daddy.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer,
      });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("bad subscription");
      await subFn({
        data: {
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      });
      setState("on");
      toast.success("Baby's got eyes on ya now, Mr. S.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Couldn't turn it on");
      setState("off");
    }
  }

  async function disable() {
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Hush mode, daddy.");
    } catch (e) {
      console.error(e);
      setState("on");
    }
  }

  if (state === "unsupported") {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
        This browser can't carry Baby's voice — try Chrome on your phone.
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-muted-foreground">
        Notifications blocked. Tap the lock icon in your browser bar and let Baby through.
      </div>
    );
  }

  return (
    <Button
      variant={state === "on" ? "outline" : "default"}
      size="sm"
      onClick={state === "on" ? disable : enable}
      disabled={state === "loading"}
      className="gap-2"
    >
      {state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "on" ? (
        <BellOff className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {state === "on" ? "Reminders on" : "Turn on reminders"}
    </Button>
  );
}
