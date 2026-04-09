class Board {
    constructor() {
        this.op_score = 0;
        this.me_score = 0;
        this.row = [];
        for (let x = 0; x < 6; ++x) {
            let elem = document.getElementById((x < 3) ? "field-op" : "field-me").children[x % 3];
            this.row[x] = new Row(elem);
        }
    }
    opponent(player) {
        return player === player_me ? player_op : player_me;
    }
    async toDeck(card, source) {
        await this.moveTo(card, "deck", source);
    }
    async toGrave(card, source) {
        await this.moveTo(card, "grave", source);
    }
    async toHand(card, source) {
        await this.moveTo(card, "hand", source);
    }
    async toWeather(card, source) {
        await this.moveTo(card, weather, source);
    }
    async toRow(card, source) {
        let row = (card.row === "agile") ? "close" : card.row ? card.row : "close";
        await this.moveTo(card, row, source);
    }
    async moveTo(card, dest, source) {
        if (isString(dest))
            dest = this.getRow(card, dest);
        await translateTo(card, source ? source : null, dest);
        await dest.addCard(source ? source.removeCard(card) : card);
    }
    async addCardToRow(card, row_name, player, source) {
        let row = this.getRow(card, row_name, player);
        await translateTo(card, source, row);
        await row.addCard(card);
    }
    getRow(card, row_name, player) {
        player = player ? player : card ? card.holder : player_me;
        if (!card && ["close", "ranged", "siege"].includes(row_name))
            return null;
        let isMe = player === player_me;
        let isSpy = card && card.abilities ? card.abilities.includes("spy") : false;
        switch (row_name) {
            case "weather":
                return weather;
                break;
            case "close": return this.row[isMe ^ isSpy ? 3 : 2];
            case "ranged": return this.row[isMe ^ isSpy ? 4 : 1];
            case "siege": return this.row[isMe ^ isSpy ? 5 : 0];
            case "grave": return player.grave;
            case "deck": return player.deck;
            case "hand": return player.hand;
            default: console.error((card ? card.name : "null") + " sent to incorrect row \"" + row_name + "\" by " + (card && card.holder ? card.holder.name : "unknown"));
        }
    }
    updateLeader() {
        let dif = player_me.total - player_op.total;
        player_me.setWinning(dif > 0);
        player_op.setWinning(dif < 0);
    }
}
