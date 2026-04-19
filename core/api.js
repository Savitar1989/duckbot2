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

async function fetchRecentSales() {
  try {
    const res = await api.get("/market/sales");
    return res.data?.response || [];
  } catch (e) {
    console.log("❌ fetchRecentSales error");
    return [];
  }
}

async function validateBreedingLink(link) {
  const match = link.match(/start=b([a-zA-Z0-9]+)/);
  if (!match) return { valid: false, reason: "invalid_format" };

  const breedingSecret = match[1];

  try {
    const res = await api.get(`/breeding/${breedingSecret}`);
    const data = res.data?.response || res.data;

    if (!data) return { valid: false, reason: "not_found" };

    const state = data.state || data.duck?.state;
    if (state === "BREEDING") {
      return { valid: false, reason: "already_breeding", duck: data };
    }

    return { valid: true, breedingSecret, duck: data };
  } catch (e) {
    const status = e.response?.status;
    if (status === 404) return { valid: false, reason: "not_found" };
    return { valid: true, breedingSecret, unverified: true };
  }
}

module.exports = { fetchMarket, fetchRecentSales, validateBreedingLink };