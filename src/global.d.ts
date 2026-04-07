interface Window {
  __GWENT_LEGACY_LOADED__?: boolean;
  __GWENT_SERVICES__?: {
    identity: {
      getProfile: () => {
        id: string;
        displayName: string;
      };
    };
    multiplayer: {
      getConfig: () => {
        endpoint: string;
        enabled: boolean;
      };
      getQueueStatus: (payload: {
        playerId: string;
      }) => Promise<{
        status: string;
        matchId: string | null;
        opponent?: {
          playerId: string;
          displayName: string;
        } | null;
      }>;
      joinQueue: (payload: {
        playerId: string;
        displayName: string;
        deck: string;
      }) => Promise<{
        status: string;
        endpoint: string;
        matchId: string | null;
        opponent?: {
          playerId: string;
          displayName: string;
        } | null;
      }>;
      cancelQueue: (payload: {
        playerId: string;
      }) => Promise<void>;
    };
  };
}
