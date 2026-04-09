class Player {
    constructor(id, name, deck) {
        this.id = id;
        this.tag = (id === 0) ? "me" : "op";
        this.controller = (id === 0) ? new Controller() : new ControllerAI(this);
        this.hand = (id === 0) ? new Hand(document.getElementById("hand-row")) : new HandAI();
        this.grave = new Grave(document.getElementById("grave-" + this.tag));
        this.deck = new Deck(deck.faction, document.getElementById("deck-" + this.tag));
        this.deck_data = deck;
        this.leader = new Card(deck.leader, this);
        this.elem_leader = document.getElementById("leader-" + this.tag);
        this.elem_leader.children[0].appendChild(this.leader.elem);
        this.reset();
        this.name = name;
        document.getElementById("name-" + this.tag).innerHTML = name;
        document.getElementById("deck-name-" + this.tag).innerHTML = factions[deck.faction].name;
        document.getElementById("stats-" + this.tag).getElementsByClassName("profile-img")[0].children[0].children[0];
        let x = document.querySelector("#stats-" + this.tag + " .profile-img > div > div");
        x.style.backgroundImage = iconURL("deck_shield_" + deck.faction);
    }
    setController(controller) {
        this.controller = controller;
    }
    reset() {
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
        document.getElementById("gem1-" + this.tag).classList.add("gem-on");
        document.getElementById("gem2-" + this.tag).classList.add("gem-on");
    }
    opponent() {
        return board.opponent(this);
    }
    updateTotal(n) {
        this.total += n;
        document.getElementById("score-total-" + this.tag).children[0].innerHTML = this.total;
        board.updateLeader();
    }
    setWinning(isWinning) {
        if (this.winning ^ isWinning)
            document.getElementById("score-total-" + this.tag).classList.toggle("score-leader");
        this.winning = isWinning;
    }
    setPassed(hasPassed) {
        if (this.passed ^ hasPassed)
            document.getElementById("passed-" + this.tag).classList.toggle("passed");
        this.passed = hasPassed;
    }
    async startTurn() {
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
    passRound() {
        this.setPassed(true);
        this.endTurn();
    }
    async playScorch(card) {
        await this.playCardAction(card, async () => await ability_dict["scorch"].activated(card));
    }
    async playCardToRow(card, row) {
        await this.playCardAction(card, async () => await board.moveTo(card, row, this.hand));
    }
    async playCard(card) {
        await this.playCardAction(card, async () => await card.autoplay(this.hand));
    }
    async playCardAction(card, action) {
        ui.showPreviewVisuals(card);
        await sleep(1000);
        ui.hidePreview(card);
        await action();
        this.endTurn();
    }
    endTurn() {
        if (game.mode === "pvp")
            return;
        if (!this.passed && !this.canPlay())
            this.setPassed(true);
        if (this === player_me) {
            document.getElementById("pass-button").classList.add("noclick");
        }
        document.getElementById("stats-" + this.tag).classList.remove("current-turn");
        this.elem_leader.children[1].classList.add("hide");
        game.endTurn();
    }
    endRound(win) {
        if (!win) {
            if (this.health < 1)
                return;
            document.getElementById("gem" + this.health + "-" + this.tag).classList.remove("gem-on");
            this.health--;
        }
        this.setPassed(false);
        this.setWinning(false);
    }
    canPlay() {
        return this.hand.cards.length > 0 || this.leaderAvailable;
    }
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
    disableLeader() {
        this.leaderAvailable = false;
        let elem = this.elem_leader.cloneNode(true);
        this.elem_leader.parentNode.replaceChild(elem, this.elem_leader);
        this.elem_leader = elem;
        this.elem_leader.children[0].classList.add("fade");
        this.elem_leader.children[1].classList.add("hide");
        this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader), false);
    }
    enableLeader() {
        this.leaderAvailable = this.leader.activated.length > 0;
        let elem = this.elem_leader.cloneNode(true);
        this.elem_leader.parentNode.replaceChild(elem, this.elem_leader);
        this.elem_leader = elem;
        this.elem_leader.children[0].classList.remove("fade");
        this.elem_leader.children[1].classList.remove("hide");
        if (this.id === 0 && this.leader.activated.length > 0) {
            this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader, async () => await this.activateLeader()), false);
        }
        else {
            this.elem_leader.addEventListener("click", async () => await ui.viewCard(this.leader), false);
        }
    }
}
