const endpoint = import.meta.env.VITE_GWENT_MULTIPLAYER_URL?.trim() ?? "";

export function createMultiplayerService() {
  return {
    getConfig() {
      return {
        endpoint,
        enabled: endpoint.length > 0
      };
    },
    async getQueueStatus(payload: { playerId: string }) {
      if (!endpoint) {
        return {
          status: "service_unconfigured",
          matchId: null,
          opponent: null
        };
      }

      const url = new URL(`${endpoint.replace(/\/$/, "")}/queue/status`);
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
    async joinQueue(payload: { playerId: string; displayName: string; deck: string }) {
      if (!endpoint) {
        return {
          status: "service_unconfigured",
          endpoint: "",
          matchId: null
        };
      }

      const response = await fetch(`${endpoint.replace(/\/$/, "")}/queue/join`, {
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

      await fetch(`${endpoint.replace(/\/$/, "")}/queue/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    }
  };
}
