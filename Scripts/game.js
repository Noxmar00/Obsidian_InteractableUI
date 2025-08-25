const notice = (msg) => new Notice(msg, 5000);
const log = (msg) => console.log(msg);

const CLIENT_ID_OPTION = "IGDB Client ID";
const CLIENT_SECRET_OPTION = "IGDB Client Secret";
const IGDB_API_URL = "https://api.igdb.com/v4";

module.exports = {
  entry: start,
  settings: {
    name: "IGDB Lookup YAML Correct",
    author: "Your Name",
    options: {
      [CLIENT_ID_OPTION]: { type: "text", defaultValue: "", placeholder: "Inserisci IGDB Client ID" },
      [CLIENT_SECRET_OPTION]: { type: "text", defaultValue: "", placeholder: "Inserisci IGDB Client Secret" },
    },
  },
};

let QuickAdd;
let Settings;
let accessToken;

async function start(params, settings) {
  QuickAdd = params;
  Settings = settings;

  try {
    accessToken = await getAccessToken();
    if (!accessToken) {
      notice("Errore di autenticazione IGDB. Controlla Client ID e Secret.");
      throw new Error("Authentication failed with Twitch/IGDB.");
    }

    const query = await QuickAdd.quickAddApi.inputPrompt("Inserisci titolo gioco o ID IGDB:");
    if (!query) return notice("Operazione annullata.");

    let gameData;
    if (/^\d+$/.test(query)) {
      gameData = await getGameById(query);
    } else {
      const results = await searchGames(query);
      if (!results.length) return notice(`Nessun gioco trovato per "${query}".`);
      
      const choice = await QuickAdd.quickAddApi.suggester(results.map(formatGameForSuggestion), results);
      if (!choice) return notice("Nessun gioco selezionato.");
      
      gameData = await getGameById(choice.id);
    }

    if (!gameData) return notice("Dati del gioco non trovati.");

    const variables = await mapGameToVariables(gameData);
    QuickAdd.variables = { ...variables };

    notice(`Nota per "${gameData.name}" creata con successo!`);
  } catch (error) {
    log("Errore durante l'esecuzione dello script:", error);
    notice(`Si è verificato un errore: ${error.message}.`);
  }
}

// --- FUNZIONI DI FORMATTAZIONE E API ---

function formatYamlArray(arr) {
    if (!arr || arr.length === 0) return "[]"; 
    return JSON.stringify(arr.map(item => item.replace(/"/g, '\\"'))); // Serializza in JSON, gestendo le virgolette interne
}

async function mapGameToVariables(game) {
  const rawPlot = game.storyline || game.summary || "Nessuna descrizione disponibile.";
  const cleanPlot = rawPlot.replace(/[\r\n]/g, ' ').replace(/"/g, "''"); // Pulisce la trama

  return {
    title: game.name,
    genres: formatYamlArray(game.genres?.map(g => g.name)),
    platforms: formatYamlArray(game.platforms?.map(p => p.name)),
    year: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : "",
    released: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().split("T")[0] : "",
    developers: formatYamlArray(mapCompanies(game, "developer")),
    publishers: formatYamlArray(mapCompanies(game, "publisher")),
    rating: game.rating ? Math.round(game.rating) : 0,
    metacritic: game.aggregated_rating ? Math.round(game.aggregated_rating) : 0,
    url: game.url || "",
    coverUrl: game.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : "",
    plot: cleanPlot,
    fileName: sanitizeFileName(game.name),
  };
}

function mapCompanies(game, type) {
    if (!game.involved_companies) return [];
    return game.involved_companies
        .filter(c => c[type] && c.company?.name)
        .map(c => c.company.name);
}

function formatGameForSuggestion(game) {
  const year = game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : "N/D";
  return `${game.name} (${year})`;
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:"*?<>|#%&{}[\]]/g, "").replace(/\s+/g, " ").trim();
}

async function getAccessToken() {
    const clientId = Settings[CLIENT_ID_OPTION];
    const clientSecret = Settings[CLIENT_SECRET_OPTION];
    if (!clientId || !clientSecret) return null;
    const response = await request({
        url: "https://id.twitch.tv/oauth2/token",
        method: "POST",
        body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    });
    return JSON.parse(response).access_token || null;
}

async function igdbRequest(endpoint, body) {
  return JSON.parse(await request({
    url: `${IGDB_API_URL}/${endpoint}`,
    method: "POST", body,
    headers: { "Client-ID": Settings[CLIENT_ID_OPTION], "Authorization": `Bearer ${accessToken}` },
  }));
}

async function searchGames(query) {
  const body = `search "${query}"; fields id,name,first_release_date; limit 20;`;
  return await igdbRequest("games", body);
}

async function getGameById(id) {
  const body = `
    fields name,summary,storyline,cover.image_id,first_release_date,
    genres.name,platforms.name,involved_companies.company.name,
    involved_companies.developer,involved_companies.publisher,
    rating,aggregated_rating,url;
    where id = ${id};
  `;
  const [game] = await igdbRequest("games", body);
  return game || null;
}
