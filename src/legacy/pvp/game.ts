class Game {
	constructor() {
		this.turnDurationSeconds = 45;
		this.turnTimer = null;
		this.turnTimerDeadline = 0;
		this.turnTimerElem = document.getElementById("turn-timer");
		this.turnTimerTextElem = this.turnTimerElem ? this.turnTimerElem.getElementsByTagName("span")[0] : null;
		this.forfeitButtonElem = document.getElementById("forfeit-button");
		this.endScreen = document.getElementById("end-screen");
		let buttons = this.endScreen.getElementsByTagName("button");
		this.customize_elem = buttons[0];
		this.replay_elem = buttons[1];
		this.customize_elem.addEventListener("click", () => this.returnToCustomization(), false);
		this.replay_elem.addEventListener("click", () => this.restartGame(), false);
		this.reset();
	}
	
	reset() {
		this.setMode("pvc");
		this.activeMatchId = null;
		this.activeMatchBootstrap = null;
		this.lastPvPTimerKey = null;
		this.lastPvPTurnNoticeKey = null;
		this.lastPvPActionNoticeKey = null;
		this.lastPvPCoinMatchId = null;
		this.lastPvPStartMatchId = null;
		this.lastPvPRoundNoticeKey = null;
		this.lastPvPRoundStartKey = null;
		this.pvpBoardEntered = false;
		this.deferPvPTimer = false;
		this.pvpNoticePromise = Promise.resolve();
		this.clearTurnTimer();
		this.renderTurnTimer(this.turnDurationSeconds);
		this.firstPlayer;
		this.currPlayer = null;
		
		this.gameStart = [];
		this.roundStart = [];
		this.roundEnd = [];
		this.turnStart = [];
		this.turnEnd = [];
		
		this.roundCount = 0;
		this.roundHistory = [];
		
		this.randomRespawn = false;
		this.doubleSpyPower = false;
		
		weather.reset();
		board.row.forEach(r => r.reset());
	}

	queuePvPNotice(name, duration = 1200){
		this.pvpNoticePromise = this.pvpNoticePromise.then(() => ui.notification(name, duration));
	}
	
	// Sets up player faction abilities and psasive leader abilities
	initPlayers(p1, p2){
		let l1 = ability_dict[p1.leader.abilities[0]];
		let l2 = ability_dict[p2.leader.abilities[0]];
		if (l1 === ability_dict["emhyr_whiteflame"] || l2 === ability_dict["emhyr_whiteflame"]){
			p1.disableLeader();
			p2.disableLeader();
		} else {
			initLeader(p1, l1);
			initLeader(p2, l2);
		}
		if (p1.deck.faction === p2.deck.faction && p1.deck.faction === "scoiatael")
			return;
		initFaction(p1);
		initFaction(p2);
		
		function initLeader(player, leader){
			if (leader.placed)
				leader.placed(player.leader);
			Object.keys(leader).filter(key => game[key]).map(key => game[key].push(leader[key]));
		}
		
		function initFaction(player){
			if (factions[player.deck.faction] && factions[player.deck.faction].factionAbility)
				factions[player.deck.faction].factionAbility(player);
		}
	}
	
	// Sets initializes player abilities, player hands and redraw
	async startGame() {
		ui.toggleMusic_elem.classList.remove("music-customization");
		this.initPlayers(player_me, player_op);
		await Promise.all([...Array(10).keys()].map( async () => {
			await player_me.deck.draw(player_me.hand);
			await player_op.deck.draw(player_op.hand);
		}));
		
		await this.runEffects(this.gameStart);
		if (!this.firstPlayer)
			this.firstPlayer = await this.coinToss();
		this.initialRedraw();
	}
	
	// Simulated coin toss to determine who starts game
	async coinToss(){
		this.firstPlayer = (Math.random() < 0.5) ? player_me : player_op;
		await ui.notification(this.firstPlayer.tag + "-coin", 1200);
		return this.firstPlayer;
	}
	
	// Allows the player to swap out up to two cards from their iniitial hand
	async initialRedraw(){
		for (let i=0; i< 2; i++)
			player_op.controller.redraw();
		await ui.queueCarousel(player_me.hand, 2, async (c, i) => await player_me.deck.swap(c, c.removeCard(i)), c => true, true, true, "Choose up to 2 cards to redraw.");
		ui.enablePlayer(false);
		game.startRound();
	}
	
	// Initiates a new round of the game
	async startRound(){
		this.roundCount++;
		this.currPlayer = (this.roundCount%2 === 0) ? this.firstPlayer : this.firstPlayer.opponent();
		await this.runEffects(this.roundStart);
		
		if ( !player_me.canPlay() )
			player_me.setPassed(true);
		if ( !player_op.canPlay() )
			player_op.setPassed(true);
		
		if (player_op.passed && player_me.passed)
			return this.endRound();
		
		if (this.currPlayer.passed)
			this.currPlayer = this.currPlayer.opponent();
		
		await ui.notification("round-start", 1200);
		if (this.currPlayer.opponent().passed)
			await ui.notification(this.currPlayer.tag + "-turn", 1200);
		
		this.startTurn();
	}
	
	// Starts a new turn. Enables client interraction in client's turn.
	async startTurn() {
		await this.runEffects(this.turnStart);
		if (!this.currPlayer.opponent().passed){
			this.currPlayer = this.currPlayer.opponent();
			await ui.notification(this.currPlayer.tag + "-turn", 1200);
		}
		if (this.mode === "pvp")
			this.startTurnTimer();
		else
			this.renderTurnTimer(this.turnDurationSeconds);
		ui.enablePlayer(this.currPlayer === player_me);
		this.currPlayer.startTurn();
	}
	
	// Ends the current turn and may end round. Disables client interraction in client's turn.
	async endTurn() {
		this.clearTurnTimer();
		if (this.currPlayer === player_me)
			ui.enablePlayer(false);
		await this.runEffects(this.turnEnd);
		if (this.currPlayer.passed)
			await ui.notification(this.currPlayer.tag + "-pass", 1200);
		if (player_op.passed && player_me.passed)
			this.endRound();
		else
			this.startTurn();
	}
	
	// Ends the round and may end the game. Determines final scores and the round winner.
	async endRound() {
		this.clearTurnTimer();
		let dif = player_me.total - player_op.total;
		if (dif === 0) {
			let nilf_me = player_me.deck.faction === "nilfgaard", nilf_op = player_op.deck.faction === "nilfgaard";
			dif = nilf_me ^ nilf_op ? nilf_me ? 1 : -1 : 0;
		}
		let winner = dif > 0 ? player_me : dif < 0 ? player_op : null;
		let verdict = {winner: winner, score_me: player_me.total, score_op: player_op.total}
		this.roundHistory.push(verdict);
		
		await this.runEffects(this.roundEnd);
		
		board.row.forEach( row => row.clear() );
		weather.clearWeather();
		
		player_me.endRound( dif > 0);
		player_op.endRound( dif < 0);
		
		if (dif > 0)
			await ui.notification("win-round", 1200);
		else if (dif < 0)
			await ui.notification("lose-round", 1200);
		else
			await ui.notification("draw-round", 1200);
		
		if (player_me.health === 0 || player_op.health === 0)
			this.endGame();
		else
			this.startRound();
	}
	
	// Sets up and displays the end-game screen
	async endGame() {
		let endScreen = document.getElementById("end-screen");
		let rows = endScreen.getElementsByTagName("tr");
		rows[1].children[0].innerHTML = player_me.name;
		rows[2].children[0].innerHTML = player_op.name;
		
		for (let i=1; i<4; ++i) {
			let round = this.roundHistory[i-1];
			rows[1].children[i].innerHTML = round ? round.score_me : 0;
			rows[1].children[i].style.color = round && round.winner === player_me ? "goldenrod" : "";
			
			rows[2].children[i].innerHTML = round ? round.score_op : 0;
			rows[2].children[i].style.color = round && round.winner === player_op ? "goldenrod" : "";
		}
		
		endScreen.children[0].className = "";
		if (player_op.health <= 0 && player_me.health <= 0) {
			endScreen.getElementsByTagName("p")[0].classList.remove("hide");
			endScreen.children[0].classList.add("end-draw");
		} else if (player_op.health === 0){
			endScreen.children[0].classList.add("end-win");
		} else {
			endScreen.children[0].classList.add("end-lose");
		}
		
		fadeIn(endScreen, 300);
		ui.enablePlayer(true);
	}
	
	// Returns the client to the deck customization screen
	returnToCustomization(){
		this.reset();
		if (player_me)
			player_me.reset();
		if (player_op)
			player_op.reset();
		ui.toggleMusic_elem.classList.add("music-customization");
		this.endScreen.classList.add("hide");
		document.getElementById("deck-customization").classList.remove("hide");
	}
	
	// Restarts the last game with the dame decks
	restartGame(){
		this.reset();
		if (player_me)
			player_me.reset();
		if (player_op)
			player_op.reset();
		this.endScreen.classList.add("hide");
		this.startGame();
	}
	
	// Executes effects in list. If effect returns true, effect is removed.
	async runEffects(effects){
		for (let i=effects.length-1; i>=0; --i){
			let effect = effects[i];
			if (await effect())
				effects.splice(i,1)
		}
	}

	startTurnTimer(deadlineAt) {
		this.clearTurnTimer();
		this.turnTimerDeadline = deadlineAt ? new Date(deadlineAt).getTime() : Date.now() + this.turnDurationSeconds * 1000;
		if (!Number.isFinite(this.turnTimerDeadline))
			this.turnTimerDeadline = Date.now() + this.turnDurationSeconds * 1000;
		this.renderTurnTimer(Math.max(0, Math.ceil((this.turnTimerDeadline - Date.now()) / 1000)), "Turn");
		this.turnTimer = setInterval(() => {
			let remaining = Math.max(0, Math.ceil((this.turnTimerDeadline - Date.now()) / 1000));
			this.renderTurnTimer(remaining, "Turn");
			if (remaining <= 0) {
				this.clearTurnTimer();
				if (
					this.mode === "pvp"
					&& this.activeMatchId
					&& dm
					&& this.activeMatchBootstrap
					&& this.activeMatchBootstrap.status === "active"
					&& this.activeMatchBootstrap.currentTurnPlayerId === this.activeMatchBootstrap.self.playerId
					&& !this.activeMatchBootstrap.self.passed
				)
					dm.sendPvPAction("pass");
			}
		}, 250);
	}

	clearTurnTimer() {
		if (this.turnTimer) {
			clearInterval(this.turnTimer);
			this.turnTimer = null;
		}
	}

	renderTurnTimer(seconds, label) {
		if (!this.turnTimerElem || !this.turnTimerTextElem)
			return;
		this.turnTimerElem.classList.toggle("hide", this.mode !== "pvp");
		if (this.forfeitButtonElem)
			this.forfeitButtonElem.classList.toggle("hide", this.mode !== "pvp");
		this.turnTimerTextElem.innerHTML = (label ? label + " " : "") + seconds + "s";
		this.turnTimerElem.classList.toggle("timer-warning", seconds <= 15 && seconds > 5);
		this.turnTimerElem.classList.toggle("timer-danger", seconds <= 5);
	}

	setMode(mode) {
		this.mode = mode;
		this.renderTurnTimer(this.turnDurationSeconds, "Turn");
	}

	handlePassAction() {
		if (!player_me)
			return;
		if (this.mode === "pvp") {
			if (dm && this.activeMatchId)
				dm.sendPvPAction("pass");
			return;
		}
		player_me.passRound();
	}

	createDeckFromSnapshot(deckJson) {
		let deck = typeof deckJson === "string" ? JSON.parse(deckJson) : deckJson;
		return {
			faction: deck.faction,
			leader: card_dict[deck.leader],
			cards: deck.cards ? deck.cards.map(c => ({index: c[0], count: c[1]})) : []
		};
	}

	resetPileCount(deck, count){
		deck.reset();
		deck.cards = [];
		for (let i=0; i<count; ++i) {
			deck.cards.push(null);
			deck.addCardElement();
		}
		deck.resize();
	}

	populateHand(hand, holder, ids){
		hand.reset();
		ids.forEach(entry => {
			let card = new Card(card_dict[entry.cardId], holder);
			card.cardId = entry.cardId;
			card.pvpInstanceId = entry.instanceId;
			hand.addCard(card);
		});
	}

	applyPvPRedrawResult(previousState, nextState, selectedCardInstanceId){
		if (!player_me || !player_me.hand || !nextState || !nextState.self)
			return;
		let liveSelectedCard = dm && dm.findPvPCardInContainer
			? dm.findPvPCardInContainer(player_me.hand, selectedCardInstanceId)
			: null;
		if (!liveSelectedCard) {
			this.populateHand(player_me.hand, player_me, nextState.self.hand);
		} else {
			player_me.hand.removeCard(liveSelectedCard);
		}
		let previousHandIds = new Set(previousState && previousState.self && previousState.self.hand
			? previousState.self.hand.map(entry => entry.instanceId)
			: []);
		let addedEntry = nextState.self.hand.find(entry => !previousHandIds.has(entry.instanceId));
		if (addedEntry && liveSelectedCard) {
			let addedCard = new Card(card_dict[addedEntry.cardId], player_me);
			addedCard.cardId = addedEntry.cardId;
			addedCard.pvpInstanceId = addedEntry.instanceId;
			player_me.hand.addCard(addedCard);
		}
		this.resetPileCount(player_me.deck, nextState.self.deckCount);
	}

	syncPvPPlayerState(player, state, isSelf){
		if (!player || !state)
			return;
		player.halfWeather = !!state.halfWeather;
		player.setPassed(state.passed);
		if (state.leaderAvailable)
			player.enableLeader();
		else
			player.disableLeader();
		document.getElementById("gem1-" + player.tag).classList.toggle("gem-on", state.health >= 1);
		document.getElementById("gem2-" + player.tag).classList.toggle("gem-on", state.health >= 2);
		player.grave.reset();
		if (state.graveCount && state.graveCount > 0) {
			for (let i=0; i<state.graveCount; i++)
				player.grave.addPlaceholder ? player.grave.addPlaceholder() : player.grave.addCardElement();
		}
		player.grave.resize();
		if (isSelf) {
			this.populateHand(player.hand, player, state.hand);
			this.resetPileCount(player.deck, state.deckCount);
		} else {
			player.hand.cards = new Array(state.handCount).fill(null);
			player.hand.resize();
			this.resetPileCount(player.deck, state.deckCount);
		}
	}

	resetPvPBoardRows(){
		weather.reset();
		board.row.forEach(row => row.reset());
		player_me.total = 0;
		player_op.total = 0;
		document.getElementById("score-total-me").children[0].innerHTML = "0";
		document.getElementById("score-total-op").children[0].innerHTML = "0";
	}

	renderPvPRowState(row, ids, holder){
		ids.forEach(entry => {
			let cardId = typeof entry === "number" ? entry : entry && entry.cardId;
			if (!card_dict[cardId])
				return;
			let card = new Card(card_dict[cardId], holder);
			if (entry && entry.instanceId)
				card.pvpInstanceId = entry.instanceId;
			CardContainer.prototype.addCard.call(row, card, row.cards.length);
			row.updateState(card, true);
			card.elem.classList.add("noclick");
		});
		row.resize();
		row.updateScore();
	}

	renderPvPSpecialState(row, id, holder){
		if (id === null || id === undefined)
			return;
		let card = new Card(card_dict[id], holder);
		row.special = card;
		row.elem_special.appendChild(card.elem);
		row.updateState(card, true);
		card.elem.classList.add("noclick");
		row.updateScore();
	}

	renderPvPWeatherState(ids){
		ids.forEach(id => {
			let card = new Card(card_dict[id], player_me);
			CardContainer.prototype.addCard.call(weather, card, weather.cards.length);
			card.elem.classList.add("noclick");
			weather.changeWeather(card, x => ++weather.types[x].count === 1, (r,t) => r.addOverlay(t.name));
		});
		weather.resize();
	}

	renderPvPBoardState(state){
		this.resetPvPBoardRows();
		this.renderPvPRowState(board.row[2], state.opponent.rows.close, player_op);
		this.renderPvPRowState(board.row[1], state.opponent.rows.ranged, player_op);
		this.renderPvPRowState(board.row[0], state.opponent.rows.siege, player_op);
		this.renderPvPSpecialState(board.row[2], state.opponent.specialRows.close, player_op);
		this.renderPvPSpecialState(board.row[1], state.opponent.specialRows.ranged, player_op);
		this.renderPvPSpecialState(board.row[0], state.opponent.specialRows.siege, player_op);
		this.renderPvPRowState(board.row[3], state.self.rows.close, player_me);
		this.renderPvPRowState(board.row[4], state.self.rows.ranged, player_me);
		this.renderPvPRowState(board.row[5], state.self.rows.siege, player_me);
		this.renderPvPSpecialState(board.row[3], state.self.specialRows.close, player_me);
		this.renderPvPSpecialState(board.row[4], state.self.specialRows.ranged, player_me);
		this.renderPvPSpecialState(board.row[5], state.self.specialRows.siege, player_me);
		this.renderPvPWeatherState(state.gameState.weather);
		player_me.total = state.self.total;
		player_op.total = state.opponent.total;
		document.getElementById("score-total-me").children[0].innerHTML = state.self.total;
		document.getElementById("score-total-op").children[0].innerHTML = state.opponent.total;
		board.updateLeader();
	}

	enterPvPMatch(state){
		if (!state || !state.self || !state.opponent)
			return;
		let meDeck = this.createDeckFromSnapshot(state.self.deck);
		let opDeck = this.createDeckFromSnapshot(state.opponent.deck);
		this.reset();
		document.querySelector("#leader-me .leader-container").innerHTML = "";
		document.querySelector("#leader-op .leader-container").innerHTML = "";
		player_me = new Player(0, state.self.displayName, meDeck);
		player_op = new Player(1, state.opponent.displayName, opDeck);
		player_me.setController(new Controller());
		player_op.setController(new Controller());
		player_me.disableLeader();
		player_op.disableLeader();
		document.getElementById("deck-customization").classList.add("hide");
		ui.toggleMusic_elem.classList.remove("music-customization");
		this.setMode("pvp");
		this.activeMatchId = state.matchId;
		this.activeMatchBootstrap = state;
		this.pvpBoardEntered = true;
		ui.enablePlayer(true);
		this.applyPvPState(state);
	}

	async announcePvPCoin(state){
		if (this.lastPvPCoinMatchId === state.matchId)
			return;
		this.lastPvPCoinMatchId = state.matchId;
		this.queuePvPNotice(state.currentTurnPlayerId === state.self.playerId ? "me-coin" : "op-coin", 1200);
		await this.pvpNoticePromise;
	}

	async announcePvPStart(state){
		let startKey = state.matchId + ":" + state.round + ":" + state.turnNumber + ":" + state.currentTurnPlayerId;
		if (this.lastPvPStartMatchId === startKey)
			return;
		this.lastPvPStartMatchId = startKey;
		this.lastPvPTurnNoticeKey = startKey + ":" + state.status;
		this.queuePvPNotice("round-start", 1200);
		await this.pvpNoticePromise;
	}

	applyPvPState(state){
		if (this.mode !== "pvp" || !player_me || !player_op)
			return;
		ui.enablePlayer(true);
		this.activeMatchId = state.matchId;
		this.activeMatchBootstrap = state;
		this.syncPvPPlayerState(player_me, state.self, true);
		this.syncPvPPlayerState(player_op, state.opponent, false);
		this.renderPvPBoardState(state);
		let hasPendingChoice = !!(state.gameState && state.gameState.pendingChoice);
		document.getElementById("stats-me").classList.remove("current-turn");
		document.getElementById("stats-op").classList.remove("current-turn");
		let isMyTurn = state.status === "active" && state.currentTurnPlayerId === state.self.playerId && !state.self.passed && !hasPendingChoice;
		let activeStats = isMyTurn ? document.getElementById("stats-me") : state.status === "active" ? document.getElementById("stats-op") : null;
		if (activeStats)
			activeStats.classList.add("current-turn");
		document.getElementById("pass-button").classList.toggle("noclick", !isMyTurn);
		player_me.hand.cards.forEach(card => card.elem.classList.remove("noclick"));
		let lastAction = state.actionLog && state.actionLog.length > 0 ? state.actionLog[state.actionLog.length - 1] : null;
		let passNoticeKey = lastAction && lastAction.type === "pass" ? lastAction.playerId + ":" + lastAction.at : null;
		if (passNoticeKey && this.lastPvPActionNoticeKey !== passNoticeKey) {
			this.lastPvPActionNoticeKey = passNoticeKey;
			this.lastPvPTurnNoticeKey = null;
			this.queuePvPNotice(lastAction.playerId === state.self.playerId ? "me-pass" : "op-pass", 1200);
		}
		if (!passNoticeKey && state.eventLog && state.eventLog.length > 0) {
			let lastPassEvent = [...state.eventLog].reverse().find(event => event.type === "player_passed");
			if (lastPassEvent) {
				let eventKey = lastPassEvent.playerId + ":" + lastPassEvent.seq;
				if (this.lastPvPActionNoticeKey !== eventKey) {
					this.lastPvPActionNoticeKey = eventKey;
					this.lastPvPTurnNoticeKey = null;
					this.queuePvPNotice(lastPassEvent.playerId === state.self.playerId ? "me-pass" : "op-pass", 1200);
				}
			}
		}
		let timerKey = state.matchId + ":" + state.round + ":" + state.turnNumber + ":" + state.currentTurnPlayerId;
		let turnNoticeKey = timerKey + ":" + state.status;
		if (state.status === "active" && state.gameState.phase === "active" && !this.deferPvPTimer) {
			this.turnTimerElem.classList.toggle("timer-op", !isMyTurn);
			this.turnTimerElem.classList.remove("timer-redraw");
			if (this.lastPvPTimerKey !== timerKey) {
				this.lastPvPTimerKey = timerKey;
				this.startTurnTimer(state.turnDeadlineAt);
			}
			if (this.lastPvPTurnNoticeKey !== turnNoticeKey) {
				this.lastPvPTurnNoticeKey = turnNoticeKey;
				this.queuePvPNotice(isMyTurn ? "me-turn" : "op-turn", 1200);
			}
		} else {
			this.clearTurnTimer();
			this.turnTimerElem.classList.remove("timer-op");
			this.turnTimerElem.classList.toggle("timer-redraw", state.status === "active" && state.gameState.phase === "redraw");
			if (state.status === "active" && state.gameState.phase === "redraw" && state.gameState.redrawDeadlineAt) {
				let redrawDeadline = new Date(state.gameState.redrawDeadlineAt).getTime();
				let remaining = Number.isFinite(redrawDeadline) ? Math.max(0, Math.ceil((redrawDeadline - Date.now()) / 1000)) : this.turnDurationSeconds;
				this.renderTurnTimer(remaining, "Redraw");
			} else
				this.renderTurnTimer(this.turnDurationSeconds, "Turn");
		}
	}

	isSupportedPvPCard(card){
		return this.mode === "pvp"
			&& this.activeMatchBootstrap
			&& this.activeMatchBootstrap.status === "active"
			&& this.activeMatchBootstrap.gameState.phase === "active"
			&& this.activeMatchBootstrap.currentTurnPlayerId === this.activeMatchBootstrap.self.playerId
			&& card
			&& card.holder === player_me
			&& player_me.hand.cards.includes(card)
			&& (
				(["close", "ranged", "siege"].includes(card.row) && card.abilities.every(ability => ["hero", "bond", "morale", "horn", "mardroeme", "berserker"].includes(ability)))
				|| (["close", "ranged", "siege"].includes(card.row) && card.abilities.some(ability => ["scorch_c", "scorch_r", "scorch_s"].includes(ability)))
				|| card.name === "Decoy"
				|| card.name === "Scorch"
				|| (["close", "ranged", "siege"].includes(card.row) && card.abilities.includes("spy"))
				|| (["close", "ranged", "siege"].includes(card.row) && card.abilities.includes("medic"))
				|| (["close", "ranged", "siege"].includes(card.row) && card.abilities.includes("muster"))
				|| (["close", "ranged", "siege"].includes(card.row) && card.abilities.some(ability => ["avenger", "avenger_kambi"].includes(ability)))
				|| (card.row === "agile" && (card.abilities.length === 0 || card.abilities.every(ability => ["hero", "morale"].includes(ability))))
				|| card.name === "Commander's Horn"
				|| card.name === "Mardroeme"
				|| (card.faction === "weather" && card.abilities.every(ability => ["clear", "frost", "fog", "rain", "storm"].includes(ability)))
			);
	}

	getPvPRowName(row){
		if (row === weather)
			return "weather";
		if (row === board.row[3] || row === board.row[2])
			return "close";
		if (row === board.row[4] || row === board.row[1])
			return "ranged";
		if (row === board.row[5] || row === board.row[0])
			return "siege";
		return "";
	}

	async forfeitMatch() {
		if (this.mode !== "pvp")
			return;
		await new Promise(resolve => {
			ui.popup("Forfeit", async () => {
				if (dm && this.activeMatchId)
					await dm.sendPvPAction("forfeit");
				resolve(true);
			}, "Cancel", () => resolve(false), "Forfeit Match", "If you forfeit this PvP match, the other player wins immediately.");
		});
	}
	
}
