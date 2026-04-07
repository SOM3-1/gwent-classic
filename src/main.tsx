import { createRoot } from "react-dom/client";
import App from "./app/App";
import { getAnonymousProfile } from "./app/services/identity";
import { createMultiplayerService } from "./app/services/multiplayer";
import "../style.css";

window.__GWENT_SERVICES__ = {
  identity: {
    getProfile: getAnonymousProfile
  },
  multiplayer: createMultiplayerService()
};

createRoot(document.getElementById("root")!).render(<App />);
