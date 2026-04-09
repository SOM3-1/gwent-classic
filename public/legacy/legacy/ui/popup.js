class Popup {
    constructor(yesName, yes, noName, no, header, description) {
        this.yes = yes ? yes : () => { };
        this.no = no ? no : () => { };
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
    static setCurrent(curr) { this.curr = curr; }
    static clearCurrent() { this.curr = null; }
    selectYes() {
        this.clear();
        this.yes();
        return true;
    }
    selectNo() {
        this.clear();
        this.no();
        return false;
    }
    clear() {
        ui.enablePlayer(false);
        this.elem.children[0].children[2].children[1].classList.remove("hide");
        this.elem.classList.add("hide");
        Popup.clearCurrent();
    }
}
