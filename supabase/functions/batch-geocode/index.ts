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

// NEW HELPER FUNCTION
function parseCoordinate(coordString: string | undefined | null): number | undefined {
  if (!coordString) return undefined;
  const cleanedString = String(coordString).replace(',', '.').trim(); // Replace comma with dot for float parsing
  const parsed = parseFloat(cleanedString);
  return isNaN(parsed) ? undefined : parsed;
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

      let finalLat: string | undefined = undefined;
      let finalLon: string | undefined = undefined;
      let finalDisplayName: string | undefined = undefined;

      // 1. Prioritize original lat/lng from spreadsheet if available and valid
      const originalLatNum = parseCoordinate(row.latitude);
      const originalLonNum = parseCoordinate(row.longitude);

      if (originalLatNum !== undefined && originalLonNum !== undefined) {
        finalLat = originalLatNum.toFixed(6); // Store as string with fixed precision
        finalLon = originalLonNum.toFixed(6); // Store as string with fixed precision
        finalDisplayName = row.rawAddress; // Use raw address as display name if using original coords
        status = "valid"; // Assume valid if coordinates are provided
        note = "coordenadas-da-planilha";
      }

      const fullQuery = buildLocationIQQueryParam(row);
      
      // 2. Try LocationIQ search
      try {
        searchUsed = "locationiq:" + fullQuery;
        const locationIqResult = await locationiqSearch(fullQuery);
        await sleep(RATE_LIMIT_DELAY);

        if (locationIqResult) {
          const addr = locationIqResult.address || {};
          const matches = addressMatchesExpected(addr, {
            bairro: row.bairro,
            cidade: row.cidade,
            estado: row.estado
          });

          if (matches) {
            // 2a. LocationIQ found a good match, override with its data
            found = locationIqResult;
            finalLat = found.lat;
            finalLon = found.lon;
            finalDisplayName = found.display_name;
            status = "valid";
            note = "matches-planilha-locationiq";
          } else {
            // 2b. LocationIQ found something, but it didn't match expected city/bairro.
            // If we had original coordinates, keep them. Otherwise, mark as mismatch.
            if (finalLat && finalLon) { // Original coordinates were present
                status = "corrected"; // Consider it corrected if we had original and LocationIQ was ambiguous
                note = "coordenadas-da-planilha-mantidas-locationiq-mismatch";
            } else {
                status = "mismatch";
                note = "resultado-locationiq-nao-coincide-com-cidade-bairro";
            }
          }
        } else {
          // 2c. LocationIQ found nothing. If we had original coordinates, keep them.
          if (finalLat && finalLon) {
            status = "pending"; // Still pending if LocationIQ found nothing, but we have original coords
            note = "coordenadas-da-planilha-mantidas-locationiq-nao-encontrado";
          } else {
            status = "pending";
            note = "nao-encontrado-locationiq";
          }
        }
      } catch (e) {
        note = (note ? note + ";" : "") + "erro-na-requisicao-locationiq";
        console.warn(e);
        // If LocationIQ failed, and we had original coordinates, keep them.
        if (!finalLat || !finalLon) { // If no original coordinates either, then it's truly pending
            status = "pending";
        }
      }
      
      results.push({
        ...row,
        originalAddress: row.rawAddress || "",
        correctedAddress: finalDisplayName || row.rawAddress, // Use finalDisplayName or rawAddress
        latitude: finalLat,
        longitude: finalLon,
        status,
        searchUsed,
        note,
        display_name: finalDisplayName
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