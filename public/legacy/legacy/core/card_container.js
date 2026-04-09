class CardContainer {
    constructor(elem) {
        this.elem = elem;
        this.cards = [];
    }
    findCard(predicate) {
        for (let i = this.cards.length - 1; i >= 0; --i)
            if (predicate(this.cards[i]))
                return this.cards[i];
    }
    findCards(predicate) {
        return this.cards.filter(predicate);
    }
    findCardsRandom(predicate, n) {
        let valid = predicate ? this.cards.filter(predicate) : this.cards;
        if (valid.length === 0)
            return [];
        if (!n || n === 1)
            return [valid[randomInt(valid.length)]];
        let out = [];
        for (let i = Math.min(n, valid.length); i > 0; --i) {
            let index = randomInt(valid.length);
            out.push(valid.splice(index, 1)[0]);
        }
        return out;
    }
    getCards(predicate) {
        return this.cards.reduce((a, c, i) => (predicate(c, i) ? [i] : []).concat(a), []).map(i => this.removeCard(i));
    }
    getCard(predicate) {
        for (let i = this.cards.length - 1; i >= 0; --i)
            if (predicate(this.cards[i]))
                return this.removeCard(i);
    }
    getCardsRandom(predicate, n) {
        return this.findCardsRandom(predicate, n).map(c => this.removeCard(c));
    }
    addCard(card, index) {
        if (!card || !card.elem)
            return;
        this.cards.push(card);
        this.addCardElement(card, index ? index : 0);
        this.resize();
    }
    removeCard(card, index) {
        if (this.cards.length === 0)
            throw "Cannot draw from empty " + this.constructor.name;
        card = this.cards.splice(isNumber(card) ? card : this.cards.indexOf(card), 1)[0];
        if (!card || !card.elem) {
            this.resize();
            return card;
        }
        this.removeCardElement(card, index ? index : 0);
        this.resize();
        return card;
    }
    addCardSorted(card) {
        let i = this.getSortedIndex(card);
        this.cards.splice(i, 0, card);
        return i;
    }
    getSortedIndex(card) {
        for (var i = 0; i < this.cards.length; ++i)
            if (Card.compare(card, this.cards[i]) < 0)
                break;
        return i;
    }
    addCardRandom(card) {
        this.cards.push(card);
        let index = randomInt(this.cards.length);
        if (index !== this.cards.length - 1) {
            let t = this.cards[this.cards.length - 1];
            this.cards[this.cards.length - 1] = this.cards[index];
            this.cards[index] = t;
        }
        return index;
    }
    removeCardElement(card, index) {
        if (!card || !card.elem)
            return;
        if (this.elem)
            this.elem.removeChild(card.elem);
    }
    addCardElement(card, index) {
        if (!card || !card.elem)
            return;
        if (this.elem) {
            if (index === this.cards.length)
                this.elem.appendChild(card.elem);
            else
                this.elem.insertBefore(card.elem, this.elem.children[index]);
        }
    }
    resize() { }
    resizeCardContainer(overlap_count, gap, coef) {
        let n = this.elem.children.length;
        let param = (n < overlap_count) ? "" + gap + "vw" : defineCardRowMargin(n, coef);
        let children = this.elem.getElementsByClassName("card");
        for (let x of children)
            x.style.marginLeft = x.style.marginRight = param;
        function defineCardRowMargin(n, coef = 0) {
            return "calc((100% - (4.45vw * " + n + ")) / (2*" + n + ") - (" + coef + "vw * " + n + "))";
        }
    }
    setSelectable() {
        this.elem.classList.add("row-selectable");
    }
    clearSelectable() {
        this.elem.classList.remove("row-selectable");
        for (card in this.cards)
            card.elem.classList.add("noclick");
    }
    reset() {
        while (this.cards.length)
            this.removeCard(0);
        if (this.elem)
            while (this.elem.firstChild)
                this.elem.removeChild(this.elem.firstChild);
        this.cards = [];
    }
}
class Grave extends CardContainer {
    constructor(elem) {
        super(elem);
        elem.addEventListener("click", () => ui.viewCardsInContainer(this), false);
    }
    addCardElement(card, index) {
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
    addPlaceholder() {
        this.addCardElement(null, 0);
    }
    addCard(card) {
        this.setCardOffset(card, this.cards.length);
        super.addCard(card, this.cards.length);
    }
    removeCard(card) {
        let n = isNumber(card) ? card : this.cards.indexOf(card);
        return super.removeCard(card, n);
    }
    removeCardElement(card, index) {
        card.elem.style.left = "";
        super.removeCardElement(card, index);
        for (let i = index; i < this.cards.length; ++i) {
            this.setCardOffset(this.cards[i], i);
        }
    }
    setCardOffset(card, n) {
        card.elem.style.left = -0.03 * n + "vw";
    }
}
class Deck extends CardContainer {
    constructor(faction, elem) {
        super(elem);
        this.faction = faction;
        this.counter = document.createElement("div");
        this.counter.classList = "deck-counter center";
        this.counter.appendChild(document.createTextNode(this.cards.length));
        this.elem.appendChild(this.counter);
    }
    initializeFromID(card_id_list, player) {
        this.initialize(card_id_list.reduce((a, c) => a.concat(clone(c.count, card_dict[c.index])), []), player);
        function clone(n, elem) { for (var i = 0, a = []; i < n; ++i)
            a.push(elem); return a; }
    }
    initialize(card_data_list, player) {
        for (let i = 0; i < card_data_list.length; ++i) {
            let card = new Card(card_data_list[i], player);
            card.holder = player;
            this.addCardRandom(card);
            this.addCardElement();
        }
        this.resize();
    }
    addCard(card) {
        this.addCardRandom(card);
        this.addCardElement();
        this.resize();
    }
    async draw(hand) {
        if (hand === player_op.hand)
            hand.addCard(this.removeCard(0));
        else
            await board.toHand(this.cards[0], this);
    }
    swap(container, card) {
        container.addCard(this.removeCard(0));
        this.addCard(card);
    }
    addCardElement() {
        let elem = document.createElement("div");
        elem.classList.add("deck-card");
        elem.style.backgroundImage = iconURL("deck_back_" + this.faction, "jpg");
        this.setCardOffset(elem, this.cards.length - 1);
        this.elem.insertBefore(elem, this.counter);
    }
    removeCardElement() {
        this.elem.removeChild(this.elem.children[this.cards.length]).style.left = "";
    }
    setCardOffset(elem, n) {
        elem.style.left = -0.03 * n + "vw";
    }
    resize() {
        this.counter.innerHTML = this.cards.length;
        this.setCardOffset(this.counter, this.cards.length);
    }
    reset() {
        super.reset();
        this.elem.appendChild(this.counter);
    }
}
class HandAI extends CardContainer {
    constructor() {
        super(undefined);
        this.counter = document.getElementById("hand-count-op");
        this.hidden_elem = document.getElementById("hand-op");
    }
    resize() { this.counter.innerHTML = this.cards.length; }
}
class Hand extends CardContainer {
    constructor(elem) {
        super(elem);
        this.counter = document.getElementById("hand-count-me");
    }
    addCard(card) {
        let i = this.addCardSorted(card);
        this.addCardElement(card, i);
        this.resize();
    }
    resize() {
        this.counter.innerHTML = this.cards.length;
        this.resizeCardContainer(11, 0.075, .00225);
    }
}
class Row extends CardContainer {
    constructor(elem) {
        super(elem.getElementsByClassName("row-cards")[0]);
        this.elem_parent = elem;
        this.elem_special = elem.getElementsByClassName("row-special")[0];
        this.special = null;
        this.total = 0;
        this.effects = { weather: false, bond: {}, morale: 0, horn: 0, mardroeme: 0 };
        this.elem.addEventListener("click", () => ui.selectRow(this), true);
        this.elem_special.addEventListener("click", () => ui.selectRow(this), false, true);
    }
    async addCard(card) {
        if (card.isSpecial()) {
            this.special = card;
            this.elem_special.appendChild(card.elem);
        }
        else {
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
    removeCard(card) {
        if (this.special === null && this.cards.length === 0)
            return null;
        if ((card === -1 || card === this.special) && this.special === null)
            return null;
        card = isNumber(card) ? card === -1 ? this.special : this.cards[card] : card;
        if (card.isSpecial()) {
            this.special = null;
            this.elem_special.removeChild(card.elem);
        }
        else {
            super.removeCard(card);
            card.resetPower();
        }
        this.updateState(card, false);
        for (let x of card.removed)
            x(card);
        this.updateScore();
        return card;
    }
    removeCardElement(card, index) {
        super.removeCardElement(card, index);
        let x = card.elem;
        x.style.marginLeft = x.style.marginRight = "";
        x.classList.remove("noclick");
    }
    updateState(card, activate) {
        for (let x of card.abilities) {
            switch (x) {
                case "morale":
                case "horn":
                case "mardroeme":
                    this.effects[x] += activate ? 1 : -1;
                    break;
                case "bond":
                    if (!this.effects.bond[card.id()])
                        this.effects.bond[card.id()] = 0;
                    this.effects.bond[card.id()] += activate ? 1 : -1;
                    break;
            }
        }
    }
    addOverlay(overlay) {
        this.effects.weather = true;
        this.elem_parent.getElementsByClassName("row-weather")[0].classList.add(overlay);
        this.updateScore();
    }
    removeOverlay(overlay) {
        this.effects.weather = false;
        this.elem_parent.getElementsByClassName("row-weather")[0].classList.remove(overlay);
        this.updateScore();
    }
    resize() {
        this.resizeCardContainer(10, 0.075, .00325);
    }
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
    cardScore(card) {
        let total = this.calcCardScore(card);
        card.setPower(total);
        return total;
    }
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
        total += Math.max(0, this.effects.morale + (card.abilities.includes("morale") ? -1 : 0));
        if (this.effects.horn - (card.abilities.includes("horn") ? 1 : 0) > 0)
            total *= 2;
        return total;
    }
    async leaderHorn() {
        if (this.special !== null)
            return;
        let horn = new Card(card_dict[5], null);
        await this.addCard(horn);
        game.roundEnd.push(() => this.removeCard(horn));
    }
    async scorch() {
        if (this.total >= 10)
            await Promise.all(this.maxUnits().map(async (c) => {
                await c.animate("scorch", true, false);
                await board.toGrave(c, this);
            }));
    }
    clear() {
        if (this.special != null)
            board.toGrave(this.special, this);
        this.cards.filter(c => !c.noRemove).forEach(c => board.toGrave(c, this));
    }
    maxUnits() {
        let max = [];
        for (let i = 0; i < this.cards.length; ++i) {
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
    reset() {
        super.reset();
        while (this.special)
            this.removeCard(this.special);
        while (this.elem_special.firstChild)
            this.elem_special.removeChild(this.elem_speical.firstChild);
        this.total = 0;
        this.effects = { weather: false, bond: {}, morale: 0, horn: 0, mardroeme: 0 };
    }
}
class Weather extends CardContainer {
    constructor(elem) {
        super(document.getElementById("weather"));
        this.types = {
            rain: { name: "rain", count: 0, rows: [] },
            fog: { name: "fog", count: 0, rows: [] },
            frost: { name: "frost", count: 0, rows: [] }
        };
        let i = 0;
        for (let key of Object.keys(this.types))
            this.types[key].rows = [board.row[i], board.row[5 - i++]];
        this.elem.addEventListener("click", () => ui.selectRow(this), false);
    }
    async addCard(card) {
        super.addCard(card);
        card.elem.classList.add("noclick");
        if (card.name === "Clear Weather") {
            await sleep(500);
            this.clearWeather();
        }
        else {
            this.changeWeather(card, x => ++this.types[x].count === 1, (r, t) => r.addOverlay(t.name));
            for (let i = this.cards.length - 2; i >= 0; --i) {
                if (card.name === this.cards[i].name) {
                    await sleep(750);
                    await board.toGrave(card, this);
                    break;
                }
            }
        }
        await sleep(750);
    }
    removeCard(card) {
        card = super.removeCard(card);
        card.elem.classList.remove("noclick");
        this.changeWeather(card, x => --this.types[x].count === 0, (r, t) => r.removeOverlay(t.name));
        return card;
    }
    changeWeather(card, predicate, action) {
        for (let x of card.abilities) {
            if (x in this.types && predicate(x)) {
                for (let r of this.types[x].rows)
                    action(r, this.types[x]);
            }
        }
    }
    async clearWeather() {
        await Promise.all(this.cards.map((c, i) => this.cards[this.cards.length - i - 1]).map(c => board.toGrave(c, this)));
    }
    resize() {
        this.resizeCardContainer(4, 0.075, .045);
    }
    reset() {
        super.reset();
        Object.keys(this.types).map(t => this.types[t].count = 0);
    }
}
