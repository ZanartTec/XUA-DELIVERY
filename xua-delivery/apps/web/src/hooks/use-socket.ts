"use client";

import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "@/src/store/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function useSocket() {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    const socket = io(API_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    setSocketInstance(socket);

    return () => {
      socket.disconnect();
      setSocketInstance(null);
      setIsConnected(false);
    };
  }, [user]);

  const on = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketInstance?.on(event, handler);
    },
    [socketInstance]
  );

  const off = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketInstance?.off(event, handler);
    },
    [socketInstance]
  );

  const socket = useCallback(() => socketInstance, [socketInstance]);

  return { socket, isConnected, on, off };
}
