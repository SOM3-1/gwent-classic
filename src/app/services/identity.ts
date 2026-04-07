const PLAYER_ID_KEY = "gwent.player.id";
const PLAYER_NAME_KEY = "gwent.player.name";

const prefixes = [
  "Wolf",
  "Temeria",
  "Aedirn",
  "Skellige",
  "Nilfgaard",
  "Novigrad",
  "Velen",
  "Oxenfurt"
];

function randomSuffix() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function randomPrefix() {
  return prefixes[Math.floor(Math.random() * prefixes.length)];
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gwent-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function generateName() {
  return `${randomPrefix()}-${randomSuffix()}`;
}

export function getAnonymousProfile() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(PLAYER_ID_KEY, id);
  }

  let displayName = localStorage.getItem(PLAYER_NAME_KEY);
  if (!displayName) {
    displayName = generateName();
    localStorage.setItem(PLAYER_NAME_KEY, displayName);
  }

  return { id, displayName };
}
