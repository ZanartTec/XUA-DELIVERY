"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/src/store/auth";

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const socket = io({
      auth: { token: document.cookie.replace(/(?:(?:^|.*;\s*)xua-token\s*=\s*([^;]*).*$)|^.*$/, "$1") },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [user]);

  const on = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketRef.current?.on(event, handler);
    },
    []
  );

  const off = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketRef.current?.off(event, handler);
    },
    []
  );

  const socket = useCallback(() => socketRef.current, []);

  return { socket, isConnected, on, off };
}
