const endpoint = import.meta.env.VITE_GWENT_MULTIPLAYER_URL?.trim() ?? "";

export function createMultiplayerService() {
  const normalizedEndpoint = endpoint.replace(/\/$/, "");
  const wsEndpoint = normalizedEndpoint ? normalizedEndpoint.replace(/^http/, "ws") + "/ws" : "";
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const queueSubscribers = new Map<string, (payload: { status: string; matchId: string | null; opponent?: { playerId: string; displayName: string } | null; }) => void>();
  const matchSubscribers = new Map<string, (payload: any) => void>();

  function ensureSocket() {
    if (!wsEndpoint || socket) {
      return;
    }
    socket = new WebSocket(wsEndpoint);
    socket.addEventListener("open", () => {
      queueSubscribers.forEach((_handler, playerId) => {
        socket?.send(JSON.stringify({
          type: "subscribe_queue",
          playerId
        }));
      });
      matchSubscribers.forEach((_handler, key) => {
        const [playerId, matchId] = key.split("::");
        socket?.send(JSON.stringify({
          type: "subscribe_match",
          playerId,
          matchId
        }));
      });
    });
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "queue_status") {
          const handler = queueSubscribers.get(message.playerId);
          if (handler) {
            handler(message.payload);
          }
          return;
        }
        if (message.type === "match_state") {
          const handler = matchSubscribers.get(`${message.playerId}::${message.matchId}`);
          if (handler) {
            handler(message.payload);
          }
        }
      } catch (_error) {
      }
    });
    socket.addEventListener("close", () => {
      socket = null;
      if ((queueSubscribers.size > 0 || matchSubscribers.size > 0) && !reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          ensureSocket();
        }, 1000);
      }
    });
  }

  function subscribeQueueStatus(payload: { playerId: string; onUpdate: (state: { status: string; matchId: string | null; opponent?: { playerId: string; displayName: string } | null; }) => void; }) {
    if (!wsEndpoint) {
      return () => {};
    }
    queueSubscribers.set(payload.playerId, payload.onUpdate);
    ensureSocket();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "subscribe_queue",
        playerId: payload.playerId
      }));
    }
    return () => {
      queueSubscribers.delete(payload.playerId);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "unsubscribe_queue",
          playerId: payload.playerId
        }));
      }
    };
  }

  function subscribeMatchState(payload: { playerId: string; matchId: string; onUpdate: (state: any) => void; }) {
    if (!wsEndpoint) {
      return () => {};
    }
    const key = `${payload.playerId}::${payload.matchId}`;
    matchSubscribers.set(key, payload.onUpdate);
    ensureSocket();
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "subscribe_match",
        playerId: payload.playerId,
        matchId: payload.matchId
      }));
    }
    return () => {
      matchSubscribers.delete(key);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "unsubscribe_match",
          playerId: payload.playerId,
          matchId: payload.matchId
        }));
      }
    };
  }

  return {
    getConfig() {
      return {
        endpoint,
        enabled: endpoint.length > 0,
        realtimeEnabled: wsEndpoint.length > 0
      };
    },
    subscribeQueueStatus,
    subscribeMatchState,
    async getQueueStatus(payload: { playerId: string }) {
      if (!endpoint) {
        return {
          status: "service_unconfigured",
          matchId: null,
          opponent: null
        };
      }

      const url = new URL(`${normalizedEndpoint}/queue/status`);
      url.searchParams.set("playerId", payload.playerId);
      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new Error("Failed to fetch queue status.");
      }

      const data = await response.json();
      return {
        status: data.status ?? "idle",
        matchId: data.matchId ?? null,
        opponent: data.opponent ?? null
      };
    },
    async getMatchBootstrap(payload: { playerId: string; matchId: string }) {
      if (!endpoint) {
        throw new Error("Multiplayer service is not configured.");
      }

      const url = new URL(`${normalizedEndpoint}/match/${payload.matchId}`);
      url.searchParams.set("playerId", payload.playerId);
      const response = await fetch(url.toString());

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to fetch match bootstrap.");
      }

      return await response.json();
    },
    async getMatchState(payload: { playerId: string; matchId: string }) {
      if (!endpoint) {
        throw new Error("Multiplayer service is not configured.");
      }

      const url = new URL(`${normalizedEndpoint}/match/${payload.matchId}/state`);
      url.searchParams.set("playerId", payload.playerId);
      const response = await fetch(url.toString());

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to fetch match state.");
      }

      return await response.json();
    },
    async sendMatchAction(payload: {
      playerId: string;
      matchId: string;
      action: "ready" | "decline_ready" | "redraw_card" | "finish_redraw" | "pass" | "forfeit" | "play_card" | "resolve_choice" | "activate_leader";
      cardInstanceId?: string;
      selectedCardInstanceId?: string;
      handIndex?: number;
      targetRow?: "close" | "ranged" | "siege" | "weather";
    }) {
      if (!endpoint) {
        throw new Error("Multiplayer service is not configured.");
      }

      const response = await fetch(`${normalizedEndpoint}/match/${payload.matchId}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Failed to send match action.");
      }

      return await response.json();
    },
    async joinQueue(payload: { playerId: string; displayName: string; deck: string }) {
      if (!endpoint) {
        return {
          status: "service_unconfigured",
          endpoint: "",
          matchId: null
        };
      }

      const response = await fetch(`${normalizedEndpoint}/queue/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to join multiplayer queue.");
      }

      const data = await response.json();
      return {
        status: data.status ?? "queued",
        endpoint,
        matchId: data.matchId ?? null,
        opponent: data.opponent ?? null
      };
    },
    async cancelQueue(payload: { playerId: string }) {
      if (!endpoint) {
        return;
      }

      await fetch(`${normalizedEndpoint}/queue/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }
  };
};