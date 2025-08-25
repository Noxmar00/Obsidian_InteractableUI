// --- Funzioni di utilità predefinite ---
const notice = (msg) => new Notice(msg, 5000);
const log = (msg) => console.log(msg);

// --- Impostazioni dello Script ---
const API_KEY_OPTION = "Google Books API Key (Opzionale)";
const GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1/volumes";

module.exports = {
  entry: start,
  settings: {
    name: "Book Lookup (Standard)",
    author: "Versione Corretta Definitiva",
    options: {
      [API_KEY_OPTION]: {
        type: "text",
        defaultValue: "",
        placeholder: "Inserisci API Key per aumentare il limite di richieste",
      },
    },
  },
};

// --- Variabili globali ---
let QuickAdd;
let Settings;

// --- Funzione principale ---
async function start(params, settings) {
  QuickAdd = params;
  Settings = settings;

  try {
    const query = await QuickAdd.quickAddApi.inputPrompt("Cerca un libro per titolo o autore:");
    if (!query) {
      notice("Operazione annullata.");
      throw new Error("Operazione annullata"); // Interrompe l'esecuzione della macro
    }

    const results = await searchBooks(query);
    if (!results || results.length === 0) {
      notice(`Nessun libro trovato per "${query}".`);
      throw new Error("Nessun risultato trovato"); // Interrompe l'esecuzione della macro
    }

    const choice = await QuickAdd.quickAddApi.suggester(
      results.map(formatBookForSuggestion),
      results
    );
    if (!choice) {
      notice("Nessun libro selezionato.");
      throw new Error("Nessun libro selezionato"); // Interrompe l'esecuzione della macro
    }
    
    const bookData = choice; 
    
    if (!bookData) {
      notice("Dati del libro non trovati.");
      throw new Error("Dati libro non trovati"); // Interrompe l'esecuzione della macro
    }

    const variables = mapBookToVariables(bookData);
    
    // Assegna le variabili a QuickAdd. QuickAdd si occuperà del resto.
    QuickAdd.variables = { ...variables };

  } catch (error) {
    if (error.message.includes("annullata") || error.message.includes("trovato") || error.message.includes("selezionato")) {
        // Non mostrare il notice di errore per le azioni utente, solo per errori reali
        return;
    }
    log("Errore durante l'esecuzione dello script:", error);
    notice(`Si è verificato un errore: ${error.message}.`);
    throw error; // Assicura che la macro si fermi in caso di errore
  }
}

// --- Funzioni di formattazione e mappatura ---

function formatYamlArray(arr) {
  if (!arr || arr.length === 0) return "[]";
  return JSON.stringify(arr);
}

function cleanYamlString(str) {
    if (!str) return "";
    return str.replace(/"/g, "''").replace(/(\r\n|\n|\r)/gm, " ");
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:"*?<>|#%&{}[\]]/g, "").replace(/\s+/g, " ").trim();
}

function formatBookForSuggestion(book) {
  const info = book.volumeInfo;
  const title = info.title || "Senza Titolo";
  const authors = info.authors ? info.authors.join(', ') : 'Autore sconosciuto';
  const year = info.publishedDate ? new Date(info.publishedDate).getFullYear() : 'N/D';
  return `${title} - ${authors} (${year})`;
}

function getCoverUrl(imageLinks) {
    if (!imageLinks) return "";
    const url = imageLinks.thumbnail || imageLinks.smallThumbnail || "";
    return url.replace(/&edge=curl/g, "").replace(/&zoom=1/g, "&zoom=1");
}

function mapBookToVariables(book) {
  const info = book.volumeInfo;
  const title = info.title || "Senza Titolo";

  // Tutti i valori sono stringhe o numeri, perfettamente compatibili con QuickAdd.
  return {
    title: title.replace(/"/g, "''"),
    fileName: sanitizeFileName(title),
    authors: formatYamlArray(info.authors),
    authorsDisplay: info.authors ? info.authors.join(', ') : "N/D",
    publisher: cleanYamlString(info.publisher),
    publishedDate: info.publishedDate || "",
    publishedYear: String(info.publishedDate ? new Date(info.publishedDate).getFullYear() : ""),
    pageCount: String(info.pageCount || ""), 
    categories: formatYamlArray(info.categories),
    description: cleanYamlString(info.description),
    coverUrl: getCoverUrl(info.imageLinks),
    infoLink: info.infoLink || "",
  };
}

// --- Funzioni API ---

async function apiRequest(url) {
  try {
    const response = await request({ url, method: "GET" });
    return JSON.parse(response);
  } catch (err) {
    console.error(`Errore nella richiesta API: ${err}`);
    notice("Errore di connessione con l'API. Controlla la console.");
    return null;
  }
}

async function searchBooks(query) {
  const apiKey = Settings[API_KEY_OPTION];
  const apiKeyParam = apiKey ? `&key=${apiKey}` : "";
  const url = `${GOOGLE_BOOKS_API_URL}?q=${encodeURIComponent(query)}&maxResults=20&printType=books${apiKeyParam}&lang=it`;
  
  const data = await apiRequest(url);
  return data ? data.items : [];
}
