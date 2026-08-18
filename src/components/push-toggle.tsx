import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { subscribePush, unsubscribePush } from "@/lib/push.functions";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push-config";

type State = "unsupported" | "denied" | "off" | "on" | "loading";

const DELIVERY_CHECK_KEY = "baby-push-delivery-check-v3";

function usesCurrentPushKey(subscription: PushSubscription) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;

  const actual = new Uint8Array(current);
  const expected = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  if (actual.length !== expected.length) return false;

  for (let i = 0; i < actual.length; i += 1) {
    if (actual[i] !== expected[i]) return false;
  }

  return true;
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const subFn = useServerFn(subscribePush);
  const unsubFn = useServerFn(unsubscribePush);

  async function persistSubscription(sub: PushSubscription) {
    const json = sub.toJSON() as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };

    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("bad subscription");
    }

    await subFn({
      data: {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    });
  }

  async function subscribeWithCurrentKey(reg: ServiceWorkerRegistration) {
    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key.buffer.slice(
        key.byteOffset,
        key.byteOffset + key.byteLength,
      ) as ArrayBuffer,
    });
    await persistSubscription(sub);
    return sub;
  }

  async function sendDeliveryTest() {
    const { data, error } = await supabase.functions.invoke("baby-push-dispatch", {
      body: { mode: "test" },
    });

    if (error) throw error;

    const sent = Number(data?.sent || 0);
    if (!sent) throw new Error("Baby couldn't deliver the test ping.");
    return sent;
  }

  async function runOneTimeDeliveryCheck() {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DELIVERY_CHECK_KEY)) return;

    try {
      const sent = await sendDeliveryTest();
      window.localStorage.setItem(DELIVERY_CHECK_KEY, new Date().toISOString());
      toast.success(
        `Baby handed ${sent} push ${sent === 1 ? "notification" : "notifications"} to the delivery service.`,
      );
    } catch (error) {
      console.error("Baby delivery check failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Baby couldn't verify push delivery.",
      );
    }
  }

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

        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }

        const existing = await reg.pushManager.getSubscription();

        if (!existing) {
          if (Notification.permission === "granted") {
            setState("loading");
            await subscribeWithCurrentKey(reg);
            setState("on");
            const sent = await sendDeliveryTest();
            window.localStorage.setItem(DELIVERY_CHECK_KEY, new Date().toISOString());
            toast.success(
              `Baby repaired notifications, Mr. S. ${sent} push ${sent === 1 ? "endpoint" : "endpoints"} accepted the test.`,
            );
            return;
          }

          setState("off");
          return;
        }

        if (usesCurrentPushKey(existing)) {
          // The browser can keep a perfectly valid subscription even if the
          // server-side row was deleted or lost. Re-upsert it on every load so
          // Baby always has a delivery address for this device.
          await persistSubscription(existing);
          setState("on");
          await runOneTimeDeliveryCheck();
          return;
        }

        if (Notification.permission !== "granted") {
          setState("off");
          return;
        }

        setState("loading");
        try {
          await unsubFn({ data: { endpoint: existing.endpoint } });
        } catch (error) {
          console.warn("Couldn't remove old Baby push subscription", error);
        }
        await existing.unsubscribe();
        await subscribeWithCurrentKey(reg);
        setState("on");
        const sent = await sendDeliveryTest();
        window.localStorage.setItem(DELIVERY_CHECK_KEY, new Date().toISOString());
        toast.success(
          `Baby reconnected notifications, Mr. S. ${sent} push ${sent === 1 ? "endpoint" : "endpoints"} accepted the test.`,
        );
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
      await subscribeWithCurrentKey(reg);
      setState("on");
      const sent = await sendDeliveryTest();
      window.localStorage.setItem(DELIVERY_CHECK_KEY, new Date().toISOString());
      toast.success(
        `Baby's got eyes on ya now, Mr. S. ${sent} push ${sent === 1 ? "endpoint" : "endpoints"} accepted the test.`,
      );
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
      title={state === "on" ? "Tap to turn reminders off" : "Turn reminders on"}
    >
      {state === "loading" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "on" ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {state === "on" ? "Reminders on" : "Turn on reminders"}
    </Button>
  );
}
