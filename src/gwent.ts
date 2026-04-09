"use strict"

class Controller {}

// Makes decisions for the AI opponent player
class ControllerAI {
	constructor(player) {
		this.player = player;
	}
	
	// Collects data and weighs options before taking a weighted random action
	async startTurn(player){
		if (player.opponent().passed && (player.winning || 
				player.deck.faction === "nilfgaard" && player.total === player.opponent().total) ){
			await player.passRound();
			return;
		}
		let data_max = this.getMaximums();
		let data_board = this.getBoardData();
		let weights = player.hand.cards.map(c => 
			({weight: this.weightCard(c, data_max, data_board), action: async () => await this.playCard(c, data_max, data_board)}) );
		if (player.leaderAvailable)
			weights.push( {weight: this.weightLeader(player.leader, data_max, data_board), action: async () => await player.activateLeader()} );
		weights.push( {weight: this.weightPass(), action: async () => await player.passRound()} );
		let weightTotal = weights.reduce( (a,c) => a + c.weight, 0);
		if (weightTotal === 0){
			for (let i=0; i<player.hand.cards.length; ++i) {
				let card = player.hand.cards[i];
				if (card.row === "weather" && this.weightWeather(card) > -1 || card.abilities.includes("avenger")) {
					await weights[i].action();
					return;
				}
			}
			await player.passRound();
		} else {
			let rand = randomInt(weightTotal);
			for (var i=0; i < weights.length; ++i) {
				rand -= weights[i].weight;
				if (rand < 0)
					break;
			}
			await weights[i].action();
		}
	}
	
	// Collects data about card with the hightest power on the board
	getMaximums(){
		let rmax = board.row.map(r =>  ({row: r, cards: r.cards.filter(c => c.isUnit()).reduce( (a,c) => 
			(!a.length|| a[0].power < c.power) ? [c] : a[0].power === c.power ? a.concat([c]) : a
		, []) }) );
		
		let max = rmax.filter((r,i) => r.cards.length && i < 3).reduce((a,r) => Math.max(a, r.cards[0].power), 0);
		let max_me = rmax.filter((r,i) => i < 3 && r.cards.length && r.cards[0].power === max).reduce((a,r) => 
			a.concat(r.cards.map(c => ({row:r, card:c})))
		, []);
		
		max = rmax.filter((r,i) => r.cards.length && i > 2).reduce((a,r) => Math.max(a, r.cards[0].power), 0);
		let max_op = rmax.filter((r,i) => i > 2 && r.cards.length && r.cards[0].power === max).reduce((a,r) => 
			a.concat(r.cards.map(c => ({row:r, card:c})))
		, []);
		
		return {rmax: rmax, me: max_me, op: max_op};
	}
	
	// Collects data about the types of cards on the board and in each player's graves
	getBoardData(){
		let data = this.countCards(new CardContainer());
		Object.keys([0,1,2]).map(i => board.row[i]).forEach(r => this.countCards(r, data));
		data.grave_me = this.countCards(this.player.grave);
		data.grave_op = this.countCards(this.player.opponent().grave);
		return data;
	}
	
	// Catalogs the kinds of cards in a given CardContainer
	countCards(container, data){
		data = data ? data : {spy: [], medic: [], bond: {}, scorch: []};
		container.cards.filter(c => c.isUnit()).forEach(c => {
			for (let x of c.abilities) {
				switch (x) {
					case "spy":
					case "medic":
						data[x].push(c);
						break;
					case "scorch_r": case "scorch_c": case "scorch_s":
						data["scorch"].push(c);
						break;
					case "bond":
						if (!data.bond[c.name])
							data.bond[c.name] = 0;
						data.bond[c.name]++;
				}
			}
		});
		return data;
	}
	
	// Swaps a card from the hand with the deck if beneficial
	redraw() {
		let card = this.discardOrder({holder:this.player}).shift();
		if (card && card.power < 15) {
			this.player.deck.swap(this.player.hand, this.player.hand.removeCard(card))
		}
	}
	
	// Orders discardable cards from most to least discardable
	discardOrder(card) {
		let cards = [];
		let groups = {};
		let musters = card.holder.hand.cards.filter(c => c.abilities.includes("muster"));
		while (musters.length > 0) {
			let curr = musters.pop();
			let i = curr.name.indexOf('-');
			let name = i === -1 ? curr.name : curr.name.substring(0, i).trim();
			if (!groups[name])
				groups[name] = [];
			let group = groups[name];
			group.push(curr);
			for (let j=musters.length-1; j>=0; j--)
				if (musters[j].name.startsWith(name))
					group.push( musters.splice(j,1)[0] );
		}
		
		for (let group of Object.values(groups)) {
			group.sort(Card.compare);
			group.pop();
			cards.push(...group);
		}
		
		let weathers = card.holder.hand.cards.filter(c => c.row === "weather");
		if (weathers.length > 1){
			weathers.splice(randomInt(weathers.length), 1);
			cards.push(...weathers);
		}
		
		let normal = card.holder.hand.cards.filter(c => c.abilities.length === 0);
		normal.sort(Card.compare);
		cards.push(...normal);
		return cards;
	}
	
	// Tells the Player that this object controls to play a card
	async playCard(c, max, data){
		if (c.name === "Commander's Horn")
			await this.horn(c);
		else if (c.name === "Mardroeme")
			await this.mardroeme(c);
		else if (c.name === "Decoy")
			await this.decoy(c, max, data);
		else if (c.name === "Scorch")
			await this.scorch(c, max, data);
		else
			await this.player.playCard(c);
	}
	
	// Plays a Commander's Horn to the most beneficial row. Assumes at least one viable row.
	async horn(card){
		let rows = [0,1,2].map(i => board.row[i]).filter(r => r.special === null);
		let max_row;
		let max = 0;
		for (let i=0; i<rows.length; ++i) {
			let r = rows[i];
			let dif = [0, 0];
			this.calcRowPower(r, dif, true);
			r.effects.horn++;
			this.calcRowPower(r, dif, false);
			r.effects.horn--;
			let score = dif[1] - dif[0];
			if (max < score){
				max = score;
				max_row = r;
			}
		}
		await this.player.playCardToRow(card, max_row);
	}
	
	// Plays a Mardroeme to the most beneficial row. Assumes at least one viable row.
	async mardroeme(card){ // TODO skellige
		let row, max = 0;
		for (let i=1; i<3; i++){
			let curr = this.weightMardroemeRow(card, board.row[i]);
			if (curr > max){
				max = curr;
				row = board.row[i];
			}
		}
		await this.player.playCardToRow(card, row);
	}
	
	// Selects a card to remove from a Grave. Assumes at least one valid card.
	medic(card, grave){
		let data = this.countCards(grave);
		let targ;
		if (data.spy.length){
			let min = data.spy.reduce( (a,c) => Math.min(a, c.power), Number.MAX_VALUE);
			targ = data.spy.filter(c => c.power === min)[0];
		} else if (data.medic.length) {
			let max = data.medic.reduce( (a,c) => Math.max(a, c.power), Number.MIN_VALUE);
			targ = data.medic.filter(c => c.power === max)[0];
		} else if (data.scorch.length) {
			targ = data.scorch[randomInt(data.scorch.length)];
		} else {
			let units = grave.findCards(c => c.isUnit());
			targ = units.reduce( (a,c) => a.power < c.power ? c : a, units[0] );
		}
		return targ;
	}
	
	// Selects a card to return to the Hand and replaces it with a Decoy. Assumes at least one valid card.
	async decoy(card, max, data) {
		let targ, row;
		if (data.spy.length){
			let min = data.spy.reduce( (a,c) => Math.min(a, c.power), Number.MAX_VALUE);
			targ = data.spy.filter(c => c.power === min)[0];
		} else if (data.medic.length) {
			targ = data.medic[randomInt(data.medic.length)];
		} else if (data.scorch.length) {
			targ = data.scorch[randomInt(data.scorch.length)];
		} else {
			let pairs = max.rmax.filter((r,i) => i<3 && r.cards.length).reduce((a,r) => 
				r.cards.map(c => ({r:r.row, c:c})).concat(a)
			, []);
			let pair = pairs[randomInt(pairs.length)];
			targ = pair.c;
			row = pair.r;
		}
		
		for (let i = 0; !row ; ++i){
			if (board.row[i].cards.indexOf(targ) !== -1){
				row = board.row[i];
				break;
			}
		}
		
		setTimeout(() => board.toHand(targ, row), 1000);
		await this.player.playCardToRow(card, row);
	}
	
	// Tells the controlled Player to play the Scorch card
	async scorch(card, max, data){
		await this.player.playScorch(card);
	}
	
	// Assigns a weight for how likely the conroller is to Pass the round
	weightPass(){
		if (this.player.health === 1)
			return 0;
		let dif = this.player.opponent().total - this.player.total;
		if (dif > 30)
			return 100;
		if (dif < -30 && this.player.opponent().handsize - this.player.handsize > 2)
			return 100;
		return Math.floor(Math.abs(dif));
	}
	
	// Assigns a weight for how likely the controller is to activate its leader ability
	weightLeader(card, max, data) {
		let w = ability_dict[card.abilities[0]].weight;
		if (ability_dict[card.abilities[0]].weight) {
			let score = w(card, this, max, data);
			return score;
		}
		return 10 + (game.roundCount-1) * 15;
	}
	
	// Assigns a weight for how likely the controller will use a scorch-row card
	weightScorchRow(card, max, row_name) {
		let index = 3 + (row_name==="close" ? 0 : row_name==="ranged" ? 1 : 2);
		if (board.row[index].total < 10)
			return 0;
		let score = max.rmax[index].cards.reduce((a,c) => a + c.power, 0);
		return score;
	}
	
	// Calculates a weight for how likely the conroller will use horn on this row
	weightHornRow(card, row){
		return row.special !== null ? 0 : this.weightRowChange(card, row);
	}
	
	// Calculates weight for playing a card on a given row, min 0
	weightRowChange(card, row){
		return Math.max(0, this.weightRowChangeTrue(card, row));
	}
	
	// Calculates weight for playing a card on the given row
	weightRowChangeTrue(card, row) {
		let dif = [0,0];
		this.calcRowPower(row, dif, true);
		row.updateState(card, true);
		this.calcRowPower(row, dif, false);
		if (!card.isSpecial())
			dif[0] -= row.calcCardScore(card);
		row.updateState(card, false);
		return dif[1] - dif[0];
	}
	
	// Calculates the weight for playing a weather card
	weightWeather(card) {
		let rows;
		if (card.name === "Clear Weather")
			rows = Object.values(weather.types).filter(t => t.count > 0).flatMap(t => t.rows);
		else
			rows = Object.values(weather.types).filter(t => t.count === 0 && t.name === card.abilities[0]).flatMap(t => t.rows);
		if (!rows.length)
			return 1;
		let dif = [0,0];
		rows.forEach( r => {
			let state = r.effects.weather;
			this.calcRowPower(r, dif, true);
			r.effects.weather = !state;
			this.calcRowPower(r, dif, false);
			r.effects.weather = state;
		});
		return dif[1] - dif[0];
	}
	
	// Calculates the weight for playing a mardroeme card
	weightMardroemeRow(card, row){
		if (card.name === "Mardroeme" && row.special !== null)
			return 0;
		let ermion = card.holder.hand.cards.filter(c => c.name === "Ermion").length > 0;
		if (ermion && card.name !== "Ermion" && row === board.row[1])
			return 0;
		let name = row === board.row[1] ? "Young Berserker" : "Berserker";
		let n = row.cards.filter(c => c.name === name).length;
		let weight = row === board.row[2] ? 10*n : 8*n*n - 2*n
		return Math.max(1, weight);
	}
	
	// Calculates the weight for cards with the medic ability
	weightMedic(data, score, owner){
		let units = owner.grave.findCards(c => c.isUnit());
		let grave = data["grave_" + owner.opponent().tag];
		return !units.length ? Math.min(1,score) : score + (grave.spy.length ? 50 : grave.medic.length ? 15 : grave.scorch.length  ? 10 : this.player.health === 1 ? 1 : 0);
	}
	
	// Calculates the weight for cards with the berserker ability
	weightBerserker(card, row, score){
		if (card.holder.hand.cards.filter(c => c.abilities.includes("mardroeme")).length < 1 && !row.effects.mardroeme > 0)
			return score;
		score -= card.basePower;
		if (card.row === "close")
			score += 14;
		else {
			let n = 0;
			if (!row.effects.mardroeme)
				n = row.cards.filter(c => c.name === "Young Berserker").length;
			else
				n = row.cards.filter(c => "Transformed Young Vildkaarl").length;
			score = 8*((n+1)*(n+1) - n*n) + n*score;
		}
		return Math.max(1, score);
	}
	
	// Calculates the weight for a weather card if played from the deck
	weightWeatherFromDeck(card, weather_id) {
		if (card.holder.deck.findCard(c => c.abilities.includes(weather_id)) === undefined)
			return 0;
		return this.weightCard({abilities:[weather_id], row:"weather"});
	}
	
	// Assigns a weights for how likely the controller with play a card from its hand
	weightCard(card, max, data){
		if (card.name === "Decoy")
			return data.spy.length ? 50 : data.medic.length ? 15 : data.scorch.length  ? 10 : max.me.length ? 1 : 0;
		if (card.name === "Commander's Horn") {
			let rows = [0,1,2].map(i => board.row[i]).filter(r => r.special === null);
			if (!rows.length)
				return 0;
			rows = rows.map(r => this.weightHornRow(card, r) );
			return Math.max(...rows)/2;
		}
		
		if (card.abilities) {
			if (card.abilities.includes("scorch")) {
				let power_op = max.op.length ? max.op[0].card.power : 0;
				let power_me = max.me.length ? max.me[0].card.power : 0;
				let total_op = power_op * max.op.length;
				let total_me = power_me * max.me.length;
				return power_me > power_op ? 0 : power_me < power_op ? total_op : Math.max(0, total_op - total_me);
			}
			if (card.abilities.includes("decoy")) {
				return data.spy.length ? 50 : data.medic.length ? 15 : data.scorch.length  ? 10 : max.me.length ? 1 : 0;
			}
			if (card.abilities.includes("mardroeme")) {
				let rows = [1,2].map(i => board.row[i]);
				return Math.max(...rows.map(r => this.weightMardroemeRow(card, r)) );
			}
		}
		
		if (card.row === "weather") {
			return Math.max(0, this.weightWeather(card));
		}
		
		let row = board.getRow(card, card.row === "agile" ? "close" : card.row, this.player);
		let score = row.calcCardScore(card);
		switch(card.abilities[card.abilities.length -1]) {
			case "bond": 
			case "morale":
			case "horn":
				score = this.weightRowChange(card, row); break;
			case "medic": 
				score = this.weightMedic(data, score, card.holder);	break;
			case "spy": score = 15 + score; break;
			case "muster": score *= 3; break;
			case "scorch_c":
				score = Math.max(1, this.weightScorchRow(card, max, "close")); break;
			case "scorch_r": 
				score = Math.max(1, this.weightScorchRow(card, max, "ranged")); break;
			case "scorch_s":
				score = Math.max(1, this.weightScorchRow(card, max, "siege")); break;
			case "berserker":
				score = this.weightBerserker(card, row, score); break;
			case "avenger": case "avenger_kambi":
				return score + ability_dict[card.abilities[card.abilities.length -1]].weight();
		}
		
		return score;
	}
	
	// Calculates the current power of a row associated with each Player
	calcRowPower(r, dif, add){
		r.findCards(c => c.isUnit()).forEach(c => {
			let p = r.calcCardScore(c); 
			c.holder === this.player ? (dif[0]+= add ? p : -p) : (dif[1]+= add ? p : -p);
		});
	}
}

// Can make actions during turns like playing cards that it owns
class Player {
	constructor(id, name, deck) {
		this.id = id;
		this.tag = (id === 0) ? "me" : "op";
		this.controller = (id === 0) ? new Controller() : new ControllerAI(this);
		
		this.hand = (id === 0) ? new Hand(document.getElementById("hand-row")) : new HandAI();
		this.grave =  new Grave( document.getElementById("grave-" + this.tag));
		this.deck = new Deck(deck.faction, document.getElementById("deck-" + this.tag));
		this.deck_data = deck;
		
		this.leader = new Card(deck.leader, this);
		this.elem_leader = document.getElementById("leader-" + this.tag);
		this.elem_leader.children[0].appendChild( this.leader.elem );
		
		this.reset();
		
		this.name = name;
		document.getElementById("name-" + this.tag).innerHTML = name;
		
		document.getElementById("deck-name-" +this.tag).innerHTML = factions[deck.faction].name;
		document.getElementById("stats-" + this.tag).getElementsByClassName("profile-img")[0].children[0].children[0];
		let x = document.querySelector("#stats-" +this.tag+ " .profile-img > div > div");
		x.style.backgroundImage = iconURL("deck_shield_" + deck.faction);
	}

	setController(controller) {
		this.controller = controller;
	}
	
	// Sets default values
	reset(){
		this.grave.reset();
		this.hand.reset();
		this.deck.reset();
		this.deck.initializeFromID(this.deck_data.cards, this);
		
		this.health = 2;
		this.total = 0;
		this.passed = false;
		this.handsize = 10;
		this.winning = false;
	
		this.enableLeader();
		this.setPassed(false);
		document.getElementById("gem1-" +this.tag).classList.add("gem-on");
		document.getElementById("gem2-" +this.tag).classList.add("gem-on");
	}
	
	// Returns the opponent Player
	opponent(){
		return board.opponent(this);
	}
	
	// Updates the player's total score and notifies the gamee
	updateTotal(n){
		this.total += n;
		document.getElementById("score-total-" + this.tag).children[0].innerHTML = this.total;
		board.updateLeader();
	}
	
	// Puts the player in the winning state
	setWinning(isWinning) {
		if (this.winning ^ isWinning)
			document.getElementById("score-total-" + this.tag).classList.toggle("score-leader");
		this.winning = isWinning;
	}
	
	// Puts the player in the passed state
	setPassed(hasPassed) {
		if (this.passed ^ hasPassed)
			document.getElementById("passed-" + this.tag).classList.toggle("passed");
		this.passed = hasPassed;
	}
	
	// Sets up board for turn
	async startTurn(){
		document.getElementById("stats-" + this.tag).classList.add("current-turn");
		if (this.leaderAvailable)
			this.elem_leader.children[1].classList.remove("hide");
		
		if (this === player_me) {
			document.getElementById("pass-button").classList.remove("noclick");
		}
		
		if (this.controller instanceof ControllerAI) {
			await this.controller.startTurn(this);
		}
	}
	
	// Passes the round and ends the turn
	passRound(){
		this.setPassed(true);
		this.endTurn();
	}
	
	// Plays a scorch card
	async playScorch(card){
		await this.playCardAction(card, async () => await ability_dict["scorch"].activated(card));
	}
	
	// Plays a card to a specific row
	async playCardToRow(card, row){
		await this.playCardAction(card, async () => await board.moveTo(card, row, this.hand));
	}
	
	// Plays a card to the board
	async playCard(card){
		await this.playCardAction(card, async () => await card.autoplay(this.hand));
	}
	
	// Shows a preview of the card being played, plays it to the board and ends the turn
	async playCardAction(card, action){
		ui.showPreviewVisuals(card);
		await sleep(1000);
		ui.hidePreview(card);
		await action();
		this.endTurn();
	}
	
	// Handles end of turn visuals and behavior the notifies the game
	endTurn(){
		if (game.mode === "pvp")
			return;
		if (!this.passed && !this.canPlay())
			this.setPassed(true);
		if (this === player_me){
			document.getElementById("pass-button").classList.add("noclick");
		}
		document.getElementById("stats-" + this.tag).classList.remove("current-turn");
		this.elem_leader.children[1].classList.add("hide");
		game.endTurn()
	}
	
	// Tells the the Player if it won the round. May damage health.
	endRound(win){
		if (!win) {
			if (this.health < 1)
				return;
			document.getElementById("gem" + this.health + "-" +this.tag).classList.remove("gem-on");
			this.health--;
		}
		this.setPassed(false);
		this.setWinning(false);
	}
	
	// Returns true if the Player can make any action other than passing
	canPlay() {
		return this.hand.cards.length > 0 || this.leaderAvailable;
	}
	
	// Use a leader's Activate ability, then disable the leader
	async activateLeader() {
		ui.showPreviewVisuals(this.leader);
		await sleep(1500);
		ui.hidePreview(this.leader);
		if (game.mode === "pvp") {
			if (this !== player_me || !dm)
				return;
			await dm.sendPvPAction("activate_leader");
			return;
		}
		await this.leader.activated[0](this.leader, this);
		this.disableLeader();
		this.endTurn();
	}
	
	// Disable access to leader ability and toggles leader visuals to off state
	disableLeader(){
		this.leaderAvailable = false;
		let elem = this.elem_leader.cloneNode(true);
		this.elem_leader.parentNode.replaceChild(elem, this.elem_leader);
		this.elem_leader = elem;
		this.elem_leader.children[0].classList.add("fade");
		this.elem_leader.children[1].classList.add("hide");
		this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader), false);
	}
	
	// Enable access to leader ability and toggles leader visuals to on state
	enableLeader() {
		this.leaderAvailable = this.leader.activated.length > 0;
		let elem = this.elem_leader.cloneNode(true);
		this.elem_leader.parentNode.replaceChild(elem, this.elem_leader);
		this.elem_leader = elem;
		this.elem_leader.children[0].classList.remove("fade");
		this.elem_leader.children[1].classList.remove("hide");
		
		if (this.id === 0 && this.leader.activated.length > 0){
			this.elem_leader.addEventListener("click", 
				async () => await ui.viewCard(this.leader, async () => await this.activateLeader()),
				false);
		} else {
			this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader), false);
		}
		
		// TODO set crown color
	}
	
}

// Handles the adding, removing and formatting of cards in a container
class CardContainer {
	constructor(elem) {
		this.elem = elem;
		this.cards = [];
	}
	
	// Returns the first card that satisfies the predcicate. Does not modify container.
	findCard(predicate){
		for (let i=this.cards.length-1; i>=0; --i)
			if (predicate(this.cards[i]))
				return this.cards[i];
	}
	
	// Returns a list of cards that satisfy the predicate. Does not modify container.
	findCards(predicate){
		return this.cards.filter(predicate);
	}
	
	// Returns a list of up to n cards that satisfy the predicate. Does not modify container.
	findCardsRandom(predicate, n){
		let valid = predicate ? this.cards.filter(predicate) : this.cards;
		if (valid.length === 0)
			return [];
		if (!n || n === 1)
			return [valid[randomInt(valid.length)]];
		let out = [];
		for (let i=Math.min(n, valid.length); i>0 ; --i){
			let index = randomInt(valid.length);
			out.push( valid.splice(index,1)[0] );
		}
		return out;
	}
	
	// Removes and returns a list of cards that satisy the predicate.
	getCards(predicate){
		return this.cards.reduce((a,c,i) => ( predicate(c,i)?[i]:[] ).concat(a), []).map( i => this.removeCard(i));
	}
	
	// Removes and returns a card that satisfies the predicate.
	getCard(predicate) {
		for (let i=this.cards.length-1; i>=0; --i)
			if (predicate(this.cards[i]))
				return this.removeCard(i);
	}
	
	// Removes and returns any cards up to n that satisfy the predicate.
	getCardsRandom(predicate, n) {
		return this.findCardsRandom(predicate, n).map( c => this.removeCard(c) );
	}
	
	// Adds a card to the container along with its associated HTML element.
	addCard(card, index){
		if (!card || !card.elem)
			return;
		this.cards.push(card);
		this.addCardElement(card, index?index:0);
		this.resize();
	}
	
	// Removes a card from the container along with its associated HTML element.
	removeCard(card, index){
		if (this.cards.length === 0)
			throw "Cannot draw from empty " + this.constructor.name;
		card = this.cards.splice( isNumber(card)? card : this.cards.indexOf(card) , 1)[0];
		if (!card || !card.elem) {
			this.resize();
			return card;
		}
		this.removeCardElement(card, index?index:0);
		this.resize();
		return card;
	}
	
	// Adds a card to a pre-sorted CardContainer
	addCardSorted(card){
		let i = this.getSortedIndex(card);
		this.cards.splice(i, 0, card);
		return i;
	}
	
	// Returns the expected index of a card in a sorted CardContainer
	getSortedIndex(card){
		for (var i=0; i<this.cards.length; ++i)
			if (Card.compare(card, this.cards[i]) < 0)
				break;
		return i;
	}
	
	// Adds a card to a random index of the CardContainer
	addCardRandom(card){
		this.cards.push(card);
		let index = randomInt(this.cards.length);
		if (index !== this.cards.length-1) {
			let t = this.cards[this.cards.length-1];
			this.cards[this.cards.length-1] = this.cards[index];
			this.cards[index] = t;
		}
		return index;
	}
	
	// Removes the HTML elemenet associated with the card from this CardContainer
	removeCardElement(card, index){
		if (!card || !card.elem)
			return;
		if (this.elem)
			this.elem.removeChild(card.elem);
	}
	
	// Adds the HTML elemenet associated with the card to this CardContainer
	addCardElement(card, index){
		if (!card || !card.elem)
			return;
		if (this.elem){
			if (index === this.cards.length)
				this.elem.appendChild(card.elem);
			else
				this.elem.insertBefore(card.elem, this.elem.children[index]);
		}
	}
	
	// Empty function to be overried by subclasses that resize their content
	resize(){}
	
	// Modifies the margin of card elements inside a row-like container to stack properly
	resizeCardContainer(overlap_count, gap, coef) {
		let n = this.elem.children.length;
		let param = (n < overlap_count) ?  "" + gap+"vw" : defineCardRowMargin(n, coef);
		let children = this.elem.getElementsByClassName("card");
		for (let x of children)
			x.style.marginLeft = x.style.marginRight = param;
		
		function defineCardRowMargin(n, coef = 0){
			return "calc((100% - (4.45vw * " + n + ")) / (2*" +n+ ") - (" +coef+ "vw * " +n+ "))";
		}
	}
	
	// Allows the row to be clicked
	setSelectable(){
		this.elem.classList.add("row-selectable");
	}
	
	// Disallows teh row to be clicked
	clearSelectable() {
		this.elem.classList.remove("row-selectable");
		for (card in this.cards)
			card.elem.classList.add("noclick");
	}
	
	// Returns the container to its default, empty state
	reset() {
		while(this.cards.length)
			this.removeCard(0);
		if (this.elem)
			while(this.elem.firstChild)
				this.elem.removeChild(this.elem.firstChild);
		this.cards = [];
	}
	
}

// Contians all used cards in the order that they were discarded
class Grave extends CardContainer {
	constructor(elem) {
		super(elem)
		elem.addEventListener("click", () => ui.viewCardsInContainer(this), false);
	}

	// Override
	addCardElement(card, index){
		if (card && card.elem) {
			super.addCardElement(card, index);
			return;
		}
		let elem = document.createElement("div");
		elem.classList.add("deck-card");
		if (this.elem)
			this.elem.appendChild(elem);
		let placeholder = { elem: elem };
		this.cards.push(placeholder);
		this.setCardOffset(placeholder, this.cards.length - 1);
	}

	addPlaceholder(){
		this.addCardElement(null, 0);
	}
	
	// Override
	addCard(card){
		this.setCardOffset(card, this.cards.length);
		super.addCard(card, this.cards.length);
	}
	
	// Override
	removeCard(card){
		let n = isNumber(card) ? card : this.cards.indexOf(card);
		return super.removeCard(card, n);
	}
	
	// Override
	removeCardElement(card, index){
		card.elem.style.left = "";
		super.removeCardElement(card, index);
		for (let i=index; i<this.cards.length; ++i){
//			if (!this.cards[i])
//				console.log(i, index, card, this.cards[i]);
			this.setCardOffset(this.cards[i], i);
		}
	}
	
	// Offsets the card element in the deck
	setCardOffset(card, n){
		card.elem.style.left =  -0.03 * n +"vw";
	}
}

// Contains a randomized set of cards to be drawn from
class Deck extends CardContainer {
	constructor(faction, elem){
		super(elem);
		this.faction = faction;

		this.counter = document.createElement("div");
		this.counter.classList = "deck-counter center";
		this.counter.appendChild( document.createTextNode(this.cards.length) );
		this.elem.appendChild(this.counter);
	}
	
	// Creates duplicates of cards with a count of more than one, then initializes deck
	initializeFromID(card_id_list, player){
		this.initialize( card_id_list.reduce((a,c) => a.concat(clone(c.count, card_dict[c.index])), []), player);
		function clone(n ,elem) { for (var  i=0, a=[]; i<n; ++i) a.push(elem); return a; }
	}
	
	// Populates a this deck with a list of card data and associated those cards with the owner of this deck.
	initialize(card_data_list, player){
		for (let i=0; i<card_data_list.length; ++i) {
			let card = new Card(card_data_list[i], player);
			card.holder = player;
			this.addCardRandom(card);
			this.addCardElement();
		}
		this.resize();
	}
	
	// Override
	addCard(card){
		this.addCardRandom(card);
		this.addCardElement();
		this.resize();
	}
	
	// Sends the top card to the passed hand
	async draw(hand){
		if (hand === player_op.hand)
			hand.addCard(this.removeCard(0));
		else
			await board.toHand(this.cards[0], this);
	}
	
	// Draws a card and sends it to the container before adding a card from the container back to the deck.
	swap(container, card){
		container.addCard(this.removeCard(0));
		this.addCard(card);
	}
	
	// Override
	addCardElement() {
		let elem = document.createElement("div");
		elem.classList.add("deck-card");
		elem.style.backgroundImage = iconURL("deck_back_" + this.faction, "jpg");
		this.setCardOffset(elem, this.cards.length-1);
		this.elem.insertBefore(elem, this.counter);
	}
	
	// Override
	removeCardElement(){
		this.elem.removeChild(this.elem.children[this.cards.length]).style.left = "";
	}
	
	// Offsets the card element in the deck
	setCardOffset(elem, n){
		elem.style.left =  -0.03 * n +"vw";
	}
	
	// Override
	resize(){
		this.counter.innerHTML = this.cards.length;
		this.setCardOffset(this.counter, this.cards.length);
	}
	
	// Override
	reset() {
		super.reset();
		this.elem.appendChild(this.counter);
	}
}

// Hand used by computer AI. Has an offscreen HTML element for card transitions.
class HandAI extends CardContainer {
	constructor() {
		super(undefined);
		this.counter = document.getElementById("hand-count-op"); 
		this.hidden_elem = document.getElementById("hand-op");
	}
	resize() {this.counter.innerHTML = this.cards.length; }
}

// Hand used by current player
class Hand extends CardContainer {
	constructor(elem){
		super(elem);
		this.counter = document.getElementById("hand-count-me");
	}
	
	// Override
	addCard(card){
		let i = this.addCardSorted(card);
		this.addCardElement(card, i);
		this.resize();
	}
	
	// Override
	resize() {
		this.counter.innerHTML = this.cards.length;
		this.resizeCardContainer(11, 0.075, .00225);
	}
}

// Contains active cards and effects. Calculates the current score of each card and the row.
class Row extends CardContainer {
	constructor(elem) {
		super(elem.getElementsByClassName("row-cards")[0]);
		this.elem_parent = elem;
		this.elem_special = elem.getElementsByClassName("row-special")[0];
		this.special = null;
		this.total = 0;
		this.effects = {weather:false, bond: {}, morale: 0, horn: 0, mardroeme: 0};
		this.elem.addEventListener("click", () => ui.selectRow(this), true);
		this.elem_special.addEventListener("click", () => ui.selectRow(this), false, true);
	}
	
	// Override
	async addCard(card) {
		if (card.isSpecial()) {
			this.special = card;
			this.elem_special.appendChild(card.elem);
		} else {
			let index = this.addCardSorted(card);
			this.addCardElement(card, index);
			this.resize();
		}
		this.updateState(card, true);
		for (let x of card.placed) 
			await x(card, this);
		card.elem.classList.add("noclick");
		await sleep(600);
		this.updateScore();
	}
	
	// Override
	removeCard(card) {
		card = isNumber(card) ? card === -1 ? this.special : this.cards[card] : card;
		if (card.isSpecial()) {
			this.special = null;
			this.elem_special.removeChild(card.elem);
		} else {
			super.removeCard(card);
			card.resetPower();
		}
		this.updateState(card, false);
		for (let x of card.removed)
			x(card);
		this.updateScore();
		return card;
	}
	
	// Override
	removeCardElement(card, index) {
		super.removeCardElement(card, index);
		let x = card.elem;
		x.style.marginLeft = x.style.marginRight = "";
		x.classList.remove("noclick");
	}
	
	// Updates a card's effect on the row
	updateState(card, activate){
		for (let x of card.abilities){
			switch (x) {
				case "morale":
				case "horn":
				case "mardroeme": this.effects[x]+= activate ? 1 : -1; break;
				case "bond": 
					if (!this.effects.bond[card.id()])
						this.effects.bond[card.id()] = 0;
					this.effects.bond[card.id()] += activate ? 1 : -1;
					break;
			}
		}
	}
	
	// Activates weather effect and visuals
	addOverlay(overlay){
		this.effects.weather = true;
		this.elem_parent.getElementsByClassName("row-weather")[0].classList.add(overlay);
		this.updateScore();
	}
	
	// Deactivates weather effect and visuals
	removeOverlay(overlay){
		this.effects.weather = false;
		this.elem_parent.getElementsByClassName("row-weather")[0].classList.remove(overlay);
		this.updateScore();
	}
	
	// Override
	resize(){
		this.resizeCardContainer(10, 0.075, .00325);
	}
	
	// Updates the row's score by summing the current power of its cards
	updateScore() {
		let total = 0;
		for (let card of this.cards) {
			total += this.cardScore(card);
		}
		let player = this.elem_parent.parentElement.id === "field-op" ? player_op : player_me;
		player.updateTotal(total - this.total);
		this.total = total;
		this.elem_parent.getElementsByClassName("row-score")[0].innerHTML = this.total;
	}
	
	// Calculates and set the card's current power
	cardScore(card){
		let total = this.calcCardScore(card);
		card.setPower(total);
		return total;
	}
	
	// Calculates the current power of a card affected by row affects
	calcCardScore(card) {
		if (card.name === "decoy")
			return 0;
		let total = card.basePower;
		if (card.hero)
			return total;
		if (this.effects.weather) {
			let player = this.elem_parent.parentElement.id === "field-op" ? player_op : player_me;
			total = player && player.halfWeather ? Math.max(1, Math.ceil(total / 2)) : Math.min(1, total);
		}
		if (game.doubleSpyPower && card.abilities.includes("spy"))
			total *= 2;
		let bond = this.effects.bond[card.id()];
		if (isNumber(bond) && bond > 1)
			total *= Number(bond);
		total += Math.max(0, this.effects.morale + (card.abilities.includes("morale") ? -1 : 0 ));
		if (this.effects.horn - (card.abilities.includes("horn") ? 1 : 0) >  0 )
			total *= 2;
		return total;
	}
	
	// Applies a temporary leader horn affect that is removed at the end of the round
	async leaderHorn(){
		if (this.special !== null)
			return;
		let horn = new Card(card_dict[5], null);
		await this.addCard(horn);
		game.roundEnd.push( () => this.removeCard(horn) );
	}
	
	// Applies a local scorch effect to this row
	async scorch() {
		if (this.total >= 10)
			await Promise.all( this.maxUnits().map( async c => {
				await c.animate("scorch", true, false);
				await board.toGrave(c, this);
			}));
	}
	
	// Removes all cards and effects from this row
	clear() {
		if (this.special != null)
			board.toGrave(this.special, this);
		this.cards.filter(c => !c.noRemove).forEach(c => board.toGrave(c, this) );
	}

	// Returns all regular unit cards with the heighest power
	maxUnits(){
		let max = [];
		for (let i=0; i<this.cards.length; ++i){
			let card = this.cards[i];
			if (!card.isUnit())
				continue;
			if (!max[0] || max[0].power < card.power)
				max = [card];
			else if (max[0].power === card.power)
				max.push(card);
		}
		return max;
	}
	
	// Override
	reset(){
		super.reset();
		while(this.special)
			this.removeCard(this.special);
		while(this.elem_special.firstChild)
			this.elem_special.removeChild(this.elem_speical.firstChild);
		this.total = 0;
		//["rain","fog","frost"].forEach( w => this.removeOverlay(w) );
		this.effects = {weather:false, bond: {}, morale: 0, horn: 0, mardroeme: 0};
	}
}

// Handles how weather effects are added and removed
class Weather extends CardContainer {
	constructor(elem) {
		super(document.getElementById("weather"));
		this.types = {
			rain: {name:"rain", count: 0, rows: []},
			fog: {name:"fog", count: 0, rows: []},
			frost: {name:"frost", count: 0, rows: []}
		}
		let i=0;
		for (let key of Object.keys(this.types))
			this.types[key].rows = [board.row[i], board.row[5-i++]];
		
		this.elem.addEventListener("click",() => ui.selectRow(this), false);
	}
	
	// Adds a card if unique and clears all weather if 'clear weather' card added
	async addCard(card) {
		super.addCard(card);
		card.elem.classList.add("noclick");
		if (card.name === "Clear Weather"){
			// TODO Sunlight animation
			await sleep(500);
			this.clearWeather();
		} else {
			this.changeWeather(card, x => ++this.types[x].count === 1, (r,t) => r.addOverlay(t.name));
			for (let i=this.cards.length-2; i>=0; --i) {
				if (card.name === this.cards[i].name) {
					await sleep(750);
					await board.toGrave(card, this);
					break;
				}
			}
		}
		await sleep(750);
	}
	
	// Override
	removeCard(card){
		card = super.removeCard(card);
		card.elem.classList.remove("noclick");
		this.changeWeather(card, x => --this.types[x].count === 0, (r,t) => r.removeOverlay(t.name));
		return card;
	}
	
	// Checks if a card's abilities are a weather type. If the predicate is met, perfom the action
	// on the type's associated rows
	changeWeather(card, predicate, action) {
		for (let x of card.abilities) {
			if (x in this.types && predicate(x)){
				for (let r of this.types[x].rows)
					action(r, this.types[x]);
			}
		}
	}
	
	// Removes all weather effects and cards
	async clearWeather() {
		await Promise.all(this.cards.map((c,i)=>this.cards[this.cards.length-i-1]).map(c => board.toGrave(c, this)));
	}
	
	// Override
	resize() {
		this.resizeCardContainer(4, 0.075, .045);
	}
	
	// Override
	reset(){
		super.reset();
		Object.keys(this.types).map(t => this.types[t].count = 0);
	}
}

// 
class Board {
	constructor() {
		this.op_score = 0;
		this.me_score = 0;
		this.row = [];
		for (let x=0; x<6; ++x) {
			let elem = document.getElementById( (x<3)?"field-op":"field-me" ).children[x%3];
			this.row[x] = new Row(elem);
		}
	}
	
	// Get the opponent of this Player
	opponent(player){
		return player === player_me ? player_op : player_me;
	}
	
	// Sends and translates a card from the source to the Deck of the card's holder
	async toDeck(card, source){
		await this.moveTo(card, "deck", source);
	}
	
	// Sends and translates a card from the source to the Grave of the card's holder
	async toGrave(card, source){
		await this.moveTo(card, "grave", source);
	}

	// Sends and translates a card from the source to the Hand of the card's holder
	async toHand(card, source) {
		await this.moveTo(card, "hand", source);
	}

	// Sends and translates a card from the source to Weather
	async toWeather(card, source) {
		await this.moveTo(card, weather, source);
	}
	
	// Sends and translates a card from the source to the Deck of the card's combat row
	async toRow(card, source) {
		let row = (card.row === "agile") ? "close" : card.row ? card.row : "close";
		await this.moveTo(card, row, source);
	}
	
	// Sends and translates a card from the source to a specified row name or CardContainer
	async moveTo(card, dest, source) {
		if (isString(dest))
			dest = this.getRow(card, dest);
		await translateTo(card, source ? source : null, dest);
		await dest.addCard(source ? source.removeCard(card) : card);
	}
	
	// Sends and translates a card from the source to a row name associated with the passed player
	async addCardToRow(card, row_name, player, source) {
		let row = this.getRow(card, row_name, player);
		await translateTo(card, source, row);
		await row.addCard(card);
	}
	
	// Returns the CardCard associated with the row name that the card would be sent to
	getRow(card, row_name, player){
		player = player ? player : card ? card.holder : player_me;
		if (!card && ["close", "ranged", "siege"].includes(row_name))
			return null;
		let isMe = player === player_me;
		let isSpy = card && card.abilities ? card.abilities.includes("spy") : false;
		switch (row_name) {
			case "weather": return weather; break;
			case "close":  return this.row[ isMe^isSpy ? 3 : 2];
			case "ranged": return this.row[ isMe^isSpy ? 4 : 1];
			case "siege":  return this.row[ isMe^isSpy ? 5 : 0];
			case "grave": return player.grave;
			case "deck": return player.deck;
			case "hand": return player.hand;
			default: console.error( (card ? card.name : "null") + " sent to incorrect row \"" +row_name+ "\" by " +(card && card.holder ? card.holder.name : "unknown") );
		}
	}
	
	// Updates which player currently is in the lead
	updateLeader() {
		let dif = player_me.total - player_op.total;
		player_me.setWinning(dif > 0);
		player_op.setWinning(dif < 0);
	}
}

// Contians information and behavior of a Card
class Card {

	constructor(card_data, player) {
		this.name = card_data.name;
		this.basePower = this.power = Number(card_data.strength);
		this.faction = card_data.deck;
		this.abilities = (card_data.ability === "") ? [] : card_data.ability.split(" ");
		this.row = (card_data.deck === "weather") ? card_data.deck : card_data.row;
		this.filename = card_data.filename;
		this.placed = [];
		this.removed = [];
		this.activated = [];
		this.holder = player;
		this.pvpInstanceId = null;
		
		this.hero = false;
		if (this.abilities.length > 0) {
			if (this.abilities[0] === "hero") {
				this.hero = true;
				this.abilities.splice(0, 1);
			}
			for (let x of this.abilities) {
				let ab = ability_dict[x];
				if ("placed" in ab) this.placed.push(ab.placed);
				if ("removed" in ab) this.removed.push(ab.removed);
				if ("activated" in ab) this.activated.push(ab.activated);
			}
		}
		
		if (this.row === "leader")
			this.desc_name = "Leader Ability";
		else if (this.abilities.length > 0)
			this.desc_name = ability_dict[this.abilities[this.abilities.length-1]].name;
		else if (this.row==="agile")
			this.desc_name = "agile";
		else if (this.hero)
			this.desc_name = "hero";
		else
			this.desc_name = "";
		
		this.desc = this.row ==="agile" ? ability_dict["agile"].description : "";
		for (let i=this.abilities.length-1; i>=0; --i) {
			this.desc += ability_dict[this.abilities[i]].description;
		}
		if (this.hero)
			this.desc += ability_dict["hero"].description;
		
		this.elem = this.createCardElem(this);
	}
	
	// Returns the identifier for this type of card
	id() {
		return this.name;
	}
	
	// Sets and displays the current power of this card
	setPower(n){
		if (this.name === "Decoy")
			return;
		let elem = this.elem.children[0].children[0];
		if (n !== this.power) {
			this.power = n;
			elem.innerHTML = this.power;
		}
		elem.style.color = (n>this.basePower) ? "goldenrod" : (n<this.basePower) ? "red" : "";
	}
	
	// Resets the power of this card to default
	resetPower(){
		this.setPower(this.basePower);
	}
	
	// Automatically sends and translates this card to its apropriate row from the passed source
	async autoplay(source){
		await board.toRow(this, source);
	}
	
	// Animates an ability effect
	async animate(name, bFade = true, bExpand = true) {
		if (name === "scorch") {
			return await this.scorch(name);
		}
		let anim = this.elem.children[3];
		anim.style.backgroundImage = iconURL("anim_" + name);
		await sleep(50);
		
		if (bFade) fadeIn(anim, 300);
		if (bExpand) anim.style.backgroundSize = "100% auto";
		await sleep(300);
		
		if (bExpand) anim.style.backgroundSize = "80% auto";
		await sleep(1000);
		
		if (bFade) fadeOut(anim, 300);
		if (bExpand) anim.style.backgroundSize = "40% auto";
		await sleep(300);
		
		anim.style.backgroundImage = "";
	}
	
	// Animates the scorch effect
	async scorch(name){
		let anim = this.elem.children[3];
		anim.style.backgroundSize = "cover";
		anim.style.backgroundImage = iconURL("anim_" + name);
		await sleep(50);
		
		fadeIn(anim, 300);
		await sleep(1300);
		
		fadeOut(anim, 300);
		await sleep(300);
		
		anim.style.backgroundSize = "";
		anim.style.backgroundImage = "";
	}
	
	// Returns true if this is a combat card that is not a Hero
	isUnit(){
		return !this.hero && (this.row === "close" || this.row === "ranged" || this.row === "siege" || this.row === "agile");
	}
	
	// Returns true if card is sent to a Row's special slot
	isSpecial() {
		return this.name === "Commander's Horn" || this.name === "Mardroeme";
	}

	// Compares by type then power then name
	static compare(a, b){
		var dif = factionRank(a) - factionRank(b);
		if (dif !== 0)
			return dif;
		dif = a.basePower - b.basePower;
		if (dif && dif !== 0)
			return dif;
		return a.name.localeCompare(b.name);
		
		function factionRank(c){ return c.faction === "special" ? -2 : (c.faction === "weather") ? -1 : 0; }
	}
	
	// Creates an HTML element based on the card's properties
	createCardElem(card){
		let elem = document.createElement("div");
		elem.style.backgroundImage = smallURL(card.faction + "_" + card.filename);
		elem.classList.add("card");
		elem.addEventListener("click", () => ui.selectCard(card), false);
		
		if (card.row === "leader")
			return elem;
		
		let power = document.createElement("div");
		elem.appendChild(power);
		let bg;
		if (card.hero) {
			bg = "power_hero";
			elem.classList.add("hero");
		} else if (card.faction === "weather") {
			bg = "power_" + card.abilities[0];
		} else if (card.faction === "special") {
			bg = "power_" + card.abilities[0];
			elem.classList.add("special");
		} else {
			bg = "power_normal";
		}
		power.style.backgroundImage = iconURL(bg);
		
		let row = document.createElement("div");
		elem.appendChild(row);
		if (card.row === "close" || card.row === "ranged" || card.row === "siege" || card.row === "agile") {
			let num = document.createElement("div");
			num.appendChild( document.createTextNode(card.basePower) );
			num.classList.add("center");
			power.appendChild(num);
			row.style.backgroundImage = iconURL("card_row_" + card.row);
		}

		let abi = document.createElement("div");
		elem.appendChild(abi);
		if (card.faction !== "special" && card.faction !== "weather" && card.abilities.length > 0) {
			let str =  card.abilities[card.abilities.length-1];
			if (str === "cerys")
				str = "muster";
			if (str.startsWith("avenger"))
				str = "avenger";
			if (str === "scorch_c" || str == "scorch_r" || str === "scorch_s")
				str = "scorch";
			abi.style.backgroundImage = iconURL("card_ability_" + str);
		} else if (card.row === "agile")
			abi.style.backgroundImage = iconURL("card_ability_" + "agile");
		
		elem.appendChild( document.createElement("div") ); // animation overlay
		return elem;
	}

}

// Handles notifications and client interration with menus
class UI {
	constructor() {
		this.carousels = [];
		this.notif_elem = document.getElementById("notification-bar");
		this.preview = document.getElementsByClassName("card-preview")[0];
		this.previewCard = null;
		this.lastRow = null;
		document.getElementById("pass-button").addEventListener("click", () => game.handlePassAction(), false);
		document.getElementById("forfeit-button").addEventListener("click", () => game.forfeitMatch(), false);
		document.getElementById("click-background").addEventListener("click", () => ui.cancel(), false);
		this.youtube;
		this.ytActive;
		this.toggleMusic_elem = document.getElementById("toggle-music");
		this.toggleMusic_elem.classList.add("fade");
		this.toggleMusic_elem.addEventListener("click", () => this.toggleMusic(), false);
	}
	
	// Enables or disables client interration
	enablePlayer(enable){
		let main = document.getElementsByTagName("main")[0].classList;
		if (enable) main.remove("noclick"); else main.add("noclick");
	}
	
	// Initializes the youtube background music object
	initYouTube(){
		this.youtube = new YT.Player('youtube', {
			videoId: "UE9fPWy1_o4",
			playerVars:  { "autoplay" : 0, "controls" : 0, "loop" : 1, "playlist" : "UE9fPWy1_o4", "rel" : 0, "version" : 3, "modestbranding" : 1 },
			events: { 'onStateChange': initButton }
		});
		
		function initButton(){
			if (ui.ytActive !== undefined)
				return;
			ui.ytActive = false;
			ui.toggleMusic_elem.classList.remove("fade");
		}
	}
	
	// Called when client toggles the music
	toggleMusic(){
		if (this.youtube.getPlayerState() !== YT.PlayerState.PLAYING) {
			this.youtube.playVideo();
			this.toggleMusic_elem.classList.remove("fade");
		} else {
			this.youtube.pauseVideo();
			this.toggleMusic_elem.classList.add("fade");
		}
	}
	
	// Enables or disables backgorund music 
	setYouTubeEnabled(enable){
		if (this.ytActive === enable)
			return;
		if (enable && !this.mute)
			ui.youtube.playVideo();
		else
			ui.youtube.pauseVideo();
		this.ytActive = enable;
}
	
	// Called when the player selects a selectable card
	async selectCard(card) {
		if (game.mode === "pvp" && card && card.holder === player_me && player_me.hand.cards.includes(card)) {
			if (!game.activeMatchBootstrap || game.activeMatchBootstrap.status !== "active" || game.activeMatchBootstrap.currentTurnPlayerId !== game.activeMatchBootstrap.self.playerId)
				return;
			if (!game.isSupportedPvPCard(card)) {
				await dm.showAlert("This PvP build does not support this card or its full effect yet.", "PvP");
				return;
			}
			let pCard = this.previewCard;
			if (card === pCard)
				return;
			this.setSelectable(null, false);
			this.showPreview(card);
			return;
		}
		let row = this.lastRow;
		let pCard = this.previewCard;
		if (card === pCard)
			return;
		if (pCard === null || card.holder.hand.cards.includes(card)) {
			this.setSelectable(null, false);
			this.showPreview(card);
		} else if (pCard.name === "Decoy") {
			this.hidePreview(card);
			this.enablePlayer(false);
			board.toHand(card, row);
			await board.moveTo(pCard, row, pCard.holder.hand);
			pCard.holder.endTurn();
		}
	}
	
	// Called when the player selects a selectable CardContainer
	async selectRow(row){
		this.lastRow = row;
		if (this.previewCard === null) {
			await ui.viewCardsInContainer(row);
			return;
		}
		if (game.mode === "pvp" && game.isSupportedPvPCard(this.previewCard)) {
			let rowName = game.getPvPRowName(row);
			let validRows = this.previewCard.faction === "weather" ? ["weather"] : this.previewCard.row === "agile" ? ["close", "ranged"] : [this.previewCard.row];
			if (!validRows.includes(rowName))
				return;
			let card = this.previewCard;
			this.hidePreview();
			this.enablePlayer(false);
			await dm.playPvPCard(card, rowName);
			return;
		}
		if (this.previewCard.name === "Decoy")
			return;
		let card = this.previewCard;
		let holder = card.holder;
		this.hidePreview();
		this.enablePlayer(false);
		if (card.name === "Scorch"){
			this.hidePreview();
			await ability_dict["scorch"].activated(card);
		} else if (card.name === "Decoy") {
			return;
		} else {
			await board.moveTo(card, row, card.holder.hand);
		}
		holder.endTurn();
	}
	
	// Called when the client cancels out of a card-preview
	cancel(){
		this.hidePreview();
	}
	
	// Displays a card preview then enables and highlights potential card destinations
	showPreview(card) {
		this.showPreviewVisuals(card);
		this.setSelectable(card, true);
		document.getElementById("click-background").classList.remove("noclick");
	}
	
	// Sets up the graphics and description for a card preview
	showPreviewVisuals(card){
		this.previewCard = card;
		this.preview.classList.remove("hide");
		this.preview.getElementsByClassName("card-lg")[0].style.backgroundImage = largeURL(card.faction+"_"+card.filename);
		let desc_elem = this.preview.getElementsByClassName("card-description")[0];
		this.setDescription(card, desc_elem);
	}
	
	// Hides the card preview then disables and removes highlighting from card destinations
	hidePreview(){
		document.getElementById("click-background").classList.add("noclick");
		player_me.hand.cards.forEach( c => c.elem.classList.remove("noclick") );
		
		this.preview.classList.add("hide");
		this.setSelectable(null, false);
		this.previewCard = null;
		this.lastRow = null;
	}
	
	// Sets up description window for a card
	setDescription(card, desc){
		if (card.hero || card.row === "agile" || card.abilities.length > 0 || card.faction === "faction") {
			desc.classList.remove("hide");
			let str = card.row === "agile" ? "agile" : "";
			if (card.abilities.length)
				str = card.abilities[card.abilities.length-1];
			if (str === "cerys")
				str = "muster";
			if (str.startsWith("avenger"))
				str = "avenger";
			if (str === "scorch_c" || str == "scorch_r" || str === "scorch_s")
				str = "scorch";
			if (card.row === "leader" || card.faction === "faction" || card.abilities.length === 0 && card.row !== "agile")
				desc.children[0].style.backgroundImage = "";
			else
				desc.children[0].style.backgroundImage = iconURL("card_ability_" + str);
			desc.children[1].innerHTML = card.desc_name;
			desc.children[2].innerHTML = card.desc;
		} else {
			desc.classList.add("hide");
		}
	}
	
	// Displayed a timed notification to the client
	async notification(name, duration){
		if (!duration)
			duration = 1200;
		duration = Math.max(400, duration);
		const fadeSpeed = 150;
		this.notif_elem.children[0].id = "notif-" + name;
		fadeIn(this.notif_elem, fadeSpeed);
		fadeOut(this.notif_elem, fadeSpeed, duration - fadeSpeed);
		await sleep(duration);
	}
	
	// Displays a cancellable Carousel for a single card 
	async viewCard(card, action) {
		if (card === null)
			return;
		let container = new CardContainer();
		container.cards.push(card);
		await this.viewCardsInContainer(container, action);
	}
	
	// Displays a cancellable Carousel for all cards in a container
	async viewCardsInContainer(container, action) {
		action = action ? action : function() {return this.cancel();};
		await this.queueCarousel(container, 1, action, () => true, false, true);
	}
	
	// Displays a Carousel menu of filtered container items that match the predicate.
	// Suspends gameplay until the Carousel is closed. Automatically picks random card if activated for AI player
	async queueCarousel(container, count, action, predicate, bSort, bQuit, title){
		if (game.currPlayer === player_op) {
			if (player_op.controller instanceof ControllerAI)
				for (let i=0; i<count; ++i){
					let cards = container.cards.reduce((a,c,i) => !predicate || predicate(c) ? a.concat([i]) : a, []);
					await action(container, cards[randomInt(cards.length)]);
				}
			return;
		}
		let carousel = new Carousel(container, count, action, predicate, bSort, bQuit, title);
		if (Carousel.curr === undefined || Carousel.curr === null)
			carousel.start();
		else {
			this.carousels.push(carousel);
			return;
		}
		await sleepUntil( () => this.carousels.length === 0 && !Carousel.curr, 100);
	}
	
	// Starts the next queued Carousel
	quitCarousel(){
		if (this.carousels.length > 0) {
			this.carousels.shift().start();
		}
	}
	
	// Displays a custom confirmation menu 
	async popup(yesName, yes, noName, no, title, description) {
		let p = new Popup(yesName, yes, noName, no, title, description);
		await sleepUntil( () => !Popup.curr) 
	}
	
	// Enables or disables selection and highlighting of rows specific to the card
	setSelectable(card, enable){
		if(!enable) {
			for (let row of board.row){
				row.elem.classList.remove("row-selectable");
				row.elem.classList.remove("noclick");
				row.elem_special.classList.remove("row-selectable");
				row.elem_special.classList.remove("noclick");
				row.elem.classList.add("card-selectable");
				
				for (let card of row.cards) {
					card.elem.classList.add("noclick");
				}
			}
			weather.elem.classList.remove("row-selectable");
			weather.elem.classList.remove("noclick");
			return;
		}
		if (card.faction === "weather") {
			for (let row of board.row){
				row.elem.classList.add("noclick");
				row.elem_special.classList.add("noclick");
			}
			weather.elem.classList.add("row-selectable");
			return;
		}
		
		weather.elem.classList.add("noclick");
		
		if (card.name === "Scorch") {
			for (let r of board.row){
				r.elem.classList.add("row-selectable");
				r.elem_special.classList.add("row-selectable");
			}
			return;
		}
		if (card.isSpecial()){
			for (let i=0; i<6; i++){
				let r = board.row[i];
				if (i < 3 || r.special !== null){
					r.elem.classList.add("noclick");
					r.elem_special.classList.add("noclick");
				} else {
					r.elem_special.classList.add("row-selectable");
				}
			}
			return;
		}
		
		board.row.forEach( r => r.elem_special.classList.add("noclick") );
		
		if (card.name === "Decoy"){
			for (let i=0; i<6; ++i) {
				let r = board.row[i];
				let units = r.cards.filter(c => c.isUnit());
				if (i < 3 || units.length === 0) {
					r.elem.classList.add("noclick");
					r.elem_special.classList.add("noclick");
					r.elem.classList.remove("card-selectable");
				} else {
					r.elem.classList.add("row-selectable");
					units.forEach( c => c.elem.classList.remove("noclick") );
				}
			}
			return;
		}
		
		let currRows = card.row === "agile" ? [board.getRow(card, "close", card.holder), board.getRow(card, "ranged", card.holder)] : [board.getRow(card, card.row, card.holder)];
		for (let i=0; i<6; i++){
			let row = board.row[i];
			if (currRows.includes(row)) {
				row.elem.classList.add("row-selectable");
			} else {
				row.elem.classList.add("noclick");
			}
		}
	
	}
}

// Displays up to 5 cards for the client to cycle through and select to perform an action
// Clicking the middle card performs the action on that card "count" times
// Clicking adejacent cards shifts the menu to focus on that card
class Carousel {
	constructor(container, count, action, predicate, bSort, bExit = false, title) {
		if (count <= 0 || !container || !action || container.cards.length === 0)
			return ;
		this.container = container;
		this.count = count;
		this.action = action ? action : () => this.cancel();
		this.predicate = predicate;
		this.bSort = bSort;
		this.indices = [];
		this.index = 0;
		this.currentInstanceId = null;
		this.busy = false;
		this.bExit = bExit;
		this.title = title;
		this.cancelled = false;
		
		if (!Carousel.elem) {
			Carousel.elem = document.getElementById("carousel");
			Carousel.elem.children[0].addEventListener("click", () => Carousel.curr.cancel(), false);
		}
		this.elem = Carousel.elem;
		document.getElementsByTagName("main")[0].classList.remove("noclick");
		
		this.elem.children[0].classList.remove("noclick");
		this.previews = this.elem.getElementsByClassName("card-lg");
		this.desc = this.elem.getElementsByClassName("card-description")[0];
		this.title_elem = this.elem.children[2];
	}
	
	// Initializes the current Carousel
	start(){
		if (!this.elem)
			return;
		this.indices = this.container.cards.reduce((a,c,i)=> (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
		if (this.indices.length <= 0)
			return this.exit();
		if (this.bSort)
			this.indices.sort( (a, b) => Card.compare(this.container.cards[a],this.container.cards[b]) );
		this.index = 0;
		let selectedCard = this.container.cards[this.indices[this.index]];
		this.currentInstanceId = selectedCard && selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : null;
		
		this.update();
		Carousel.setCurrent(this);
		
		if (this.title) {
			this.title_elem.innerHTML = this.title;
			this.title_elem.classList.remove("hide");
		} else {
			this.title_elem.classList.add("hide");
		}
		
		this.elem.classList.remove("hide");
		ui.enablePlayer(true);
	}
	
	// Called by the client to cycle cards displayed by n
	shift(event, n){
		(event || window.event).stopPropagation();
		this.index = Math.max(0, Math.min(this.indices.length-1, this.index+n));
		let selectedCard = this.container.cards[this.indices[this.index]];
		this.currentInstanceId = selectedCard && selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : null;
		this.update();
	}
	
	// Called by client to perform action on the middle card in focus
	async select(event) {
		(event || window.event).stopPropagation();
		if (this.busy)
			return;
		let selectedIndex = -1;
		let selectedCard = null;
		if (this.currentInstanceId) {
			selectedIndex = this.container.cards.findIndex(card => card && card.pvpInstanceId === this.currentInstanceId);
			if (selectedIndex >= 0)
				selectedCard = this.container.cards[selectedIndex];
		}
		if (!selectedCard) {
			this.indices = this.container.cards.reduce((a,c,i)=> (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
			if (this.bSort)
				this.indices.sort( (a, b) => Card.compare(this.container.cards[a],this.container.cards[b]) );
			selectedIndex = this.indices[this.index];
			selectedCard = this.container.cards[selectedIndex];
		}
		if (!selectedCard)
			return;
		if (!selectedCard)
			return;
		this.currentInstanceId = selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : null;
		--this.count;
		if (this.isLastSelection())
			this.elem.classList.add("hide");
		if (this.count <= 0)
			ui.enablePlayer(false);
		this.busy = true;
		this.elem.classList.add("noclick");
		await this.action(this.container, selectedIndex, selectedCard);
		this.elem.classList.remove("noclick");
		this.busy = false;
		let nextSelectedCard = this.container.cards[selectedIndex]
			|| this.container.cards[Math.max(0, selectedIndex - 1)]
			|| null;
		this.currentInstanceId = nextSelectedCard && nextSelectedCard.pvpInstanceId ? nextSelectedCard.pvpInstanceId : null;
		if (this.isLastSelection() && !this.cancelled)
			return this.exit();
		this.update();
	}
	
	// Called by client to exit out of the current Carousel if allowed. Enables player interraction.
	cancel(){
		if (this.bExit){
			this.cancelled = true;
			this.exit();
		}
		ui.enablePlayer(true);
	}
	
	// Returns true if there are no more cards to view or select
	isLastSelection(){
		return this.count <= 0 || this.indices.length === 0;
	}
	
	// Updates the visuals of the current selection of cards
	update(){
		let currentInstanceId = this.currentInstanceId;
		this.indices = this.container.cards.reduce((a,c,i)=> (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
		if (this.bSort)
			this.indices.sort( (a, b) => Card.compare(this.container.cards[a],this.container.cards[b]) );
		let matchedCurrent = false;
		if (currentInstanceId) {
			let instanceIndex = this.indices.findIndex(i => this.container.cards[i] && this.container.cards[i].pvpInstanceId === currentInstanceId);
			if (instanceIndex >= 0) {
				this.index = instanceIndex;
				matchedCurrent = true;
			}
		}
		if (this.indices.length <= 0) {
			this.elem.classList.add("hide");
			return;
		}
		if (currentInstanceId && !matchedCurrent)
			this.index = 0;
		if (this.index >= this.indices.length)
			this.index =  this.indices.length-1;
		if (this.index < 0)
			this.index = 0;
		for (let i=0; i<this.previews.length; i++) {
			let curr = this.index - 2 + i;
			if (curr >= 0 && curr < this.indices.length) {
				let card = this.container.cards[this.indices[curr]];
				this.previews[i].style.backgroundImage = largeURL(card.faction + "_" + card.filename);
				this.previews[i].classList.remove("hide");
				this.previews[i].classList.remove("noclick");
			} else {
				this.previews[i].style.backgroundImage = "";
				this.previews[i].classList.add("hide");
				this.previews[i].classList.add("noclick");
			}
		}
		let selectedCard = this.container.cards[this.indices[this.index]];
		this.currentInstanceId = selectedCard && selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : null;
		if (selectedCard)
			ui.setDescription(selectedCard, this.desc);
	}
	
	// Clears and quits the current carousel
	exit() {
		for (let x of this.previews)
			x.style.backgroundImage = "";
		this.elem.classList.add("hide");
		Carousel.clearCurrent();
		ui.quitCarousel();
	}
	
	// Statically sets the current carousel
	static setCurrent(curr) {
		this.curr = curr;
	}
	
	// Statically clears the current carousel
	static clearCurrent() {
		this.curr = null;
	}
}

// Custom confirmation windows
class Popup {
	constructor(yesName, yes, noName, no, header, description){
		this.yes = yes ? yes : ()=>{};
		this.no = no ? no : ()=>{};
		
		this.elem = document.getElementById("popup");
		let main = this.elem.children[0];
		main.children[0].innerHTML = header ? header : "";
		main.children[1].innerHTML = description ? description : "";
		main.children[2].children[0].innerHTML = (yesName) ? yesName : "Yes";
		main.children[2].children[1].innerHTML = (noName) ? noName : "No";
		main.children[2].children[1].classList.toggle("hide", !noName);
		
		this.elem.classList.remove("hide");
		Popup.setCurrent(this);
		ui.enablePlayer(true);
	}
	
	// Sets this as the current popup window
	static setCurrent(curr){ this.curr = curr; }
	
	// Unsets this as the current popup window
	static clearCurrent()  { this.curr = null; }
	
	// Called when client selects the positive aciton
	selectYes() {
		this.clear()
		this.yes();
		return true;
	}
	
	// Called when client selects the negative option
	selectNo() {
		this.clear();
		this.no();
		return false;
	}
	
	// Clears the popup and diables player interraction
	clear() {
		ui.enablePlayer(false);
		this.elem.children[0].children[2].children[1].classList.remove("hide");
		this.elem.classList.add("hide");
		Popup.clearCurrent();
	}
	
}

// Screen used to customize, import and export deck contents
class DeckMakerLegacy {
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
			await ui.notification("win-round", 1200);
		else if (!roundEvent.winnerPlayerId)
			await ui.notification("draw-round", 1200);
		else
			await ui.notification("lose-round", 1200);
		let northDrawEvent = state.eventLog && state.eventLog.length > 0
			? [...state.eventLog].reverse().find(event => event.type === "cards_drawn" && event.reason === "north" && event.round === state.round)
			: null;
		if (northDrawEvent) {
			if (northDrawEvent.playerId === state.self.playerId && northDrawEvent.cardInstanceIds && northDrawEvent.cardInstanceIds.length > 0)
				await this.animatePvPDraw(state, northDrawEvent.cardInstanceIds);
			await ui.notification("north", 1200);
		}
		let monstersKeepEvent = state.eventLog && state.eventLog.length > 0
			? [...state.eventLog].reverse().find(event => event.type === "card_kept" && event.reason === "monsters" && event.round === state.round)
			: null;
		if (monstersKeepEvent)
			await ui.notification("monsters", 1200);
		let skelligeReviveEvents = state.eventLog && state.eventLog.length > 0
			? state.eventLog.filter(event => event.type === "card_revived" && event.reason === "skellige" && event.round === state.round)
			: [];
		if (skelligeReviveEvents.length > 0) {
			if (skelligeReviveEvents.some(event => event.playerId === state.self.playerId))
				await ui.notification("skellige-me", 1200);
			if (state.opponent && skelligeReviveEvents.some(event => event.playerId === state.opponent.playerId))
				await ui.notification("skellige-op", 1200);
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
			await ui.notification("round-start", 1200);
			await ui.notification(state.currentTurnPlayerId === state.self.playerId ? "me-turn" : "op-turn", 1200);
			game.deferPvPTimer = false;
		} else if (state.status === "active" && state.gameState && state.gameState.phase === "active") {
			let fallbackRoundKey = state.matchId + ":round:" + state.round + ":turn:" + state.turnNumber;
			if (this.lastPvPRoundStartKey !== fallbackRoundKey) {
				this.lastPvPRoundStartKey = fallbackRoundKey;
				game.deferPvPTimer = true;
				game.lastPvPTurnNoticeKey = null;
				game.applyPvPState(state);
				await ui.notification("round-start", 1200);
				await ui.notification(state.currentTurnPlayerId === state.self.playerId ? "me-turn" : "op-turn", 1200);
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
