const endpoint = import.meta.env.VITE_GWENT_MULTIPLAYER_URL?.trim() ?? "";

export function createMultiplayerService() {
  return {
    getConfig() {
      return {
        endpoint,
        enabled: endpoint.length > 0
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
        matchId: data.matchId ?? null
      };
    },
    async cancelQueue() {
      if (!endpoint) {
        return;
      }

      await fetch(`${endpoint.replace(/\/$/, "")}/queue/leave`, {
        method: "POST"
      });
    }
  };
}
