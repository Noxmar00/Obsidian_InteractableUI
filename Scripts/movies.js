// Variabili per l'API OMDb
const OMDb_API_KEY_OPTION = "OMDb API Key";
const OMDb_API_URL = "https://www.omdbapi.com/";

module.exports = {
  entry: start,
  settings: {
    name: "OMDb Lookup per Film e Serie TV",
    author: "Il Tuo Nome",
    options: {
      [OMDb_API_KEY_OPTION]: {
        type: "text",
        defaultValue: "",
        placeholder: "Inserisci la tua API Key di OMDb",
      },
    },
  },
};

let QuickAdd;
let Settings;
let OMDb_API_KEY; 

const notice = (msg, duration = 5000) => new Notice(msg, duration);
const log = (msg) => console.log(msg);

async function start(params, settings) {
  QuickAdd = params;
  Settings = settings;

  OMDb_API_KEY = Settings[OMDb_API_KEY_OPTION];
  if (!OMDb_API_KEY || OMDb_API_KEY.trim() === "") {
    notice("API Key di OMDb non configurata nelle impostazioni dello script!");
    return;
  }

  try {
    const query = await QuickAdd.quickAddApi.inputPrompt(
      "Titolo Film/Serie o ID IMDb (es. tt0120338):"
    );
    if (!query) {
      notice("Operazione annullata.");
      return;
    }

    let selectedItemData;

    if (query.toLowerCase().startsWith("tt") && /^\d{7,}/.test(query.substring(2))) {
        selectedItemData = await getItemDetailsById(query);
        if (!selectedItemData || selectedItemData.Response === "False") {
            notice(`Nessun risultato trovato per ID: ${query}. Errore: ${selectedItemData ? selectedItemData.Error : 'Sconosciuto'}`);
            return;
        }
    } else {
        const searchResults = await searchOMDb(query);
        if (!searchResults || searchResults.Response === "False" || !searchResults.Search || searchResults.Search.length === 0) {
            notice(`Nessun risultato trovato per "${query}". ${searchResults ? searchResults.Error : ''}`);
            return;
        }

        if (searchResults.Search.length === 1) {
            selectedItemData = await getItemDetailsById(searchResults.Search[0].imdbID);
        } else {
            const choicesMap = {};
            searchResults.Search.forEach(item => {
                const displayKey = `${item.Title} (${item.Year}) - ${item.Type.toUpperCase()}`;
                choicesMap[displayKey] = item.imdbID;
            });
            const displayChoices = Object.keys(choicesMap);
            
            const choiceKey = await QuickAdd.quickAddApi.suggester(displayChoices, displayChoices);

            if (!choiceKey) {
                notice("Nessuna selezione effettuata.");
                return;
            }
            const selectedImdbID = choicesMap[choiceKey];
            selectedItemData = await getItemDetailsById(selectedImdbID);
        }
    }

    if (!selectedItemData || selectedItemData.Response === "False") {
      notice(`Impossibile recuperare i dettagli. ${selectedItemData ? selectedItemData.Error : ''}`);
      return;
    }

    const variables = await mapApiDataToVariables(selectedItemData); 
    
    QuickAdd.variables = { 
        ...QuickAdd.variables,
        ...variables 
    };

    notice(`Dati per "${selectedItemData.Title}" pronti!`);

  } catch (error) {
    log("Errore durante l'esecuzione dello script OMDb:", error);
    if (error.message.includes("Failed to fetch")) {
        notice("Errore di rete o API OMDb non raggiungibile. Controlla la connessione e la API key.");
    } else {
        notice(`Si è verificato un errore: ${error.message}.`);
    }
  }
}

async function searchOMDb(searchTerm) {
  const url = `${OMDb_API_URL}?apikey=${OMDb_API_KEY}&s=${encodeURIComponent(searchTerm.trim())}`;
  log(`Searching OMDb: ${url}`);
  try {
    const response = await request({ url, method: "GET" }); 
    return JSON.parse(response);
  } catch (e) {
    log(`Errore nella ricerca OMDb: ${e}`);
    return { Response: "False", Error: e.message };
  }
}

async function getItemDetailsById(imdbId) {
  const url = `${OMDb_API_URL}?apikey=${OMDb_API_KEY}&i=${imdbId.trim()}&plot=full`;
  log(`Fetching details from OMDb: ${url}`);
  try {
    const response = await request({ url, method: "GET" }); 
    return JSON.parse(response);
  } catch (e) {
    log(`Errore nel recupero dettagli OMDb: ${e}`);
    return { Response: "False", Error: e.message };
  }
}

async function getItemDetailsBySeason(imdbId, seasonNumber) {
  const url = `${OMDb_API_URL}?apikey=${OMDb_API_KEY}&i=${imdbId.trim()}&season=${seasonNumber}`;
  log(`Fetching season ${seasonNumber} details for ${imdbId} from OMDb: ${url}`);
  try {
    const response = await request({ url, method: "GET" }); 
    return JSON.parse(response);
  } catch (e) {
    log(`Errore nel recupero dettagli stagione ${seasonNumber} OMDb: ${e}`);
    return { Response: "False", Error: e.message };
  }
}

function sanitizeFileName(name) {
  if (!name) return "Nuovo Elemento Media";
  return name
    .replace(/:/g, " ") 
    .replace(/[\\/"*?<>|#%&{}[\]]/g, "_") 
    .replace(/\s+/g, " ") 
    .trim();
}

function formatYamlArray(str) {
    if (!str || typeof str !== 'string' || str === "N/A" || str.trim() === "") return "[]";
    const arr = str.split(',').map(item => item.trim()); 
    return JSON.stringify(arr); 
}

function formatForBodyDisplay(str) {
    if (!str || typeof str !== 'string' || str === "N/A" || str.trim() === "") return "N/A";
    return str.split(',').map(item => item.trim()).join(', ');
}

async function mapApiDataToVariables(data) { 
  const itemType = data.Type === "series" ? "serie_tv" : (data.Type === "movie" ? "film" : "altro");
  
  const plotFrontmatter = (data.Plot && data.Plot !== "N/A") 
    ? data.Plot.replace(/[\r\n]/g, ' ').replace(/"/g, '\\"') 
    : "Nessuna trama disponibile.";
  
  const plotBody = (data.Plot && data.Plot !== "N/A") 
    ? data.Plot 
    : "Nessuna trama disponibile.";
  
  let seasonsMarkdown = "N/A"; 
  let totalSeasonsValue = "N/A"; 

  if (itemType === "serie_tv" && data.totalSeasons && data.totalSeasons !== "N/A") {
      const parsedTotalSeasons = parseInt(data.totalSeasons, 10);
      if (!isNaN(parsedTotalSeasons) && parsedTotalSeasons > 0) {
          totalSeasonsValue = parsedTotalSeasons; 
          seasonsMarkdown = `\n## Stagioni (${totalSeasonsValue})\n`; 
          
          for (let i = 1; i <= totalSeasonsValue; i++) {
              const seasonData = await getItemDetailsBySeason(data.imdbID, i); 
              
              if (seasonData && seasonData.Response === "True" && seasonData.Episodes) {
                  seasonsMarkdown += `### Stagione ${seasonData.Season || i} (${seasonData.Episodes.length} episodi)\n`;
                  seasonData.Episodes.sort((a, b) => parseInt(a.Episode) - parseInt(b.Episode));
                  
                  seasonData.Episodes.forEach(episode => {
                      const episodeTitle = (episode.Title && episode.Title !== "N/A") ? ` - ${episode.Title}` : "";
                      seasonsMarkdown += `- [ ] Episodio ${episode.Episode}${episodeTitle}\n`;
                  });
              } else {
                  seasonsMarkdown += `### Stagione ${i} (Dati episodi non disponibili)\n`;
                  seasonsMarkdown += `- [ ] Episodio 1\n`; 
              }
              seasonsMarkdown += `---\n`; 
          }
      } else {
        totalSeasonsValue = "N/A";
        seasonsMarkdown = "N/A";
      }
  } else {
      // Per i film, seasonsMarkdown e totalSeasonsValue rimangono "N/A"
  }
  
  const titleForFile = data.Title && data.Title !== "N/A" ? data.Title : "Media Sconosciuto";

  const variables = {
    title: titleForFile, 
    year: data.Year && data.Year !== "N/A" ? data.Year.match(/\d{4}/)?.[0] || "" : "",
    released: data.Released === "N/A" ? "" : data.Released,
    runtime: data.Runtime === "N/A" ? "" : data.Runtime,
    
    genres: formatYamlArray(data.Genre),
    directorFrontmatter: formatYamlArray(data.Director),
    writerFrontmatter: formatYamlArray(data.Writer),
    actorsFrontmatter: formatYamlArray(data.Actors),

    genresDisplay: formatForBodyDisplay(data.Genre),
    directorDisplay: formatForBodyDisplay(data.Director),
    writerDisplay: formatForBodyDisplay(data.Writer),
    actorsDisplay: formatForBodyDisplay(data.Actors),

    plotFrontmatter: plotFrontmatter, 
    plotBody: plotBody,             
    language: data.Language === "N/A" ? "" : data.Language,
    country: data.Country === "N/A" ? "" : data.Country,
    awards: data.Awards === "N/A" ? "" : data.Awards,
    posterUrl: (data.Poster && data.Poster !== "N/A") ? data.Poster : "",
    imdbRating: data.imdbRating === "N/A" ? "" : data.imdbRating,
    imdbID: data.imdbID || "",
    typeTag: itemType,
    totalSeasons: totalSeasonsValue, 
    seasonsSection: seasonsMarkdown, 
    fileName: sanitizeFileName(titleForFile),
    
    // Variabili aggiunte/modificate per il frontmatter del template
    watching: false, // Default a false
    dropped: false,  // Default a false
    watchlist: false // Default a false
    // hiatus è gestito direttamente nel template come `hiatus: false`
  };

  return variables;
}
