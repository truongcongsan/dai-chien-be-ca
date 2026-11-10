"use client";

import { useSyncExternalStore } from "react";
import type { AdminState, Fx, ServerMessage, Snapshot } from "@/shared/protocol";

export type LinkState = "connecting" | "open" | "closed";

export function engineBase() {
  const port = process.env.NEXT_PUBLIC_ENGINE_PORT ?? "3321";
  const host = typeof window === "undefined" ? "127.0.0.1" : window.location.hostname;
  return { ws: `ws://${host}:${port}/ws`, http: `http://${host}:${port}` };
}

/**
 * One socket to the engine. The Stage joins read-only; the Admin may also send commands.
 * Reconnects by itself and always starts from a fresh snapshot, so a refresh never resets the game.
 */
export class EngineClient {
  snapshot: Snapshot | null = null;
  admin: AdminState | null = null;
  adminSeq = 0;
  link: LinkState = "connecting";
  /** Đồng hồ server trừ đồng hồ máy này, để đếm ngược trứng khớp với engine. */
  clockOffset = 0;
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly fxListeners = new Set<(fx: Fx) => void>();
  private readonly pending = new Map<number, (r: { ok: boolean; error?: string; data?: unknown }) => void>();
  private nextId = 1;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly admin_: boolean) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  onFx(listener: (fx: Fx) => void) {
    this.fxListeners.add(listener);
    return () => void this.fxListeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
  }

  private open() {
    const url = `${engineBase().ws}?role=${this.admin_ ? "admin" : "stage"}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => {
      this.link = "open";
      this.emit();
    };
    socket.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as ServerMessage;
      if (msg.type === "snapshot") {
        this.snapshot = msg.snap;
        this.clockOffset = msg.snap.now - Date.now();
        this.emit();
      } else if (msg.type === "admin") {
        this.admin = msg.state;
        this.adminSeq++;
        this.emit();
      } else if (msg.type === "fx") {
        for (const fx of msg.fx) for (const l of this.fxListeners) l(fx);
      } else if (msg.type === "ack") {
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.link = "closed";
      this.emit();
      if (!this.stopped) this.retry = setTimeout(() => this.open(), 1500);
    };
  }

  command(cmd: string, args?: Record<string, unknown>) {
    return new Promise<{ ok: boolean; error?: string; data?: unknown }>((resolve) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return resolve({ ok: false, error: "Mất kết nối engine" });
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ type: "cmd", id, cmd, args }));
      setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, error: "Hết thời gian chờ" });
      }, 6000);
    });
  }
}

export function useEngine(client: EngineClient) {
  useSyncExternalStore(
    client.subscribe,
    () => `${client.snapshot?.seq ?? 0}:${client.adminSeq}:${client.link}`,
    () => "server",
  );
  return client;
}
