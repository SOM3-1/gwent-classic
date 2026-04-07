# gwent-classic
![cover](https://user-images.githubusercontent.com/26311830/116256903-f1599b00-a7b6-11eb-84a1-16dcb5c9bfc6.jpg)

A browser remake of the original Gwent minigame from The Witcher 3: Wild Hunt including all cards from the DLC. Run it locally with Vite using the commands below. For the best experience, play in fullscreen which can be toggled in most browsers with F11.

## Run locally
This project now runs with React, TypeScript, and Vite.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

To create a production build:

```bash
npm run build
npm run preview
```

## Multiplayer service
The current UI includes a PvP entry flow backed by a separate client-side service layer. The actual match server is not bundled yet, but the frontend is prepared to connect to one.

Set a multiplayer API base URL before starting Vite:

```bash
export VITE_GWENT_MULTIPLAYER_URL=http://localhost:3001
npm run dev
```

The client will send PvP queue requests to:

- `POST /queue/join`
- `POST /queue/leave`

`/queue/join` currently expects JSON shaped like:

```json
{
  "playerId": "anonymous-client-id",
  "displayName": "Wolf-2731",
  "deck": "{\"faction\":\"realms\",\"leader\":24,\"cards\":[[5,1]]}"
}
```

If you want to host your own multiplayer backend, point `VITE_GWENT_MULTIPLAYER_URL` at your server and implement those endpoints first. The client-side identity is anonymous and stored in `localStorage`, so no account system is required for local testing.

For open-source hosting, a Dockerized Node/TypeScript WebSocket server is the intended path. Public matchmaking should come first. Private friend invites or join-by-session-code should be added after the queue flow is stable.

## Rules
The game is played in the same way as the original. The player aims to win two of three rounds, where victory within a given round is determined by whoever scores the most points. 

#### Cards and Points
Points are obtained by placing down unit cards, each with their corresponding values. Some unit cards have special effects as denoted by a symbol on their left side. The cards and their effects can be examined by selecting them or the row they have been palced on. The game also includes a nubmer of special cards that apply effects like negative weather conditions or bosting card points when played.

#### Turns
A turn consists of playing a single card. Your opponent then does the same until either one of you passes. At this point the remaining player can continue to place cards until they decide to pass. When both players have passed the round is ended. In addition of placing cards, they player may also activate their leader ability by clicking on their leader if it is available to them.

#### Factions
The faction you pick will affect your game in three ways. It limits the specific cards you can use to neutral cards, special cards, and the unit cards in your faction. This includes the leader card that you can pick and the corresponding leader ability. Each faction also has a special effect that is displayed when selecting a faction and at the top of the customization screen for the currently selected faction.

## Features
#### All cards from the TW3 + DLC
All cards from the base games and DLC can be used by you and the AI. This includes the additions from Hearts of Stone and Skellige as a playable deck from Blood and Wine. The total count of cards available corresponds to the number you can find in the original game.

#### Faithful to the original minigame
This remake aims to resemble the orignal minigame as closely as possible from the font to the UI layout and notifications. Some changes have been made in the form of buttons to toggle the music and pass your current turn. The deck customization screen also includes buttons to upload and download decks.

#### AI opponent
When you start a game you will face off againsts a fully implemented AI oponent. The opponent uses premade decks and will make intelligent decisions based on the cards in its hand, on the table, and in the discard piles.

#### Customize and save decks
You can select a faction to play as at the top of the screen and then add and remove cards from your deck by clicking on the cards in either scroll-down menu. You can also pick a leader card by selecting the current leader and scrolling through the options for that faction. The current deck can be downloaded and reused for future multiplayer queueing. Deck upload is currently hidden while the multiplayer flow is being stabilized.

#### Music tracks
The gwent music tracks are streamed from YouTube and can be toggled by pressing the music icon in the center of the customization screen or the bottom-left of the game screen. For some browsers, the page may need to be refreshed once before the music can be activated.
