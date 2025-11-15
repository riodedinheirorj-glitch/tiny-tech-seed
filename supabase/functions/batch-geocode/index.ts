import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const LOCATIONIQ_API_URL = "https://us1.locationiq.com/v1/search.php";
const RATE_LIMIT_DELAY = 500; // 0.5 seconds to respect 2 requests per second limit
const DEFAULT_COUNTRY_CODE = "Brazil"; // For LocationIQ, use full country name
// Helpers
function sleep(ms: number) {
  return new Promise((r)=>setTimeout(r, ms));
}
function normalizeText(s: string) {
  if (!s) return "";
  const withNoAccents = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return withNoAccents.toLowerCase().replace(/(av|av\.|avenida)\b/g, "avenida").replace(/\b(r|r\.)\b/g, "rua").replace(/(rod|rod\.|rodovia)\b/g, "rodovia").replace(/\b(proximo a|proximo|próximo a|perto de|em frente ao|ao lado de)\b/g, "").replace(/[^\w\s\-\,]/g, "").replace(/\s+/g, " ").trim();
}
function buildLocationIQQueryParam(row: any) {
  const parts = [];
  if (row.rawAddress) parts.push(row.rawAddress);
  if (row.bairro) parts.push(row.bairro);
  if (row.cidade) parts.push(row.cidade);
  if (row.estado) parts.push(row.estado);
  return parts.join(", ");
}
function addressMatchesExpected(locationiqAddress: any, expected: any) {
  if (!locationiqAddress) return false;
  const gotCity = locationiqAddress.city || locationiqAddress.town || locationiqAddress.village || "";
  const gotCounty = locationiqAddress.county || "";
  const gotSuburb = locationiqAddress.suburb || locationiqAddress.neighbourhood || "";
  const gotState = locationiqAddress.state || "";
  const expCity = normalizeText(expected.cidade || "");
  const expBairro = normalizeText(expected.bairro || "");
  const expState = normalizeText(expected.estado || "");
  const gCity = normalizeText(gotCity || gotCounty);
  const gBairro = normalizeText(gotSuburb || "");
  const gState = normalizeText(gotState || "");
  const cityMatches = expCity && gCity && (gCity.includes(expCity) || expCity.includes(gCity));
  const stateMatches = !expState || gState && (gState.includes(expState) || expState.includes(expState));
  let bairroMatches = false;
  if (!expBairro) bairroMatches = true;
  else if (gBairro) {
    bairroMatches = gBairro.includes(expBairro) || expBairro.includes(gBairro);
  } else {
    bairroMatches = false;
  }
  return cityMatches && stateMatches && bairroMatches;
}
async function locationiqSearch(query: string) {
  const LOCATIONIQ_API_KEY = Deno.env.get('LOCATIONIQ_API_KEY');
  if (!LOCATIONIQ_API_KEY) {
    throw new Error('LOCATIONIQ_API_KEY not configured in environment variables.');
  }
  const params = new URLSearchParams({
    key: LOCATIONIQ_API_KEY,
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "1",
    country: DEFAULT_COUNTRY_CODE
  });
  const url = `${LOCATIONIQ_API_URL}?${params.toString()}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "RotaSmartApp/1.0 (contact@rotasmart.com)"
    }
  });
  if (!resp.ok) {
    console.error("LocationIQ API error:", resp.status, resp.statusText, url);
    throw new Error("LocationIQ returned " + resp.status);
  }
  const json = await resp.json();
  return json && json.length ? json[0] : null;
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204
    }); // Retorna 204 No Content para preflight
  }
  try {
    const { addresses } = await req.json();
    if (!Array.isArray(addresses)) {
      throw new Error('Input must be an array of addresses.');
    }
    const results = [];
    for(let i = 0; i < addresses.length; i++){
      const row = addresses[i];
      let searchUsed = "";
      let found = null;
      let status = "pending";
      let note = "";
      const fullQuery = buildLocationIQQueryParam(row);
      // Try LocationIQ search
      try {
        searchUsed = "locationiq:" + fullQuery;
        found = await locationiqSearch(fullQuery);
        await sleep(RATE_LIMIT_DELAY);
      } catch (e) {
        note = "erro-na-requisicao-locationiq";
        console.warn(e);
      }
      // If found, validate city/bairro/state vs planilha
      if (found) {
        const addr = found.address || {};
        const matches = addressMatchesExpected(addr, {
          bairro: row.bairro,
          cidade: row.cidade,
          estado: row.estado
        });
        if (matches) {
          status = "valid";
          note = "matches-planilha";
        } else {
          // If initial match fails, try a more specific query if possible
          try {
            const specificQueryParts = [];
            if (row.rawAddress) specificQueryParts.push(row.rawAddress);
            if (row.cidade) specificQueryParts.push(row.cidade);
            if (row.estado) specificQueryParts.push(row.estado);
            const specificQuery = specificQueryParts.join(", ");
            if (specificQuery !== fullQuery) {
              searchUsed = "locationiq-specific:" + specificQuery;
              const retr = await locationiqSearch(specificQuery);
              await sleep(RATE_LIMIT_DELAY);
              if (retr && addressMatchesExpected(retr.address || {}, {
                bairro: row.bairro,
                cidade: row.cidade,
                estado: row.estado
              })) {
                found = retr;
                status = "corrected";
                note = "specific-query-success";
              } else {
                status = "mismatch";
                note = "resultado-nao-coincide-com-cidade-bairro";
              }
            } else {
              status = "mismatch";
              note = "resultado-nao-coincide-com-cidade-bairro";
            }
          } catch (e) {
            note = (note ? note + ";" : "") + "erro-na-requisicao-specific";
            status = "mismatch";
            console.warn(e);
          }
        }
      } else {
        status = "pending";
        note = note || "nao-encontrado";
      }
      results.push({
        ...row,
        originalAddress: row.rawAddress || "",
        correctedAddress: status === 'valid' || status === 'corrected' ? found?.display_name || row.rawAddress : row.rawAddress,
        latitude: found ? found.lat : undefined,
        longitude: found ? found.lon : undefined,
        status,
        searchUsed,
        note,
        display_name: found ? found.display_name : undefined
      });
    }
    return new Response(JSON.stringify(results), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in batch-geocode function:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});