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
      joinQueue: (payload: {
        playerId: string;
        displayName: string;
        deck: string;
      }) => Promise<{
        status: string;
        endpoint: string;
        matchId: string | null;
      }>;
      cancelQueue: () => Promise<void>;
    };
  };
}
