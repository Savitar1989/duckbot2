const axios = require("axios");
const { API_TOKEN } = require("../config");

const api = axios.create({
  baseURL: "https://api.duckmyduck.com",
  timeout: 10000,
  headers: {
    Authorization: API_TOKEN,
    "Content-Type": "application/json"
  }
});

async function fetchMarket(quality, offset = 0) {
  try {
    const res = await api.post("/market", { quality, offset });
    const data = res.data?.response;
    if (!data) return [];
    if (Array.isArray(data.ducks)) return data.ducks;
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    console.log("❌ fetchMarket error:", e.response?.status, quality, offset);
    return [];
  }
}

/**
 * Breeding link validáció.
 * 
 * A link formátuma: https://t.me/duckmyduck_bot?start=bXXXXXX
 * ahol XXXXXX a breedingSecret (hex string), NEM a duck id.
 * 
 * Az API-ban a duck.state mezők:
 *   "FEED"      = nem párzik, elérhető
 *   "BREEDING"  = már párzik
 *   "MARKET"    = marketen van
 *   stb.
 * 
 * A breedingLink mező a duck objectben tartalmazza a teljes linket ha aktív.
 */
async function validateBreedingLink(link) {
  // Format check - a secret hex string, nem csak szám
  const match = link.match(/start=b([a-zA-Z0-9]+)/);
  if (!match) {
    return { valid: false, reason: "invalid_format" };
  }

  const breedingSecret = match[1];

  // A market API-n keresztül próbáljuk megtalálni a kacsát breeding secret alapján.
  // Mivel nincs közvetlen /duck/:secret endpoint, a linket magát elfogadjuk
  // ha a formátum helyes, és csak a nyilvánvaló hibákat szűrjük ki.
  // Ha az API-nak van /breeding/:secret endpoint, azt használjuk.

  try {
    // Próbáljuk a breeding info endpointot
    const res = await api.get(`/breeding/${breedingSecret}`);
    const data = res.data?.response || res.data;

    if (!data) return { valid: false, reason: "not_found" };

    // Ha van state mező, ellenőrizzük
    const state = data.state || data.duck?.state;
    if (state === "BREEDING") {
      return { valid: false, reason: "already_breeding", duck: data };
    }

    return { valid: true, breedingSecret, duck: data };

  } catch (e) {
    const status = e.response?.status;

    if (status === 404) {
      // 404 = nincs ilyen breeding link (lejárt, nem létező)
      return { valid: false, reason: "not_found" };
    }

    // Más hiba (pl. 500, timeout) → elfogadjuk a linket de jelezzük
    console.log("⚠️ validateBreedingLink error:", status, breedingSecret);
    return { valid: true, breedingSecret, unverified: true };
  }
}

module.exports = { fetchMarket, validateBreedingLink };
