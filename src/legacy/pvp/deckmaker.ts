// Screen used to customize, import and export deck contents
class DeckMaker {
	constructor() {
		this.elem = document.getElementById("deck-customization");
		this.bank_elem = document.getElementById("card-bank");
		this.deck_elem = document.getElementById("card-deck");
		this.leader_elem = document.getElementById("card-leader");
		this.leader_elem.children[1].addEventListener("click", () => this.selectLeader(), false);
		
		this.faction = "realms";
		this.setFaction(this.faction, true);
		
		let start_deck = JSON.parse(premade_deck[0]);
		start_deck.cards = start_deck.cards.map(c => ({index: c[0], count: c[1]}) );
		this.setLeader(start_deck.leader);
		this.makeBank(this.faction, start_deck.cards);
		
		this.change_elem = document.getElementById("change-faction");
		this.change_elem.addEventListener("click", () => this.selectFaction(), false);
		
		this.playerProfile = window.__GWENT_SERVICES__ ? window.__GWENT_SERVICES__.identity.getProfile() : {id: "local-player", displayName: "Player"};
		this.multiplayerService = window.__GWENT_SERVICES__ ? window.__GWENT_SERVICES__.multiplayer : null;
		this.queueElem = document.getElementById("pvp-status");
		this.queueStatusElem = document.getElementById("pvp-status-line");
		this.pvpPassButton = document.getElementById("pvp-pass-turn");
		this.pvpCancelButton = document.getElementById("cancel-pvp-queue");
		this.queueActive = false;
		this.queuePollTimer = null;
		this.queueRealtimeUnsub = null;
		this.matchStatePollTimer = null;
		this.matchRealtimeUnsub = null;
		this.activeMatchState = null;
		this.redrawFlowActive = false;
		this.pvpStartStateKey = null;
		this.pvpCompletionHandledMatchId = null;
		this.queueStartedAt = 0;
		this.pendingPvPCardMove = null;
		this.pendingPvPChoiceKey = null;
		this.pvpRoundTransitionActive = false;
		this.lastProcessedPvPEventSeq = 0;
		this.pvpEventReplayActive = false;
		this.pvpSelectorActive = false;
		this.pvpDeferredState = null;
		
		document.getElementById("download-deck").addEventListener("click", () => this.downloadDeck(), false);
		document.getElementById("play-vs-computer").addEventListener("click", () => this.startVsComputer(), false);
		document.getElementById("play-vs-player").addEventListener("click", () => this.startVsPlayer(), false);
		this.pvpCancelButton.addEventListener("click", () => this.cancelPvPQueue(), false);
		this.pvpPassButton.addEventListener("click", () => this.sendPvPAction("pass"), false);
		
		this.initPlayerProfile();
		this.update();
		this.resumeActivePvPSession();
	}

	initPlayerProfile() {
		document.getElementById("player-display-name").innerHTML = this.playerProfile.displayName;
		let endpoint = this.multiplayerService ? this.multiplayerService.getConfig() : {enabled:false, endpoint:""};
		let status = document.getElementById("multiplayer-endpoint-status");
		status.innerHTML = endpoint.enabled ? "Multiplayer service ready" : "Multiplayer service not configured";
		status.classList.toggle("service-online", endpoint.enabled);
		status.classList.toggle("service-offline", !endpoint.enabled);
	}

	async showModal(title, description, yesName, noName) {
		return new Promise(resolve => {
			ui.popup(yesName, () => resolve(true), noName, () => resolve(false), title, description);
		});
	}

	async showAlert(message, title) {
		await this.showModal(title ? title : "Notice", message, "OK", "");
	}

	async showConfirm(message, title, yesName, noName) {
		return await this.showModal(title ? title : "Confirm", message, yesName ? yesName : "Yes", noName ? noName : "No");
	}

	getActiveMatchStorageKey() {
		return "gwent.pvp.activeMatchId";
	}

	saveActiveMatchId(matchId) {
		localStorage.setItem(this.getActiveMatchStorageKey(), matchId);
	}

	clearActiveMatchId() {
		localStorage.removeItem(this.getActiveMatchStorageKey());
	}

	flushDeferredPvPState(){
		if (!this.pvpDeferredState)
			return;
		let deferredState = this.pvpDeferredState;
		this.pvpDeferredState = null;
		this.activeMatchState = deferredState;
		this.renderActiveMatchState(deferredState);
	}

	async handleCompletedPvPState(state){
		if (!state || state.status !== "completed" || this.pvpCompletionHandledMatchId === state.matchId)
			return false;
		this.pvpCompletionHandledMatchId = state.matchId;
		this.clearMatchStatePolling();
		game.clearTurnTimer();
		let winnerName = "Opponent";
		if (state.winnerPlayerId === state.self.playerId)
			winnerName = state.self.displayName;
		else if (state.opponent && state.winnerPlayerId === state.opponent.playerId)
			winnerName = state.opponent.displayName;
		await this.showAlert(winnerName + " wins the match.", "PvP Result");
		this.endPvPSession();
		return true;
	}

	async resumeActivePvPSession() {
		let matchId = localStorage.getItem(this.getActiveMatchStorageKey());
		if (!matchId || !this.multiplayerService)
			return;
		try {
			let state = await this.multiplayerService.getMatchState({
				playerId: this.playerProfile.id,
				matchId: matchId
			});
			game.setMode("pvp");
			game.activeMatchId = matchId;
			this.activeMatchState = state;
			this.queueElem.classList.remove("hide");
			this.pvpCancelButton.innerHTML = state.status === "completed" ? "Close Session" : state.status === "active" ? "Forfeit Match" : "Leave Match";
			this.pvpPassButton.classList.toggle("hide", state.status !== "active");
			this.renderActiveMatchState(state);
			if (state.status === "active")
				await this.startActivePvPMatch(state, false);
			else
				this.startMatchStatePolling();
		} catch (e) {
			this.endPvPSession();
		}
	}

	isMissingMatchError(error){
		return error && error.message && error.message.includes("Match not found");
	}
	
	// Called when client selects a deck faction. Clears previous cards and makes valid cards available.
	async setFaction(faction_name, silent){
		if (!silent && this.faction === faction_name)
			return false;
		if (!silent && !await this.showConfirm("Changing factions will clear the current deck. Continue?", "Change Faction", "Continue", "Cancel"))
			return false;
		this.elem.getElementsByTagName("h1")[0].innerHTML = factions[faction_name].name;
		this.elem.getElementsByTagName("h1")[0].style.backgroundImage = iconURL("deck_shield_" + faction_name);
		document.getElementById("faction-description").innerHTML = factions[faction_name].description;
		
		this.leaders = 
			card_dict.map((c,i) => ({index: i, card:c}) )
			.filter(c => c.card.deck === faction_name && c.card.row === "leader");
		if (!this.leader || this.faction !== faction_name) {
			this.leader = this.leaders[0];
			this.leader_elem.children[1].style.backgroundImage = largeURL(this.leader.card.deck + "_" + this.leader.card.filename);
		}
		this.faction = faction_name;
		return true;
	}
	
	// Called when client selects a leader for their deck
	setLeader(index){
		this.leader = this.leaders.filter( l => l.index == index)[0];
		this.leader_elem.children[1].style.backgroundImage = largeURL(this.leader.card.deck + "_" + this.leader.card.filename);
	}
	
	// Constructs a bank of cards that can be used by the faction's deck.
	// If a deck is provided, will not add cards to bank that are already in the deck.
	makeBank(faction, deck) {
		this.clear();
		let cards = card_dict.map((c,i) => ({card:c, index:i})).filter(
		p => [faction, "neutral", "weather", "special"].includes(p.card.deck) && p.card.row !== "leader");
		
		cards.sort( function(id1, id2) {
			let a = card_dict[id1.index], b = card_dict[id2.index];
			let c1 = {name: a.name, basePower: -a.strength, faction: a.deck};
			let c2 = {name: b.name, basePower: -b.strength, faction: b.deck};
			return Card.compare(c1, c2);
		});
		
		
		let deckMap = {};
		if (deck){
			for (let i of Object.keys(deck)) deckMap[deck[i].index] = deck[i].count;
		}
		cards.forEach( p => {
			let count = deckMap[p.index] !== undefined ? Number(deckMap[p.index]) : 0;
			this.makePreview(p.index, Number.parseInt(p.card.count) - count, this.bank_elem, this.bank,);
			this.makePreview(p.index, count, this.deck_elem, this.deck);
		});
	}
	
	// Creates HTML elements for the card previews
	makePreview(index, num, container_elem, cards){
		let card_data = card_dict[index];
		
		let elem = document.createElement("div");
		elem.style.backgroundImage = largeURL(card_data.deck + "_" + card_data.filename);
		elem.classList.add("card-lg");
		let count = document.createElement("div");
		elem.appendChild(count);
		container_elem.appendChild(elem);
		
		let bankID = {index: index, count: num, elem: elem};
		let isBank = cards === this.bank;
		count.innerHTML = bankID.count;
		cards.push(bankID);
		let cardIndex = cards.length-1;
		elem.addEventListener("click", () => this.select(cardIndex, isBank), false);

		return bankID;
	}
	
	// Updates the card preview elements when any changes are made to the deck
	update(){
		for (let x of this.bank) {
			if (x.count)
				x.elem.classList.remove("hide");
			else
				x.elem.classList.add("hide");
		}
		let total = 0, units = 0, special = 0, strength = 0, hero = 0;
		for (let x of this.deck) {
			let card_data = card_dict[x.index];
			if (x.count)
				x.elem.classList.remove("hide");
			else
				x.elem.classList.add("hide");
			total += x.count;
			if (card_data.deck === "special" || card_data.deck === "weather") {
				special += x.count;
				continue;
			}
			units += x.count;
			strength += card_data.strength * x.count;
			if (card_data.ability.split(" ").includes("hero"))
				hero += x.count;
		}
		this.stats = {total: total, units: units, special: special, strength: strength, hero: hero};
		this.updateStats();
	}
	
	// Updates and displays the statistics describing the cards currently in the deck
	updateStats(){
		let stats = document.getElementById("deck-stats");
		stats.children[1].innerHTML = this.stats.total;
		stats.children[3].innerHTML = this.stats.units +(this.stats.units < 22 ? "/22" : "");
		stats.children[5].innerHTML = this.stats.special + "/10";
		stats.children[7].innerHTML = this.stats.strength;
		stats.children[9].innerHTML = this.stats.hero;
		
		stats.children[3].style.color = this.stats.units < 22 ? "red" : "";
		stats.children[5].style.color = (this.stats.special > 10) ? "red" : "";
	}
	
	// Opens a Carousel to allow the client to select a leader for their deck
	selectLeader(){
		let container = new CardContainer();
		container.cards = this.leaders.map(c => {
			let card = new Card(c.card, player_me);
			card.data = c;
			return card;
		});
		
		let index = this.leaders.indexOf(this.leader);
		ui.queueCarousel(container, 1, (c,i) => {
			let data = c.cards[i].data;
			this.leader = data;
			this.leader_elem.children[1].style.backgroundImage = largeURL(data.card.deck + "_" + data.card.filename);
		}, () => true, false, true);
		Carousel.curr.index = index;
		Carousel.curr.update();
	}
	
	// Opens a Carousel to allow the client to select a faction for their deck
	selectFaction() {
		let container = new CardContainer();
		container.cards = Object.keys(factions).map( f => {
			return {abilities: [f], filename: f, desc_name: factions[f].name, desc: factions[f].description, faction: "faction"};
		});
		let index = container.cards.reduce((a,c,i) => c.filename === this.faction ? i : a, 0);
		ui.queueCarousel(container, 1, async (c,i) => {
			let change = await this.setFaction(c.cards[i].filename);
			if (!change)
				return;
			this.makeBank(c.cards[i].filename);
			this.update();
		}, () => true, false, true);
		Carousel.curr.index = index;
		Carousel.curr.update();
	}
	
	// Called when client selects s a preview card. Moves it from bank to deck or vice-versa then updates;
	select(index, isBank){
		if (isBank) {
			this.add(index, this.deck);
			this.remove(index, this.bank);
		} else {
			this.add(index, this.bank);
			this.remove(index, this.deck);
		}
		this.update();
	}
	
	// Adds a card to container (Bank or deck)
	add(index, cards) {
		let id = cards[index];
		id.elem.children[0].innerHTML = ++id.count;
	}
	
	// Removes a card from container (bank or deck)
	remove(index, cards) {
		let id = cards[index];
		id.elem.children[0].innerHTML = --id.count;
	}
	
	// Removes all elements in the bank and deck
	clear(){
		while (this.bank_elem.firstChild)
			this.bank_elem.removeChild(this.bank_elem.firstChild);
		while (this.deck_elem.firstChild)
			this.deck_elem.removeChild(this.deck_elem.firstChild);
		this.bank = [];
		this.deck = [];
		this.stats = {};
	}
	
	// Verifies current deck, creates the players and their decks, then starts a new game
	async startVsComputer(){
		let warning = "";
		if (this.stats.units < 22)
			warning += "Your deck must have at least 22 unit cards. \n";
		if (this.stats.special > 10)
			warning += "Your deck must have no more than 10 special cards. \n";
		if (warning != "")
			return await this.showAlert(warning, "Deck Requirements");
		
		let me_deck = { 
			faction: this.faction,
			leader: card_dict[this.leader.index], 
			cards: this.deck.filter(x => x.count > 0)
		};
		
		let op_deck = JSON.parse( premade_deck[randomInt(Object.keys(premade_deck).length)] );
		op_deck.cards = op_deck.cards.map(c => ({index:c[0], count:c[1]}) );
		//op_deck.leader = card_dict[op_deck.leader];
		
		let leaders = card_dict.filter(c => c.row === "leader" && c.deck === op_deck.faction);
		op_deck.leader = leaders[randomInt(leaders.length)];
		//op_deck.leader = card_dict.filter(c => c.row === "leader")[12];
		
		player_me = new Player(0, "Player 1", me_deck );
		player_op = new Player(1, "Player 2", op_deck);
		
		this.elem.classList.add("hide");
		game.setMode("pvc");
		game.startGame();
	}

	startNewGame(){
		return this.startVsComputer();
	}

	async startVsPlayer(){
		let warning = "";
		if (this.stats.units < 22)
			warning += "Your deck must have at least 22 unit cards. \n";
		if (this.stats.special > 10)
			warning += "Your deck must have no more than 10 special cards. \n";
		if (warning != "")
			return await this.showAlert(warning, "Deck Requirements");
		if (!this.multiplayerService) {
			return await this.showAlert("Multiplayer service layer is not available.", "Multiplayer");
		}
		this.clearQueuePolling();
		this.clearMatchStatePolling();
		this.activeMatchState = null;
		this.redrawFlowActive = false;
		this.pvpStartStateKey = null;
		this.clearActiveMatchId();
		game.activeMatchId = null;
		game.activeMatchBootstrap = null;
		
		this.queueActive = true;
		this.queueStartedAt = Date.now();
		game.setMode("pvp");
		this.queueElem.classList.remove("hide");
		this.queueStatusElem.innerHTML = "Finding opponent for " + this.playerProfile.displayName + "...";
		
		try {
			let result = await this.multiplayerService.joinQueue({
				playerId: this.playerProfile.id,
				displayName: this.playerProfile.displayName,
				deck: this.deckToJSON()
			});
			if (!this.queueActive)
				return;
			if (result.status === "service_unconfigured"){
				this.queueStatusElem.innerHTML = "Set a multiplayer server URL to enable PvP.";
				return;
			}
			if (result.status === "matched" && result.opponent) {
				await this.handleMatchedQueue(result);
				return;
			}
			this.queueStatusElem.innerHTML = "Queued for PvP. Waiting for match on " + result.endpoint;
			this.startQueuePolling();
		} catch (e) {
			this.queueStatusElem.innerHTML = "Unable to join PvP queue right now.";
		}
	}

	async cancelPvPQueue(){
		this.clearQueuePolling();
		if (this.activeMatchState && this.activeMatchState.status === "completed") {
			this.endPvPSession();
			return;
		}
		if (this.activeMatchState && this.activeMatchState.status === "matched" && game.activeMatchId) {
			await this.sendPvPAction("decline_ready");
			return;
		}
		if (game.activeMatchId) {
			await this.sendPvPAction("forfeit");
			return;
		}
		this.queueActive = false;
		this.queueStartedAt = 0;
		this.queueElem.classList.add("hide");
		this.queueStatusElem.innerHTML = "Not in queue";
		if (this.multiplayerService)
			await this.multiplayerService.cancelQueue({playerId: this.playerProfile.id});
	}

	startQueuePolling(){
		this.clearQueuePolling();
		if (this.multiplayerService && this.multiplayerService.getConfig().realtimeEnabled) {
			this.queueRealtimeUnsub = this.multiplayerService.subscribeQueueStatus({
				playerId: this.playerProfile.id,
				onUpdate: async (result) => {
					if (!this.queueActive)
						return;
					if (result.status === "idle") {
						this.queueActive = false;
						this.queueStartedAt = 0;
						this.queueElem.classList.add("hide");
						await this.showAlert("Queue expired after 3 minutes. Join again to keep searching.", "Queue Expired");
						return;
					}
					if (result.status === "matched" && result.opponent) {
						await this.handleMatchedQueue(result);
					}
				}
			});
			return;
		}
		this.queuePollTimer = setInterval(async () => {
			if (!this.queueActive || !this.multiplayerService)
				return;
			try {
				let result = await this.multiplayerService.getQueueStatus({playerId: this.playerProfile.id});
				if (!this.queueActive)
					return;
				if (result.status === "idle") {
					this.queueActive = false;
					this.queueStartedAt = 0;
					this.queueElem.classList.add("hide");
					await this.showAlert("Queue expired after 3 minutes. Join again to keep searching.", "Queue Expired");
					return;
				}
				if (result.status === "matched" && result.opponent) {
					await this.handleMatchedQueue(result);
				}
			} catch (e) {
			}
		}, 1000);
	}

	clearQueuePolling(){
		if (this.queueRealtimeUnsub) {
			this.queueRealtimeUnsub();
			this.queueRealtimeUnsub = null;
		}
		if (this.queuePollTimer) {
			clearInterval(this.queuePollTimer);
			this.queuePollTimer = null;
		}
	}

	async handleMatchedQueue(result){
		this.clearQueuePolling();
		this.queueActive = false;
		this.queueStatusElem.innerHTML = "Match found against " + result.opponent.displayName + ".";
		try {
			let bootstrap = await this.multiplayerService.getMatchBootstrap({
				playerId: this.playerProfile.id,
				matchId: result.matchId
			});
			this.storePvPBootstrap(bootstrap);
			let ready = await this.showConfirm("Matched with " + bootstrap.opponent.displayName + ". Start when both players are ready?", "Opponent Found", "Ready", "Cancel");
			if (!ready) {
				await this.sendPvPAction("decline_ready");
				return;
			}
			await this.sendPvPAction("ready");
		} catch (e) {
			await this.showAlert("Matched with " + result.opponent.displayName + ". Match bootstrap is not available right now.", "Opponent Found");
		}
	}

	storePvPBootstrap(bootstrap){
		game.activeMatchId = bootstrap.matchId;
		game.activeMatchBootstrap = bootstrap;
		this.activeMatchState = bootstrap;
		this.pendingPvPCardMove = null;
		this.lastProcessedPvPEventSeq = bootstrap.eventLog && bootstrap.eventLog.length > 0 ? bootstrap.eventLog[bootstrap.eventLog.length - 1].seq : 0;
		this.pvpCompletionHandledMatchId = null;
		this.saveActiveMatchId(bootstrap.matchId);
		this.queueElem.classList.remove("hide");
		this.pvpPassButton.classList.toggle("hide", bootstrap.status !== "active");
		this.pvpCancelButton.innerHTML = bootstrap.status === "active" ? "Forfeit Match" : "Leave Match";
		this.renderActiveMatchState(bootstrap);
		this.startMatchStatePolling();
	}

	async startActivePvPMatch(state, announce = true){
		let stateKey = state.matchId + ":" + state.gameState.phase + ":" + state.turnNumber + ":" + state.self.redrawComplete;
		if (this.pvpStartStateKey === stateKey)
			return;
		this.pvpStartStateKey = stateKey;
		game.deferPvPTimer = announce && state.gameState.phase === "active";
		this.queueElem.classList.add("hide");
		game.enterPvPMatch(state);
		this.lastProcessedPvPEventSeq = state.eventLog && state.eventLog.length > 0 ? state.eventLog[state.eventLog.length - 1].seq : this.lastProcessedPvPEventSeq;
		ui.enablePlayer(true);
		if (state.gameState.phase === "redraw") {
			if (announce)
				await game.announcePvPCoin(state);
			await this.runPvPRedrawFlow(state);
			return;
		}
		if (announce)
			await game.announcePvPStart(state);
		game.deferPvPTimer = false;
		game.applyPvPState(state);
		this.pvpPassButton.classList.remove("hide");
		this.pvpCancelButton.innerHTML = "Forfeit Match";
	}

	async runPvPRedrawFlow(state){
		if (this.redrawFlowActive || state.self.redrawComplete)
			return;
		this.redrawFlowActive = true;
		this.pvpPassButton.classList.add("hide");
		this.pvpCancelButton.innerHTML = "Forfeit Match";
		try {
			let latestState = state;
			game.applyPvPState(latestState);
			if (latestState.self.redrawRemaining > 0) {
				this.pvpSelectorActive = true;
				await ui.queueCarousel(
					player_me.hand,
					latestState.self.redrawRemaining,
					async (_container, _index, selectedCard) => {
						let selectedCardInstanceId = selectedCard && selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : "";
						if (!selectedCardInstanceId)
							return;
						let pickedEntry = latestState && latestState.self && latestState.self.hand
							? latestState.self.hand.find(entry => entry.instanceId === selectedCardInstanceId)
							: null;
						console.log("[pvp-redraw] pick", {
							instanceId: selectedCardInstanceId,
							cardId: pickedEntry ? pickedEntry.cardId : null
						});
						let previousState = latestState;
						latestState = await this.multiplayerService.sendMatchAction({
							playerId: this.playerProfile.id,
							matchId: game.activeMatchId,
							action: "redraw_card",
							cardInstanceId: selectedCardInstanceId
						});
						if (latestState && latestState.eventLog && latestState.eventLog.length > 0) {
							let last = latestState.eventLog[latestState.eventLog.length - 1];
							if (last && last.type === "redraw_card") {
								console.log("[pvp-redraw] result", {
									returnedCardId: last.returnedCardId,
									drawnCardId: last.drawnCardId
								});
							}
						}
						this.pvpDeferredState = null;
						this.activeMatchState = latestState;
						game.applyPvPRedrawResult(previousState, latestState, selectedCardInstanceId);
					},
					() => true,
					true,
					true,
					"Choose up to 2 cards to redraw."
				);
				this.pvpSelectorActive = false;
			}
			if (latestState.gameState && latestState.gameState.phase === "redraw" && !latestState.self.redrawComplete) {
				try {
					latestState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "finish_redraw"
					});
				} catch (e) {
					if (e && e.message && e.message.includes("Redraw phase is not active")) {
						latestState = await this.multiplayerService.getMatchState({
							playerId: this.playerProfile.id,
							matchId: game.activeMatchId
						});
					} else
						throw e;
				}
			}
			this.activeMatchState = latestState;
			this.renderActiveMatchState(latestState);
			if (latestState.gameState.phase === "active") {
				game.lastPvPStartMatchId = null;
				game.lastPvPTurnNoticeKey = null;
				game.deferPvPTimer = true;
				await this.startActivePvPMatch(latestState);
			}
		} catch (e) {
			this.pvpSelectorActive = false;
			await this.showAlert(e.message ? e.message : "Unable to complete PvP redraw.", "PvP");
		} finally {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.redrawFlowActive = false;
		}
	}

	startMatchStatePolling(){
		this.clearMatchStatePolling();
		if (this.multiplayerService && this.multiplayerService.getConfig().realtimeEnabled) {
			this.matchRealtimeUnsub = this.multiplayerService.subscribeMatchState({
				playerId: this.playerProfile.id,
				matchId: game.activeMatchId,
				onUpdate: async (state) => {
					if (this.pvpSelectorActive) {
						this.activeMatchState = state;
						this.pvpDeferredState = state;
						return;
					}
					if (this.isPendingPvPCardState(state))
						return;
					if (this.pendingPvPCardMove)
						this.pendingPvPCardMove = null;
					this.activeMatchState = state;
					this.renderActiveMatchState(state);
					if (await this.handleCompletedPvPState(state))
						return;
				}
			});
			return;
		}
		this.matchStatePollTimer = setInterval(async () => {
			if (!game.activeMatchId || !this.multiplayerService)
				return;
			try {
				let state = await this.multiplayerService.getMatchState({
					playerId: this.playerProfile.id,
					matchId: game.activeMatchId
				});
				if (this.pvpSelectorActive) {
					this.activeMatchState = state;
					this.pvpDeferredState = state;
					return;
				}
				if (this.isPendingPvPCardState(state))
					return;
				if (this.pendingPvPCardMove)
					this.pendingPvPCardMove = null;
				this.activeMatchState = state;
				this.renderActiveMatchState(state);
				if (await this.handleCompletedPvPState(state))
					return;
			} catch (e) {
				if (this.isMissingMatchError(e))
					this.endPvPSession();
			}
		}, 1000);
	}

	clearMatchStatePolling(){
		if (this.matchRealtimeUnsub) {
			this.matchRealtimeUnsub();
			this.matchRealtimeUnsub = null;
		}
		if (this.matchStatePollTimer) {
			clearInterval(this.matchStatePollTimer);
			this.matchStatePollTimer = null;
		}
	}

	async runPvPRoundEndFlow(state, roundEvent){
		if (this.pvpRoundTransitionActive)
			return;
		this.pvpRoundTransitionActive = true;
		game.clearTurnTimer();
		board.row.forEach(row => row.clear());
		weather.clearWeather();
		player_me.endRound(roundEvent.winnerPlayerId === state.self.playerId);
		player_op.endRound(state.opponent && roundEvent.winnerPlayerId === state.opponent.playerId);
		if (roundEvent.winnerPlayerId === state.self.playerId)
			game.queuePvPNotice("win-round", 1200);
		else if (!roundEvent.winnerPlayerId)
			game.queuePvPNotice("draw-round", 1200);
		else
			game.queuePvPNotice("lose-round", 1200);
		await game.pvpNoticePromise;
		let northDrawEvent = state.eventLog && state.eventLog.length > 0
			? [...state.eventLog].reverse().find(event => event.type === "cards_drawn" && event.reason === "north" && event.round === state.round)
			: null;
		if (northDrawEvent) {
			if (northDrawEvent.playerId === state.self.playerId && northDrawEvent.cardInstanceIds && northDrawEvent.cardInstanceIds.length > 0)
				await this.animatePvPDraw(state, northDrawEvent.cardInstanceIds);
			game.queuePvPNotice("north", 1200);
			await game.pvpNoticePromise;
		}
		let monstersKeepEvent = state.eventLog && state.eventLog.length > 0
			? [...state.eventLog].reverse().find(event => event.type === "card_kept" && event.reason === "monsters" && event.round === state.round)
			: null;
		if (monstersKeepEvent) {
			game.queuePvPNotice("monsters", 1200);
			await game.pvpNoticePromise;
		}
		let skelligeReviveEvents = state.eventLog && state.eventLog.length > 0
			? state.eventLog.filter(event => event.type === "card_revived" && event.reason === "skellige" && event.round === state.round)
			: [];
		if (skelligeReviveEvents.length > 0) {
			if (skelligeReviveEvents.some(event => event.playerId === state.self.playerId)) {
				game.queuePvPNotice("skellige-me", 1200);
				await game.pvpNoticePromise;
			}
			if (state.opponent && skelligeReviveEvents.some(event => event.playerId === state.opponent.playerId)) {
				game.queuePvPNotice("skellige-op", 1200);
				await game.pvpNoticePromise;
			}
			for (let event of skelligeReviveEvents)
				await this.replayPvPCardRevivedEvent(state, event);
		}
		let latestRoundStartEvent = state.eventLog && state.eventLog.length > 0
			? [...state.eventLog].reverse().find(event => event.type === "round_started" && event.round === state.round)
			: null;
		let roundStartKey = latestRoundStartEvent ? String(latestRoundStartEvent.seq) : null;
		if (state.status === "active" && latestRoundStartEvent && this.lastPvPRoundStartKey !== roundStartKey) {
			this.lastPvPRoundStartKey = roundStartKey;
			game.deferPvPTimer = true;
			game.lastPvPTurnNoticeKey = null;
			game.applyPvPState(state);
			game.queuePvPNotice("round-start", 1200);
			await game.pvpNoticePromise;
			game.queuePvPNotice(state.currentTurnPlayerId === state.self.playerId ? "me-turn" : "op-turn", 1200);
			await game.pvpNoticePromise;
			game.deferPvPTimer = false;
		} else if (state.status === "active" && state.gameState && state.gameState.phase === "active") {
			let fallbackRoundKey = state.matchId + ":round:" + state.round + ":turn:" + state.turnNumber;
			if (this.lastPvPRoundStartKey !== fallbackRoundKey) {
				this.lastPvPRoundStartKey = fallbackRoundKey;
				game.deferPvPTimer = true;
				game.lastPvPTurnNoticeKey = null;
				game.applyPvPState(state);
				game.queuePvPNotice("round-start", 1200);
				await game.pvpNoticePromise;
				game.queuePvPNotice(state.currentTurnPlayerId === state.self.playerId ? "me-turn" : "op-turn", 1200);
				await game.pvpNoticePromise;
				game.deferPvPTimer = false;
			}
		}
		this.pvpRoundTransitionActive = false;
		if (state.eventLog && state.eventLog.length > 0)
			this.lastProcessedPvPEventSeq = state.eventLog[state.eventLog.length - 1].seq;
		game.applyPvPState(state);
	}

	findPvPCardInContainer(container, cardInstanceId){
		if (!container || !cardInstanceId || !container.cards)
			return null;
		return container.cards.find(card => card && card.pvpInstanceId === cardInstanceId) || null;
	}

	removePvPCardFromContainer(container, card){
		if (!container || !card)
			return null;
		if (card.pvpInstanceId) {
			let liveCard = this.findPvPCardInContainer(container, card.pvpInstanceId);
			if (liveCard)
				return container.removeCard(liveCard);
		}
		return container.removeCard(card);
	}

	createPvPReplayCard(cardId, owner, cardInstanceId = null){
		let cardData = card_dict[cardId];
		if (!cardData)
			return null;
		let card = new Card(cardData, owner);
		card.pvpInstanceId = cardInstanceId ? cardInstanceId : null;
		return card;
	}

	createSortedPvPChoiceContainer(entries, owner, decorateCard = null){
		let container = new CardContainer();
		container.cards = entries.map((entry) => {
			let card = new Card(card_dict[entry.cardId], owner);
			card.pvpInstanceId = entry.instanceId;
			if (decorateCard)
				decorateCard(card, entry);
			return card;
		}).sort((a, b) => Card.compare(a, b));
		return container;
	}

	async replayPvPCardPlayedEvent(state, event){
		if (!event || event.type !== "card_played" || !state.opponent)
			return;
		if (event.playerId === state.self.playerId && !event.autoPlayed)
			return;
		let owner = event.playerId === state.self.playerId ? player_me : player_op;
		let source = event.from === "deck"
			? owner.deck
			: event.from === "spawn" || event.from === "leader"
				? null
			: owner === player_me ? player_me.hand : player_op.hand;
		let liveCard = source ? this.findPvPCardInContainer(source, event.cardInstanceId) : null;
		let replayCard = liveCard ? liveCard : this.createPvPReplayCard(event.cardId, owner, event.cardInstanceId);
		if (!replayCard)
			return;
		try {
			if (event.from === "spawn" || event.from === "leader")
				await this.addPvPVisualCardToRow(replayCard, event.to, owner);
			else if (event.to === "weather")
				await (liveCard ? board.moveTo(replayCard, weather, source) : board.toWeather(replayCard, source));
			else
				await this.addPvPVisualCardToRow(replayCard, event.to, owner, source);
			replayCard.elem.classList.add("noclick");
			await sleep(150);
		} catch (_ignored) {
		}
	}

	async replayPvPCardRevivedEvent(state, event){
		if (!event || event.type !== "card_revived")
			return;
		let sourceOwner = event.sourcePlayerId === state.self.playerId ? player_me : player_op;
		let owner = event.owner === "opponent"
			? (event.playerId === state.self.playerId ? player_op : player_me)
			: (event.playerId === state.self.playerId ? player_me : player_op);
		if (!owner || !sourceOwner)
			return;
		let replayCard = this.findPvPCardInContainer(sourceOwner.grave, event.cardInstanceId) || this.createPvPReplayCard(event.cardId, owner, event.cardInstanceId);
		if (!replayCard)
			return;
		let source = sourceOwner.grave;
		try {
			await this.addPvPVisualCardToRow(replayCard, event.to, owner, source);
			replayCard.elem.classList.add("noclick");
			await sleep(150);
		} catch (_ignored) {
		}
	}

	async replayPvPCardBurnedEvent(state, event){
		if (!event || event.type !== "card_burned")
			return;
		let owner = event.playerId === state.self.playerId ? player_me : player_op;
		if (!owner)
			return;
		let refCard = this.createPvPReplayCard(event.cardId, owner, event.cardInstanceId);
		if (!refCard)
			return;
		let source = board.getRow(refCard, event.from, owner);
		if (!source)
			return;
		let replayCard = this.findPvPCardInContainer(source, event.cardInstanceId);
		if (!replayCard)
			return;
		try {
			await replayCard.animate("scorch", true, false);
			await board.moveTo(replayCard, "grave", source);
			await sleep(150);
		} catch (_ignored) {
		}
	}

	async replayPvPCardReturnedEvent(state, event){
		if (!event || event.type !== "card_returned")
			return;
		let sourceOwner = event.sourcePlayerId === state.self.playerId ? player_me : player_op;
		let targetOwner = event.targetPlayerId === state.self.playerId ? player_me : player_op;
		if (!sourceOwner || !targetOwner)
			return;
		let refCard = this.createPvPReplayCard(event.cardId, targetOwner, event.cardInstanceId);
		if (!refCard)
			return;
		let source = event.from === "grave" ? sourceOwner.grave : event.from === "hand" ? sourceOwner.hand : event.from === "deck" ? sourceOwner.deck : board.getRow(refCard, event.from, sourceOwner);
		let replayCard = this.findPvPCardInContainer(source, event.cardInstanceId);
		if (!replayCard)
			return;
		try {
			if (event.to === "deck")
				await board.toDeck(replayCard, source);
			else if (event.to === "grave")
				await board.toGrave(replayCard, source);
			else
				await board.toHand(replayCard, source);
			replayCard.elem.classList.add("noclick");
			await sleep(150);
		} catch (_ignored) {
		}
	}

	async replayPvPCardMovedEvent(state, event){
		if (!event || event.type !== "card_moved")
			return;
		let owner = event.playerId === state.self.playerId ? player_me : player_op;
		if (!owner)
			return;
		let refCard = this.createPvPReplayCard(event.cardId, owner, event.cardInstanceId);
		if (!refCard)
			return;
		let source = board.getRow(refCard, event.from, owner);
		if (!source)
			return;
		let replayCard = this.findPvPCardInContainer(source, event.cardInstanceId);
		if (!replayCard)
			return;
		try {
			await board.moveTo(replayCard, event.to, source);
			replayCard.elem.classList.add("noclick");
			await sleep(150);
		} catch (_ignored) {
		}
	}

	async replayPvPEvent(state, event){
		if (!event)
			return;
		if (event.type === "card_played")
			return this.replayPvPCardPlayedEvent(state, event);
		if (event.type === "card_revived")
			return this.replayPvPCardRevivedEvent(state, event);
		if (event.type === "card_burned")
			return this.replayPvPCardBurnedEvent(state, event);
		if (event.type === "card_returned")
			return this.replayPvPCardReturnedEvent(state, event);
		if (event.type === "card_moved")
			return this.replayPvPCardMovedEvent(state, event);
		if (event.type === "cards_drawn" && event.playerId === state.self.playerId && event.cardInstanceIds && event.cardInstanceIds.length > 0)
			return this.animatePvPDraw(state, event.cardInstanceIds);
	}

	isReplayablePvPEvent(state, event){
		if (!event)
			return false;
		if (event.type === "card_played")
			return event.playerId !== state.self.playerId || !!event.autoPlayed;
		if (event.type === "card_revived")
			return true;
		if (event.type === "card_burned")
			return true;
		if (event.type === "card_returned")
			return true;
		if (event.type === "card_moved")
			return true;
		if (event.type === "cards_drawn")
			return event.playerId === state.self.playerId && Array.isArray(event.cardInstanceIds) && event.cardInstanceIds.length > 0;
		return false;
	}

	async replayPvPEvents(state, events){
		for (let event of events)
			await this.replayPvPEvent(state, event);
	}

	renderActiveMatchState(state){
		if (this.pvpEventReplayActive) {
			this.activeMatchState = state;
			return;
		}
		let turnLabel = state.currentTurnPlayerId === state.self.playerId ? "Your turn" : state.opponent ? state.opponent.displayName + "'s turn" : "Waiting";
		let passedLabel = "You: " + (state.self.passed ? "Passed" : "Active");
		if (state.opponent)
			passedLabel += " | Opponent: " + (state.opponent.passed ? "Passed" : "Active");
		let counts = "Hand " + state.self.handCount + "/" + (state.opponent ? state.opponent.handCount : 0) + " | Deck " + state.self.deckCount + "/" + (state.opponent ? state.opponent.deckCount : 0) + " | Total " + state.self.total + "/" + (state.opponent ? state.opponent.total : 0);
		let summary = "Round " + state.round + " | " + turnLabel + " | " + passedLabel + " | " + counts;
		if (state.status === "matched")
			summary = state.self.ready ? "Waiting for " + (state.opponent ? state.opponent.displayName : "opponent") + " to get ready..." : "Opponent found. Confirm when you are ready.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "scoiatael_first_turn")
			summary = state.self.playerId === state.gameState.pendingChoice.playerId ? "Scoia'tael perk: choose who goes first." : "Waiting for " + (state.opponent ? state.opponent.displayName : "opponent") + " to choose who goes first.";
		if (state.status === "active" && state.gameState.phase === "redraw")
			summary = state.self.redrawComplete ? "Waiting for " + (state.opponent ? state.opponent.displayName : "opponent") + " to finish redraw..." : "Choose up to " + state.self.redrawRemaining + " cards to redraw.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_weather_deck")
			summary = "Choose one weather card from your deck.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_hand_reveal")
			summary = "Review the revealed cards, then continue.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_discard_hand")
			summary = "Choose " + state.gameState.pendingChoice.remainingCount + " card" + (state.gameState.pendingChoice.remainingCount === 1 ? "" : "s") + " to discard.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_deck_to_hand")
			summary = "Choose one card from your deck to draw.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_grave_to_hand")
			summary = state.gameState.pendingChoice.sourcePlayerId === state.self.playerId
				? "Choose one unit from your graveyard to return to your hand."
				: "Choose one unit from your opponent's graveyard to return to your hand.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "medic")
			summary = "Choose one card from your graveyard to play.";
		if (state.status === "active" && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "decoy")
			summary = "Choose one unit on your side to swap with Decoy.";
		if (state.status === "completed") {
			let won = state.winnerPlayerId === state.self.playerId;
			summary = state.winnerPlayerId === null ? "Match drawn." : won ? "Match won." : "Match lost.";
			this.pvpPassButton.classList.add("hide");
			this.pvpCancelButton.innerHTML = "Close Session";
		}
		this.queueStatusElem.innerHTML = summary;
		if (state.status === "active" && state.gameState.phase !== "choice" && !game.pvpBoardEntered)
			this.startActivePvPMatch(state);
		else if (state.status === "active"
			&& state.gameState.phase === "active"
			&& game.mode === "pvp"
			&& game.pvpBoardEntered
			&& (!game.lastPvPStartMatchId || !game.lastPvPStartMatchId.startsWith(state.matchId + ":"))) {
			game.deferPvPTimer = true;
			game.lastPvPTurnNoticeKey = null;
			this.startActivePvPMatch(state);
			return;
		}
		let lastRoundEvent = state.eventLog && state.eventLog.length > 0 ? [...state.eventLog].reverse().find(event => event.type === "round_ended") : null;
		let roundNoticeKey = lastRoundEvent ? String(lastRoundEvent.seq) : null;
		if (roundNoticeKey && this.lastPvPRoundNoticeKey !== roundNoticeKey && game.mode === "pvp" && game.pvpBoardEntered) {
			this.lastPvPRoundNoticeKey = roundNoticeKey;
			this.runPvPRoundEndFlow(state, lastRoundEvent);
			return;
		}
		let newEvents = state.eventLog && state.eventLog.length > 0
			? state.eventLog.filter(event => event.seq > this.lastProcessedPvPEventSeq)
			: [];
		let replayableEvents = game.mode === "pvp" && game.pvpBoardEntered && !this.pvpRoundTransitionActive
			? newEvents.filter(event => this.isReplayablePvPEvent(state, event))
			: [];
		if (replayableEvents.length > 0) {
			this.lastProcessedPvPEventSeq = newEvents[newEvents.length - 1].seq;
			this.pvpEventReplayActive = true;
			this.replayPvPEvents(state, replayableEvents).then(() => {
				this.pvpEventReplayActive = false;
				let latestState = this.activeMatchState || state;
				if (game.mode === "pvp")
					this.renderActiveMatchState(latestState);
			}).catch(() => {
				this.pvpEventReplayActive = false;
				let latestState = this.activeMatchState || state;
				if (game.mode === "pvp")
					this.renderActiveMatchState(latestState);
			});
			return;
		}
		if (newEvents.length > 0)
			this.lastProcessedPvPEventSeq = newEvents[newEvents.length - 1].seq;
		if (game.mode === "pvp")
			game.applyPvPState(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "scoiatael_first_turn")
			this.runPvPScoiataelChoiceFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_weather_deck")
			this.runPvPLeaderWeatherChoiceFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_hand_reveal")
			this.runPvPLeaderHandRevealFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_discard_hand")
			this.runPvPLeaderDiscardChoiceFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_deck_to_hand")
			this.runPvPLeaderDeckToHandChoiceFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "leader_grave_to_hand")
			this.runPvPLeaderGraveChoiceFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "medic")
			this.runPvPMedicChoiceFlow(state);
		if (state.status === "active" && state.gameState && state.gameState.pendingChoice && state.gameState.pendingChoice.type === "decoy")
			this.runPvPDecoyChoiceFlow(state);
	}

	getPvPCardData(cardId){
		return card_dict[cardId];
	}

	getPvPCardAbilities(cardId){
		let card = this.getPvPCardData(cardId);
		if (!card || !card.ability)
			return [];
		return card.ability.trim() === "" ? [] : card.ability.trim().split(" ");
	}

	calculatePvPCardStrength(cardId, activeWeather){
		let card = this.getPvPCardData(cardId);
		if (!card)
			return 0;
		let baseStrength = Number(card.strength) || 0;
		let abilities = this.getPvPCardAbilities(cardId);
		if (abilities.includes("hero"))
			return baseStrength;
		let weatherByRow = {close: "frost", ranged: "fog", siege: "rain"};
		if (weatherByRow[card.row] && activeWeather.has(weatherByRow[card.row]))
			return Math.min(1, baseStrength);
		return baseStrength;
	}

	async animatePvPDraw(state, cardInstanceIds){
		if (!state || !state.self || !Array.isArray(cardInstanceIds) || !player_me || !player_me.deck || !player_me.hand)
			return;
		for (let cardInstanceId of cardInstanceIds) {
			let handEntry = state.self.hand.find(entry => entry.instanceId === cardInstanceId);
			if (!handEntry)
				continue;
			let cardData = this.getPvPCardData(handEntry.cardId);
			if (!cardData)
				continue;
			let tempCard = new Card(cardData, player_me);
			tempCard.pvpInstanceId = handEntry.instanceId;
			try {
				await translateTo(tempCard, player_me.deck, player_me.hand);
			} catch (_ignored) {
			}
			if (tempCard.elem && tempCard.elem.parentElement)
				tempCard.elem.parentElement.removeChild(tempCard.elem);
			await sleep(120);
		}
	}

	async addPvPVisualCardToRow(card, rowName, owner, source = null){
		if (!card || !owner)
			return;
		let row = board.getRow(card, rowName, owner);
		if (!row)
			return;
		try {
			await translateTo(card, source, row);
		} catch (_ignored) {
		}
		let movedCard = source ? this.removePvPCardFromContainer(source, card) : card;
		if (!movedCard)
			return;
		if (movedCard.isSpecial()) {
			row.special = movedCard;
			row.elem_special.appendChild(movedCard.elem);
		} else {
			let index = row.addCardSorted(movedCard);
			row.addCardElement(movedCard, index);
			row.resize();
		}
		row.updateState(movedCard, true);
		if (movedCard.abilities.includes("spy"))
			await movedCard.animate("spy");
		if (movedCard.abilities.includes("morale"))
			await movedCard.animate("morale");
		if (movedCard.abilities.includes("horn"))
			await movedCard.animate("horn");
		if (movedCard.abilities.includes("bond")) {
			let bonds = row.findCards(c => c.name === movedCard.name);
			if (bonds.length > 1)
				await Promise.all(bonds.map(c => c.animate("bond")));
		}
		movedCard.elem.classList.add("noclick");
		row.updateScore();
	}

	async animateLocalPvPCardPlay(card, rowName){
		if (!card || !player_me)
			return;
		if (card.faction === "weather") {
			await board.moveTo(card, weather, player_me.hand);
			return;
		}
		if (card.abilities.includes("spy")) {
			await this.addPvPVisualCardToRow(card, rowName ? rowName : card.row, player_me, player_me.hand);
			return;
		}
		await this.addPvPVisualCardToRow(card, rowName ? rowName : card.row, player_me, player_me.hand);
	}

	async runPvPMedicChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "medic" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let container = this.createSortedPvPChoiceContainer(choice.options, player_me);
		try {
			this.pvpSelectorActive = true;
			await ui.queueCarousel(
				container,
				1,
				async (_graveContainer, _index, selectedCard) => {
					let card = selectedCard;
					let nextState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "resolve_choice",
						selectedCardInstanceId: card && card.pvpInstanceId ? card.pvpInstanceId : ""
					});
					this.activeMatchState = nextState;
					this.pendingPvPChoiceKey = null;
					this.renderActiveMatchState(nextState);
				},
				() => true,
				false,
				false,
				"Choose one card from your graveyard to play."
			);
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve medic choice.", "PvP");
		}
	}

	async runPvPDecoyChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "decoy" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let container = this.createSortedPvPChoiceContainer(choice.options, player_me, (card, entry) => {
			card.pvpRowName = entry.rowName || null;
		});
		try {
			this.pvpSelectorActive = true;
			await ui.queueCarousel(
				container,
				1,
				async (_rowContainer, _index, selectedCard) => {
					let card = selectedCard;
					let nextState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "resolve_choice",
						selectedCardInstanceId: card && card.pvpInstanceId ? card.pvpInstanceId : ""
					});
					this.activeMatchState = nextState;
					this.pendingPvPChoiceKey = null;
					this.renderActiveMatchState(nextState);
				},
				() => true,
				false,
				false,
				"Choose one unit on your side to swap with Decoy."
			);
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve decoy choice.", "PvP");
		}
	}

	async runPvPScoiataelChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "scoiatael_first_turn" || choice.playerId !== state.self.playerId)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type;
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		try {
			let goFirst = await this.showConfirm(
				"The Scoia'tael faction perk allows you to decide who will get to go first.",
				"Scoia'tael",
				"Go First",
				"Let Opponent Start"
			);
			let nextState = await this.multiplayerService.sendMatchAction({
				playerId: this.playerProfile.id,
				matchId: game.activeMatchId,
				action: "resolve_choice",
				goFirst
			});
			this.activeMatchState = nextState;
			this.pendingPvPChoiceKey = null;
			this.renderActiveMatchState(nextState);
		} catch (e) {
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve Scoia'tael choice.", "PvP");
		}
	}

	async runPvPLeaderWeatherChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "leader_weather_deck" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let container = this.createSortedPvPChoiceContainer(choice.options, player_me);
		try {
			this.pvpSelectorActive = true;
			await ui.queueCarousel(
				container,
				1,
				async (_deckContainer, _index, selectedCard) => {
					let card = selectedCard;
					let nextState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "resolve_choice",
						selectedCardInstanceId: card && card.pvpInstanceId ? card.pvpInstanceId : ""
					});
					this.activeMatchState = nextState;
					this.pendingPvPChoiceKey = null;
					this.renderActiveMatchState(nextState);
				},
				() => true,
				false,
				false,
				"Choose one weather card from your deck."
			);
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve leader deck choice.", "PvP");
		}
	}

	async runPvPLeaderHandRevealFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "leader_hand_reveal" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let owner = choice.sourcePlayerId === state.self.playerId ? player_me : player_op;
		let container = this.createSortedPvPChoiceContainer(choice.options, owner);
		try {
			this.pvpSelectorActive = true;
			await ui.viewCardsInContainer(container);
			this.pvpSelectorActive = false;
			let nextState = await this.multiplayerService.sendMatchAction({
				playerId: this.playerProfile.id,
				matchId: game.activeMatchId,
				action: "resolve_choice"
			});
			this.activeMatchState = nextState;
			this.pendingPvPChoiceKey = null;
			this.renderActiveMatchState(nextState);
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve leader reveal.", "PvP");
		}
	}

	async runPvPLeaderDiscardChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "leader_discard_hand" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + (choice.remainingCount || 0) + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let container = this.createSortedPvPChoiceContainer(choice.options, player_me);
		try {
			this.pvpSelectorActive = true;
			await ui.queueCarousel(
				container,
				1,
				async (_handContainer, _index, selectedCard) => {
					let card = selectedCard;
					let nextState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "resolve_choice",
						selectedCardInstanceId: card && card.pvpInstanceId ? card.pvpInstanceId : ""
					});
					this.activeMatchState = nextState;
					this.pendingPvPChoiceKey = null;
					this.renderActiveMatchState(nextState);
				},
				() => true,
				false,
				false,
				"Choose " + choice.remainingCount + " card" + (choice.remainingCount === 1 ? "" : "s") + " to discard."
			);
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve leader discard choice.", "PvP");
		}
	}

	async runPvPLeaderDeckToHandChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "leader_deck_to_hand" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let container = this.createSortedPvPChoiceContainer(choice.options, player_me);
		try {
			this.pvpSelectorActive = true;
			await ui.queueCarousel(
				container,
				1,
				async (_deckContainer, _index, selectedCard) => {
					let card = selectedCard;
					let nextState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "resolve_choice",
						selectedCardInstanceId: card && card.pvpInstanceId ? card.pvpInstanceId : ""
					});
					this.activeMatchState = nextState;
					this.pendingPvPChoiceKey = null;
					this.renderActiveMatchState(nextState);
				},
				() => true,
				false,
				false,
				"Choose one card from your deck to draw."
			);
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve leader deck choice.", "PvP");
		}
	}

	async runPvPLeaderGraveChoiceFlow(state){
		let choice = state.gameState.pendingChoice;
		if (!choice || choice.type !== "leader_grave_to_hand" || !choice.options || choice.options.length === 0)
			return;
		let choiceKey = state.matchId + ":" + state.turnNumber + ":" + choice.type + ":" + choice.options.map(option => option.instanceId).join(",");
		if (this.pendingPvPChoiceKey === choiceKey)
			return;
		this.pendingPvPChoiceKey = choiceKey;
		let owner = choice.sourcePlayerId === state.self.playerId ? player_me : player_op;
		let prompt = choice.sourcePlayerId === state.self.playerId
			? "Choose one unit from your graveyard to return to your hand."
			: "Choose one unit from your opponent's graveyard to return to your hand.";
		let container = this.createSortedPvPChoiceContainer(choice.options, owner);
		try {
			this.pvpSelectorActive = true;
			await ui.queueCarousel(
				container,
				1,
				async (_graveContainer, _index, selectedCard) => {
					let card = selectedCard;
					let nextState = await this.multiplayerService.sendMatchAction({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId,
						action: "resolve_choice",
						selectedCardInstanceId: card && card.pvpInstanceId ? card.pvpInstanceId : ""
					});
					this.activeMatchState = nextState;
					this.pendingPvPChoiceKey = null;
					this.renderActiveMatchState(nextState);
				},
				() => true,
				false,
				false,
				prompt
			);
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
		} catch (e) {
			this.pvpSelectorActive = false;
			this.flushDeferredPvPState();
			this.pendingPvPChoiceKey = null;
			await this.showAlert(e.message ? e.message : "Unable to resolve leader grave choice.", "PvP");
		}
	}

	getLivePvPHandCard(card){
		if (!card || !player_me || !player_me.hand || !card.pvpInstanceId)
			return null;
		return player_me.hand.cards.find(current => current && current.pvpInstanceId === card.pvpInstanceId) || null;
	}

	isPendingPvPCardState(state){
		return !!(this.pendingPvPCardMove
			&& state
			&& state.self
			&& state.self.hand
			&& state.self.hand.some(entry => entry.instanceId === this.pendingPvPCardMove.cardInstanceId));
	}

	async playPvPCard(card, rowName){
		if (!this.multiplayerService || !game.activeMatchId)
			return;
		if (!game.isSupportedPvPCard(card)) {
			await this.showAlert("This PvP build does not support this card or its full effect yet.", "PvP");
			return;
		}
		if (!card.pvpInstanceId)
			return;
		let liveCard = this.getLivePvPHandCard(card);
		if (!liveCard)
			return;
		try {
			this.pendingPvPCardMove = {
				cardInstanceId: liveCard.pvpInstanceId,
				targetRow: rowName ? rowName : liveCard.row
			};
			await this.animateLocalPvPCardPlay(liveCard, rowName);
			let state = await this.multiplayerService.sendMatchAction({
				playerId: this.playerProfile.id,
				matchId: game.activeMatchId,
				action: "play_card",
				cardInstanceId: liveCard.pvpInstanceId ? liveCard.pvpInstanceId : undefined,
				handIndex: !liveCard.pvpInstanceId ? player_me.hand.cards.indexOf(liveCard) : undefined,
				targetRow: rowName ? rowName : liveCard.row
			});
			this.pendingPvPCardMove = null;
			this.activeMatchState = state;
			this.renderActiveMatchState(state);
		} catch (e) {
			this.pendingPvPCardMove = null;
			if (this.isMissingMatchError(e)) {
				this.endPvPSession();
				return;
			}
			try {
				let state = await this.multiplayerService.getMatchState({
					playerId: this.playerProfile.id,
					matchId: game.activeMatchId
				});
				this.activeMatchState = state;
				this.renderActiveMatchState(state);
			} catch (_ignored) {
			}
			await this.showAlert(e.message ? e.message : "Unable to play card in PvP.", "PvP");
		}
	}

	async sendPvPAction(action){
		if (!this.multiplayerService || !game.activeMatchId)
			return;
		try {
			let state = await this.multiplayerService.sendMatchAction({
				playerId: this.playerProfile.id,
				matchId: game.activeMatchId,
				action: action
			});
			this.activeMatchState = state;
			if (action === "ready" && state.status === "active" && state.gameState && state.gameState.phase !== "choice") {
				await this.startActivePvPMatch(state);
			} else if (action === "ready" && state.status !== "active")
				this.pvpCancelButton.innerHTML = "Leave Match";
			if (action === "decline_ready") {
				this.endPvPSession();
				return;
			}
			this.renderActiveMatchState(state);
			if (await this.handleCompletedPvPState(state))
				return;
		} catch (e) {
			if (this.isMissingMatchError(e)) {
				this.endPvPSession();
				return;
			}
			if (action === "pass" && e && e.message && e.message.includes("It is not this player's turn")) {
				try {
					let state = await this.multiplayerService.getMatchState({
						playerId: this.playerProfile.id,
						matchId: game.activeMatchId
					});
					this.activeMatchState = state;
					this.renderActiveMatchState(state);
				} catch (_ignored) {
				}
				return;
			}
			await this.showAlert(e.message ? e.message : "Unable to send PvP action.", "PvP Session");
		}
	}

	endPvPSession(){
		this.clearQueuePolling();
		this.clearMatchStatePolling();
		this.queueActive = false;
		this.activeMatchState = null;
		this.redrawFlowActive = false;
		this.pvpStartStateKey = null;
		this.pvpCompletionHandledMatchId = null;
		this.queueStartedAt = 0;
		this.pendingPvPCardMove = null;
		this.pendingPvPChoiceKey = null;
		this.pvpRoundTransitionActive = false;
		this.lastProcessedPvPEventSeq = 0;
		this.pvpEventReplayActive = false;
		game.activeMatchId = null;
		game.activeMatchBootstrap = null;
		this.clearActiveMatchId();
		game.setMode("pvc");
		this.pvpPassButton.classList.add("hide");
		this.pvpCancelButton.innerHTML = "Cancel Queue";
		this.queueElem.classList.add("hide");
		this.queueStatusElem.innerHTML = "Not in queue";
		game.returnToCustomization();
	}
	
	// Converts the current deck to a JSON string
	deckToJSON(){
		let obj = {
			faction: this.faction,
			leader: this.leader.index, 
			cards: this.deck.filter(x => x.count > 0).map(x => [x.index, x.count] )
		};
		return JSON.stringify(obj);
	}
	
	// Called by the client to downlaod the current deck as a JSON file
	downloadDeck(){
		let json = this.deckToJSON();
		let str = "data:text/json;charset=utf-8," + encodeURIComponent(json);
		let hidden_elem = document.getElementById('download-json');
		hidden_elem.href = str;
		hidden_elem.download = "GwentDeck.json";
		hidden_elem.click();
	}
	
	// Called by the client to upload a JSON file representing a new deck
	uploadDeck() {
		let files = document.getElementById("add-file").files;
		if (files.length <= 0)
			return false;
		let fr = new FileReader();
		fr.onload = async e => {
			try {
				await this.deckFromJSON(e.target.result);
			} catch (e) {
				await this.showAlert("Uploaded deck is not formatted correctly!", "Deck Import");
			}
		}
		fr.readAsText(files.item(0));
		document.getElementById("add-file").value = "";
	}
	
	// Creates a deck from a JSON file's contents and sets that as the current deck
	// Notifies client with warnings if the deck is invalid
	async deckFromJSON(json) {
		let deck;
		try {
			deck = JSON.parse(json);
		} catch (e) {
			await this.showAlert("Uploaded deck is not parsable!", "Deck Import");
			return;
		}
		let warning = "";
		if (card_dict[deck.leader].row !== "leader")
			warning += "'" + card_dict[deck.leader].name + "' is cannot be used as a leader\n";
		if (deck.faction != card_dict[deck.leader].deck)
			warning += "Leader '" + card_dict[deck.leader].name + "' doesn't match deck faction '" + deck.faction + "'.\n";
		
		let cards = deck.cards.filter( c => {
			let card = card_dict[c[0]];
			if (!card) {
				warning += "ID " + c[0] + " does not correspond to a card.\n";
				return false
			}
			if (![deck.faction, "neutral", "special", "weather"].includes(card.deck)) {
				warning += "'" + card.name + "' cannot be used in a deck of faction type '" + deck.faciton +"'\n";
				return false;
			}
			if (card.count < c[1]) {
				warning += "Deck contains " + c[1] + "/" + card.count + " available " + card_dict[c.index].name + " cards\n";
				return false;
			}
			return true;
		})
		.map(c => ({index:c[0], count:Math.min(c[1], card_dict[c[0]].count)}) );
		
		if (warning && !await this.showConfirm(warning, "Import Deck", "Import", "Cancel"))
			return;
		await this.setFaction(deck.faction, true);
		if (card_dict[deck.leader].row === "leader" && deck.faction === card_dict[deck.leader].deck){
			this.leader = this.leaders.filter(c => c.index === deck.leader)[0];
			this.leader_elem.children[1].style.backgroundImage = largeURL(this.leader.card.deck + "_" + this.leader.card.filename);
		}
		this.makeBank(deck.faction, cards);
		this.update();
	}
}
