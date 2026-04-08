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
        realtimeEnabled: boolean;
      };
      subscribeQueueStatus: (payload: {
        playerId: string;
        onUpdate: (state: {
          status: string;
          matchId: string | null;
          opponent?: {
            playerId: string;
            displayName: string;
          } | null;
        }) => void;
      }) => () => void;
      subscribeMatchState: (payload: {
        playerId: string;
        matchId: string;
        onUpdate: (state: {
          matchId: string;
          status: string;
          gameMode: string;
          round: number;
          turnNumber: number;
          currentTurnPlayerId: string | null;
          turnDeadlineAt: string | null;
          winnerPlayerId: string | null;
          readyPlayerIds: string[];
          self: {
            playerId: string;
            displayName: string;
            deck: string;
            slot: string;
            ready: boolean;
            passed: boolean;
            forfeited: boolean;
            leaderAvailable: boolean;
            hand: PvPCardInstance[];
            deckCards: PvPCardInstance[];
            handCount: number;
            deckCount: number;
            graveCount: number;
            rows: {
              close: number[];
              ranged: number[];
              siege: number[];
            };
            specialRows: {
              close: number | null;
              ranged: number | null;
              siege: number | null;
            };
            redrawRemaining: number;
            redrawComplete: boolean;
            total: number;
            health: number;
          };
          opponent: {
            playerId: string;
            displayName: string;
            deck: {
              faction: string;
              leader: number;
            };
            slot: string;
            ready: boolean;
            passed: boolean;
            forfeited: boolean;
            leaderAvailable: boolean;
            handCount: number;
            deckCount: number;
            graveCount: number;
            rows: {
              close: number[];
              ranged: number[];
              siege: number[];
            };
            specialRows: {
              close: number | null;
              ranged: number | null;
              siege: number | null;
            };
            redrawRemaining: number;
            redrawComplete: boolean;
            total: number;
            health: number;
          } | null;
          actionLog: Array<{
            type: string;
            playerId: string;
            at: string;
            round?: number;
          }>;
          gameState: {
            phase: string;
            weather: number[];
            round: number;
            turnNumber: number;
            redrawDeadlineAt: string | null;
            pendingChoice: {
              type: string;
              sourceCardId: number;
              sourcePlayerId?: string | null;
              remainingCount?: number | null;
              options: Array<PvPCardInstance & { rowName?: string | null }>;
              sourceCardInstanceId?: string;
            } | null;
          };
        }) => void;
      }) => () => void;
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
      getMatchBootstrap: (payload: {
        playerId: string;
        matchId: string;
      }) => Promise<{
        matchId: string;
        status: string;
        gameMode: string;
        round: number;
        turnNumber: number;
        currentTurnPlayerId: string | null;
        turnDeadlineAt: string | null;
        winnerPlayerId: string | null;
        readyPlayerIds: string[];
        eventLog: Array<{
          seq: number;
          type: string;
          at: string;
          playerId?: string;
          round?: number;
          turnNumber?: number;
          currentTurnPlayerId?: string;
          turnDeadlineAt?: string | null;
          cardId?: number;
          cardInstanceId?: string | null;
          targetRow?: string;
          owner?: string;
          leaderAbility?: string;
          autoPlayed?: boolean;
          count?: number;
          cardIds?: number[];
          cardInstanceIds?: string[];
          phase?: string;
          redrawDeadlineAt?: string | null;
          redrawRemaining?: number;
          winnerPlayerId?: string;
          loserPlayerId?: string;
          reason?: string;
          from?: string;
          to?: string;
          rowName?: string;
          fromCardId?: number;
          toCardId?: number;
          power?: number;
          owner?: string;
          sourcePlayerId?: string;
          targetPlayerId?: string;
        }>;
        self: {
          playerId: string;
          displayName: string;
          deck: string;
          slot: string;
          ready: boolean;
          passed: boolean;
          forfeited: boolean;
          leaderAvailable: boolean;
          halfWeather: boolean;
          hand: PvPCardInstance[];
          deckCards: PvPCardInstance[];
          handCount: number;
          deckCount: number;
          graveCount: number;
          rows: {
            close: number[];
            ranged: number[];
            siege: number[];
          };
          specialRows: {
            close: number | null;
            ranged: number | null;
            siege: number | null;
          };
          redrawRemaining: number;
          redrawComplete: boolean;
          total: number;
          health: number;
        };
        opponent: {
          playerId: string;
          displayName: string;
          deck: {
            faction: string;
            leader: number;
          };
          slot: string;
          ready: boolean;
          passed: boolean;
          forfeited: boolean;
          leaderAvailable: boolean;
          halfWeather: boolean;
          handCount: number;
          deckCount: number;
          graveCount: number;
          rows: {
            close: number[];
            ranged: number[];
            siege: number[];
          };
          specialRows: {
            close: number | null;
            ranged: number | null;
            siege: number | null;
          };
          redrawRemaining: number;
          redrawComplete: boolean;
          total: number;
          health: number;
        } | null;
        actionLog: Array<{
          type: string;
          playerId: string;
          at: string;
          round?: number;
        }>;
        gameState: {
          phase: string;
          weather: number[];
          round: number;
          turnNumber: number;
          redrawDeadlineAt: string | null;
          pendingChoice: {
            type: string;
            sourceCardId: number;
            sourcePlayerId?: string | null;
            remainingCount?: number | null;
            options: Array<PvPCardInstance & { rowName?: string | null }>;
            sourceCardInstanceId?: string;
          } | null;
        };
      }>;
      getMatchState: (payload: {
        playerId: string;
        matchId: string;
      }) => Promise<{
        matchId: string;
        status: string;
        gameMode: string;
        round: number;
        turnNumber: number;
        currentTurnPlayerId: string | null;
        turnDeadlineAt: string | null;
        winnerPlayerId: string | null;
        readyPlayerIds: string[];
        eventLog: Array<{
          seq: number;
          type: string;
          at: string;
          playerId?: string;
          round?: number;
          turnNumber?: number;
          currentTurnPlayerId?: string;
          turnDeadlineAt?: string | null;
          cardId?: number;
          cardInstanceId?: string | null;
          targetRow?: string;
          owner?: string;
          count?: number;
          cardIds?: number[];
          cardInstanceIds?: string[];
          phase?: string;
          redrawDeadlineAt?: string | null;
          redrawRemaining?: number;
          winnerPlayerId?: string;
          loserPlayerId?: string;
          reason?: string;
          from?: string;
          to?: string;
          power?: number;
        }>;
        self: {
          playerId: string;
          displayName: string;
          deck: string;
          slot: string;
          ready: boolean;
          passed: boolean;
          forfeited: boolean;
          hand: PvPCardInstance[];
          deckCards: PvPCardInstance[];
          handCount: number;
          deckCount: number;
          graveCount: number;
          rows: {
            close: number[];
            ranged: number[];
            siege: number[];
          };
          specialRows: {
            close: number | null;
            ranged: number | null;
            siege: number | null;
          };
          redrawRemaining: number;
          redrawComplete: boolean;
          total: number;
          health: number;
        };
        opponent: {
          playerId: string;
          displayName: string;
          deck: {
            faction: string;
            leader: number;
          };
          slot: string;
          ready: boolean;
          passed: boolean;
          forfeited: boolean;
          handCount: number;
          deckCount: number;
          graveCount: number;
          rows: {
            close: number[];
            ranged: number[];
            siege: number[];
          };
          specialRows: {
            close: number | null;
            ranged: number | null;
            siege: number | null;
          };
          redrawRemaining: number;
          redrawComplete: boolean;
          total: number;
          health: number;
        } | null;
        actionLog: Array<{
          type: string;
          playerId: string;
          at: string;
          round?: number;
        }>;
        gameState: {
          phase: string;
          weather: number[];
          round: number;
          turnNumber: number;
          redrawDeadlineAt: string | null;
          pendingChoice: {
            type: string;
            sourceCardId: number;
            sourcePlayerId?: string | null;
            remainingCount?: number | null;
            options: Array<PvPCardInstance & { rowName?: string | null }>;
            sourceCardInstanceId?: string;
          } | null;
        };
      }>;
      sendMatchAction: (payload: {
        playerId: string;
        matchId: string;
        action: "ready" | "decline_ready" | "redraw_card" | "finish_redraw" | "pass" | "forfeit" | "play_card" | "resolve_choice";
        cardInstanceId?: string;
        selectedCardInstanceId?: string;
        handIndex?: number;
        targetRow?: "close" | "ranged" | "siege" | "weather";
      }) => Promise<{
        matchId: string;
        status: string;
        round: number;
        turnNumber: number;
        currentTurnPlayerId: string | null;
        turnDeadlineAt: string | null;
        winnerPlayerId: string | null;
        readyPlayerIds: string[];
        eventLog: Array<{
          seq: number;
          type: string;
          at: string;
          playerId?: string;
          round?: number;
          turnNumber?: number;
          currentTurnPlayerId?: string;
          turnDeadlineAt?: string | null;
          cardId?: number;
          cardInstanceId?: string | null;
          targetRow?: string;
          owner?: string;
          count?: number;
          cardIds?: number[];
          cardInstanceIds?: string[];
          phase?: string;
          redrawDeadlineAt?: string | null;
          redrawRemaining?: number;
          winnerPlayerId?: string;
          loserPlayerId?: string;
          reason?: string;
          from?: string;
          to?: string;
        }>;
        self: {
          playerId: string;
          displayName: string;
          deck: string;
          slot: string;
          ready: boolean;
          passed: boolean;
          forfeited: boolean;
          hand: PvPCardInstance[];
          deckCards: PvPCardInstance[];
          handCount: number;
          deckCount: number;
          graveCount: number;
          rows: {
            close: number[];
            ranged: number[];
            siege: number[];
          };
          redrawRemaining: number;
          redrawComplete: boolean;
          total: number;
          health: number;
        };
        opponent: {
          playerId: string;
          displayName: string;
          deck: {
            faction: string;
            leader: number;
          };
          slot: string;
          ready: boolean;
          passed: boolean;
          forfeited: boolean;
          handCount: number;
          deckCount: number;
          graveCount: number;
          rows: {
            close: number[];
            ranged: number[];
            siege: number[];
          };
          redrawRemaining: number;
          redrawComplete: boolean;
          total: number;
          health: number;
        } | null;
        gameState: {
          phase: string;
          weather: number[];
          round: number;
          turnNumber: number;
          redrawDeadlineAt: string | null;
          pendingChoice: {
            type: string;
            sourceCardId: number;
            sourcePlayerId?: string | null;
            remainingCount?: number | null;
            options: Array<PvPCardInstance & { rowName?: string | null }>;
            sourceCardInstanceId?: string;
          } | null;
        };
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

type PvPCardInstance = {
  instanceId: string;
  cardId: number;
};
