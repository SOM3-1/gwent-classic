# gwent-classic

![cover](https://user-images.githubusercontent.com/26311830/116256903-f1599b00-a7b6-11eb-84a1-16dcb5c9bfc6.jpg)

A browser remake of the original Gwent minigame from The Witcher 3: Wild Hunt, including DLC cards. The frontend keeps the original board flow and presentation, while PvP support is being added on top through a separate multiplayer backend.

For local frontend architecture documentation, see [docs/frontend-architecture.md](./docs/frontend-architecture.md).

## Run locally

This frontend runs with React, TypeScript, and Vite.

```bash
cd gwent-classic
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

For a production build:

```bash
npm run build
npm run preview
```

## Multiplayer setup

PvP uses a separate backend repo: `gwent-multiplayer-service`.

Start the backend in a separate terminal:

```bash
cd gwent-multiplayer-service
npm install
npm run dev
```

Then point the frontend to that backend before starting Vite:

```bash
cd gwent-classic
export VITE_GWENT_MULTIPLAYER_URL=http://localhost:3001
npm run dev
```

The frontend stores anonymous PvP identity in `localStorage`, so local testing does not require accounts.

## Getting oriented

Recommended reading order:

1. [`src/app/services/multiplayer.ts`](/Users/dush/Gwent/gwent-classic/src/app/services/multiplayer.ts)
2. [`src/gwent.ts`](/Users/dush/Gwent/gwent-classic/src/gwent.ts)
3. [Frontend architecture doc](./docs/frontend-architecture.md)

## Project structure

- `src/app`
  - React shell and HTML markup helpers
  - multiplayer client service layer
- `src/gwent.ts`
  - main game runtime
  - original board/game flow
  - PvP bridge logic
- `public/legacy/gwent.js`
  - synced browser runtime copy of `src/gwent.ts`
- `style.css`
  - main game and UI styles

## Frontend architecture

The frontend has two modes:

- `PvC`
  - original local single-player flow
  - browser owns turn flow, AI behavior, board effects, and animations
- `PvP`
  - backend owns match state, legality, timers, and hidden information
  - frontend renders the board and replays visible events

The current frontend is a hybrid:

- the original game runtime still powers the board UI and animations
- PvP state comes from the backend as player-scoped match state
- frontend maps that state into the existing board objects
- visible actions are replayed through the existing PvC board primitives wherever possible

## PvP flow

Current PvP flow is:

1. Player builds or reuses a deck from the existing deck screen.
2. Player clicks `Play vs Player`.
3. Frontend sends:
   - anonymous `playerId`
   - generated display name
   - current deck snapshot
4. Backend either queues the player or matches them.
5. Once matched, both players confirm they are ready.
6. Backend chooses the starting player, with faction overrides where applicable.
7. Coin banner is shown.
8. Both players complete redraw independently.
9. Backend moves the match into active play.
10. Frontend shows round-start and turn banners.
11. During the match:
    - backend validates actions
    - backend updates authoritative state
    - backend pushes state updates over WebSocket
    - frontend applies state and replays visible events
12. On round end:
    - backend resolves winner, health loss, faction passives, and next-round state
    - frontend runs round-end and next-round presentation
13. On match end:
    - winner is shown
    - session returns to the home/deck flow

## Snapshot model

The frontend currently uses a hybrid PvP model:

- backend snapshots are the source of truth
- backend event logs provide ordered visible actions
- frontend replays supported events and reconciles the rest from the latest snapshot

In practice this means:

1. the frontend fetches an initial player-scoped match snapshot
2. the frontend subscribes to `match_state` updates over WebSocket
3. each new snapshot includes an event log with increasing sequence numbers
4. the frontend replays new supported events
5. the frontend uses the snapshot to recover any state that was not fully covered by event replay

This is why PvP can already recover from reconnects and refreshes even though presentation parity work is still ongoing.

## Design goals

The PvP implementation is aiming for one product rule:

- PvP should feel the same as PvC from the player point of view

That means:

- same redraw flow
- same turn banners
- same card movement expectations
- same round-end expectations
- same card rules
- same leader and faction behavior

The main difference is only controller source:

- PvC: opponent actions come from AI
- PvP: opponent actions come from a remote player, validated by the backend

## How PvP is designed

PvP is built around these design decisions:

- backend is authoritative for legality and hidden information
- frontend should not invent card results locally
- frontend should reuse the original board animation and notification system as much as possible
- player-scoped state is used so the client never receives the opponent hand or other hidden details
- anonymous identity is used for v1, stored locally

## Transport model

PvP currently uses:

- HTTP for actions and bootstrap requests
- WebSocket for queue and match state push

Snapshots are still part of the current frontend flow. The long-term direction is event-driven replay for full parity with PvC presentation, with snapshots mainly used for bootstrap and recovery.

## Current UI behavior

The deck screen now contains:

- `Play vs Computer`
- `Play vs Player`

PvP-only UI additions include:

- queue status
- ready confirmation
- redraw timer
- turn timer
- forfeit button

PvC behavior is intended to remain unchanged.

## Current status

What is already in place:

- anonymous PvP identity
- queueing and matchmaking
- ready flow
- redraw phase
- turn timer from backend deadline
- pass and forfeit
- server-backed match state
- WebSocket state push
- many card, faction, and leader mechanics already ported into the backend

What is still being refined:

- redraw selector stability
- full 1:1 presentation parity with PvC
- some event replay and animation timing paths
- remaining edge-case rule verification

## Rules

The game follows the original Gwent structure:

- win two out of three rounds
- highest total wins the round
- each turn normally consists of playing one card or passing
- leader abilities and faction effects depend on the selected deck

## Features

### All cards from TW3 + DLC

The card pool includes the base game and DLC additions, including Skellige.

### Faithful board presentation

The project aims to keep the original look, board layout, and general notification style.

### AI opponent

`Play vs Computer` keeps the original local AI-driven game mode.

### Deck customization

Decks can be customized from the existing deck screen and reused for PvP queueing.

### Music

Gwent music tracks are streamed from YouTube and can be toggled from the existing UI controls.
