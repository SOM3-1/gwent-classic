class Carousel {
    constructor(container, count, action, predicate, bSort, bExit = false, title) {
        if (count <= 0 || !container || !action || container.cards.length === 0)
            return;
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
    start() {
        if (!this.elem)
            return;
        this.indices = this.container.cards.reduce((a, c, i) => (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
        if (this.indices.length <= 0)
            return this.exit();
        if (this.bSort)
            this.indices.sort((a, b) => Card.compare(this.container.cards[a], this.container.cards[b]));
        this.index = 0;
        let selectedCard = this.container.cards[this.indices[this.index]];
        this.currentInstanceId = selectedCard && selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : null;
        this.update();
        Carousel.setCurrent(this);
        if (this.title) {
            this.title_elem.innerHTML = this.title;
            this.title_elem.classList.remove("hide");
        }
        else {
            this.title_elem.classList.add("hide");
        }
        this.elem.classList.remove("hide");
        ui.enablePlayer(true);
    }
    shift(event, n) {
        (event || window.event).stopPropagation();
        this.index = Math.max(0, Math.min(this.indices.length - 1, this.index + n));
        let selectedCard = this.container.cards[this.indices[this.index]];
        this.currentInstanceId = selectedCard && selectedCard.pvpInstanceId ? selectedCard.pvpInstanceId : null;
        this.update();
    }
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
            this.indices = this.container.cards.reduce((a, c, i) => (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
            if (this.bSort)
                this.indices.sort((a, b) => Card.compare(this.container.cards[a], this.container.cards[b]));
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
    cancel() {
        if (this.bExit) {
            this.cancelled = true;
            this.exit();
        }
        ui.enablePlayer(true);
    }
    isLastSelection() {
        return this.count <= 0 || this.indices.length === 0;
    }
    update() {
        let currentInstanceId = this.currentInstanceId;
        this.indices = this.container.cards.reduce((a, c, i) => (!this.predicate || this.predicate(c)) ? a.concat([i]) : a, []);
        if (this.bSort)
            this.indices.sort((a, b) => Card.compare(this.container.cards[a], this.container.cards[b]));
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
            this.index = this.indices.length - 1;
        if (this.index < 0)
            this.index = 0;
        for (let i = 0; i < this.previews.length; i++) {
            let curr = this.index - 2 + i;
            if (curr >= 0 && curr < this.indices.length) {
                let card = this.container.cards[this.indices[curr]];
                this.previews[i].style.backgroundImage = largeURL(card.faction + "_" + card.filename);
                this.previews[i].classList.remove("hide");
                this.previews[i].classList.remove("noclick");
            }
            else {
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
    exit() {
        for (let x of this.previews)
            x.style.backgroundImage = "";
        this.elem.classList.add("hide");
        Carousel.clearCurrent();
        ui.quitCarousel();
    }
    static setCurrent(curr) {
        this.curr = curr;
    }
    static clearCurrent() {
        this.curr = null;
    }
}
