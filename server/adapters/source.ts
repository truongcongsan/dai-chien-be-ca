/** Normalized events: the only thing a connector may hand to the game (FR-TIKTOK-01). */

export interface SourceUser {
  userId: string;
  uniqueId: string;
  name: string;
}

export type SourceEvent =
  | { type: "chat"; eventId: string; user: SourceUser; text: string }
  | { type: "gift"; eventKey: string; user: SourceUser; giftId: number | null; giftName: string; count: number; diamonds: number | null }
  | { type: "like"; eventId: string; user: SourceUser; count: number }
  | { type: "follow" | "share" | "member"; eventId: string; user: SourceUser }
  | { type: "viewers"; count: number };

export interface SourceCallbacks {
  onEvent(event: SourceEvent): void;
  onStatus(state: "connecting" | "connected" | "disconnected" | "error", message: string): void;
}

export interface SourceAdapter {
  start(callbacks: SourceCallbacks): void;
  stop(): void;
}
