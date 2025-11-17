import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const LOCATIONIQ_API_URL = "https://us1.locationiq.com/v1/search.php";
const RATE_LIMIT_DELAY = 500; // 0.5 seconds to respect 2 requests per second limit
const DEFAULT_COUNTRY_CODE = "Brazil"; // For LocationIQ, use full country name
const DISTANCE_THRESHOLD_METERS = 50; // If coordinates differ by more than 50 meters, use geocoded.

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
    bairroMatches = gBairro.includes(expBairro) || expBairro.includes(expBairro);
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

function parseCoordinate(coordString: string | undefined | null): number | undefined {
  if (!coordString) return undefined;
  const cleanedString = String(coordString).replace(',', '.').trim();
  const parsed = parseFloat(cleanedString);
  return isNaN(parsed) ? undefined : parsed;
}

// Helper for approximate distance calculation (meters) using Haversine formula
function getApproximateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180; // φ, λ in radians
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  const d = R * c; // in metres
  return d;
}

serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204
    });
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
      let status = "pending";
      let note = "";

      let finalLat: string | undefined = undefined;
      let finalLon: string | undefined = undefined;
      let finalDisplayName: string | undefined = undefined;

      const originalLatNum = parseCoordinate(row.latitude);
      const originalLonNum = parseCoordinate(row.longitude);
      const hasOriginalCoords = originalLatNum !== undefined && originalLonNum !== undefined;

      let locationIqLat: number | undefined = undefined;
      let locationIqLon: number | undefined = undefined;
      let locationIqDisplayName: string | undefined = undefined;
      let locationIqMatch = false;

      // Always attempt LocationIQ search if there's a raw address
      if (row.rawAddress) {
        const fullQuery = buildLocationIQQueryParam(row);
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
              locationIqLat = parseCoordinate(locationIqResult.lat);
              locationIqLon = parseCoordinate(locationIqResult.lon);
              locationIqDisplayName = locationIqResult.display_name;
              locationIqMatch = true;
            } else {
              note = (note ? note + ";" : "") + "resultado-locationiq-nao-coincide-com-cidade-bairro";
            }
          } else {
            note = (note ? note + ";" : "") + "nao-encontrado-locationiq";
          }
        } catch (e) {
          note = (note ? note + ";" : "") + "erro-na-requisicao-locationiq";
          console.warn(e);
        }
      }

      // Decision logic
      if (locationIqMatch && locationIqLat !== undefined && locationIqLon !== undefined) {
        // LocationIQ found a good match
        if (hasOriginalCoords) {
          const distance = getApproximateDistance(originalLatNum!, originalLonNum!, locationIqLat, locationIqLon);
          if (distance > DISTANCE_THRESHOLD_METERS) {
            // Significant difference, use geocoded
            finalLat = locationIqLat.toFixed(6);
            finalLon = locationIqLon.toFixed(6);
            finalDisplayName = locationIqDisplayName;
            status = "corrected-by-geocode";
            note = (note ? note + ";" : "") + "coordenadas-corrigidas-por-geocodificacao";
          } else {
            // Small difference, stick with original spreadsheet coords
            finalLat = originalLatNum!.toFixed(6);
            finalLon = originalLonNum!.toFixed(6);
            finalDisplayName = row.rawAddress;
            status = "valid";
            note = (note ? note + ";" : "") + "coordenadas-da-planilha-confirmadas-por-geocodificacao";
          }
        } else {
          // No original coords, use geocoded
          finalLat = locationIqLat.toFixed(6);
          finalLon = locationIqLon.toFixed(6);
          finalDisplayName = locationIqDisplayName;
          status = "valid";
          note = (note ? note + ";" : "") + "geocodificado-locationiq";
        }
      } else if (hasOriginalCoords) {
        // LocationIQ failed or mismatched, but we have valid original coords
        finalLat = originalLatNum!.toFixed(6);
        finalLon = originalLonNum!.toFixed(6);
        finalDisplayName = row.rawAddress;
        status = "valid";
        note = (note ? note + ";" : "") + "coordenadas-da-planilha";
      } else {
        // No valid coords from any source
        status = "pending";
        finalDisplayName = row.rawAddress; // Keep original address if no coords
        note = (note ? note + ";" : "") + "nao-foi-possivel-obter-coordenadas";
      }
      
      results.push({
        ...row,
        originalAddress: row.rawAddress || "",
        correctedAddress: finalDisplayName || row.rawAddress, // Ensure correctedAddress is always set
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