"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/src/lib/api-client";

export function usePushSubscription() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    });
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return;

    const reg = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey,
    });

    const json = sub.toJSON();
    await api.post("/api/notifications/subscribe", {
      endpoint: json.endpoint,
      keys: json.keys,
    });

    setIsSubscribed(true);
  }, [isSupported]);

  return { isSupported, isSubscribed, permission, subscribe };
}
