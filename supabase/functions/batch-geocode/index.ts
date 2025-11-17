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
  // Keep numbers, alphanumeric, whitespace, hyphens, and commas
  return withNoAccents.toLowerCase().replace(/(av|av\.|avenida)\b/g, "avenida").replace(/\b(r|r\.)\b/g, "rua").replace(/(rod|rod\.|rodovia)\b/g, "rodovia").replace(/\b(proximo a|proximo|próximo a|perto de|em frente ao|ao lado de)\b/g, "").replace(/[^\w\s\-\,]/g, "").replace(/[^\w\s\-\,]/g, "").replace(/\s+/g, " ").trim();
}

// New helper function to detect "quadra e lote" patterns
function isQuadraLote(address: string): boolean {
  if (!address) return false;
  const normalizedAddress = normalizeText(address);
  // Regex para detectar padrões como "q 12 lt 34", "quadra 12 lote 34", "qd 12 l 34"
  // ou "q. 12 l. 34", "q-12 l-34"
  const quadraLotePattern = /\b(q|quadra|qd)\b\s*\d+\s*(e|e\s*|)\s*\b(l|lote|lt)\b\s*\d+/i;
  return quadraLotePattern.test(normalizedAddress);
}

function buildLocationIQQueryParam(row: any) {
  const parts = [];
  // Prioritize rawAddress (Destination Address) as it contains full info
  if (row.rawAddress) parts.push(row.rawAddress);
  // Add bairro, cidade, estado as additional context if available
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

  // Make matching flexible: if expected field is empty, consider it a match
  const cityMatches = !expCity || (gCity && (gCity.includes(expCity) || expCity.includes(gCity)));
  const stateMatches = !expState || (gState && (gState.includes(expState) || expState.includes(gState)));
  const bairroMatches = !expBairro || (gBairro && (gBairro.includes(expBairro) || expBairro.includes(gBairro)));
  
  console.log(`  Matching details:`);
  console.log(`    Expected City: '${expCity}', Got City: '${gCity}', Match: ${cityMatches}`);
  console.log(`    Expected Bairro: '${expBairro}', Got Bairro: '${gBairro}', Match: ${bairroMatches}`);
  console.log(`    Expected State: '${expState}', Got State: '${gState}', Match: ${stateMatches}`);

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
      let finalCorrectedAddress: string | undefined = undefined; 
      let fullGeocodedAddress: string | undefined = undefined; // Stores verbose display_name from LocationIQ

      const originalLatNum = parseCoordinate(row.latitude);
      const originalLonNum = parseCoordinate(row.longitude);
      const hasOriginalCoords = originalLatNum !== undefined && originalLonNum !== undefined;

      let locationIqLat: number | undefined = undefined;
      let locationIqLon: number | undefined = undefined;
      let locationIqDisplayName: string | undefined = undefined;
      let locationIqMatch = false;

      console.log(`--- Processing address ${i + 1} ---`);
      console.log(`  Input rawAddress: '${row.rawAddress}'`);
      console.log(`  Input bairro: '${row.bairro}'`);
      console.log(`  Input cidade: '${row.cidade}'`);
      console.log(`  Input estado: '${row.estado}'`);
      console.log(`  Has original coords: ${hasOriginalCoords} (Lat: ${originalLatNum}, Lon: ${originalLonNum})`);

      // --- Prioritize "quadra e lote" detection ---
      if (row.rawAddress && isQuadraLote(row.rawAddress)) {
        status = "pending";
        finalCorrectedAddress = row.rawAddress; // Keep rawAddress for manual review context
        note = (note ? note + ";" : "") + "quadra-lote-manual-review";
        console.log(`  Detected as 'quadra e lote'. Status: ${status}`);
        // Skip further geocoding for these, they need manual adjustment
      } else {
        // Existing logic for geocoding
        if (row.rawAddress) {
          const fullQuery = buildLocationIQQueryParam(row);
          console.log(`  Full query for LocationIQ: '${fullQuery}'`);
          try {
            searchUsed = "locationiq:" + fullQuery;
            const locationIqResult = await locationiqSearch(fullQuery);
            await sleep(RATE_LIMIT_DELAY);

            if (locationIqResult) {
              const addr = locationIqResult.address || {};
              console.log(`  LocationIQ Result: Lat=${locationIqResult.lat}, Lon=${locationIqResult.lon}, DisplayName='${locationIqResult.display_name}'`);
              console.log(`  LocationIQ Address Details: ${JSON.stringify(addr)}`);

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
                console.log(`  LocationIQ matched expected criteria.`);
              } else {
                note = (note ? note + ";" : "") + "resultado-locationiq-nao-coincide-com-cidade-bairro";
                console.log(`  LocationIQ did NOT match expected criteria. Note: ${note}`);
              }
            } else {
              note = (note ? note + ";" : "") + "nao-encontrado-locationiq";
              console.log(`  LocationIQ found no results. Note: ${note}`);
            }
          } catch (e) {
            note = (note ? note + ";" : "") + "erro-na-requisicao-locationiq";
            console.warn(`  Error during LocationIQ request: ${e}`);
          }
        }

        // Decision logic (after potential LocationIQ search)
        if (locationIqMatch && locationIqLat !== undefined && locationIqLon !== undefined) {
          fullGeocodedAddress = locationIqDisplayName; // Store the verbose name here
          // LocationIQ found a good match
          if (hasOriginalCoords) {
            console.log(`  Has original coords: ${originalLatNum}, ${originalLonNum}`);
            const distance = getApproximateDistance(originalLatNum!, originalLonNum!, locationIqLat, locationIqLon);
            console.log(`  Distance between original and geocoded: ${distance.toFixed(2)} meters`);
            if (distance > DISTANCE_THRESHOLD_METERS) {
              // Significant difference, mark as pending for manual review
              finalLat = originalLatNum!.toFixed(6); // Keep original for context in map editor
              finalLon = originalLonNum!.toFixed(6); // Keep original for context in map editor
              finalCorrectedAddress = row.rawAddress; // Keep rawAddress for manual review context
              status = "pending"; 
              note = (note ? note + ";" : "") + "coordenadas-geocodificadas-diferem-muito-da-planilha-revisao-manual";
              console.log(`  Distance > threshold. Marking as PENDING. Status: ${status}`);
            } else {
              // Small difference, use geocoded display name for grouping, but original coords
              finalLat = originalLatNum!.toFixed(6);
              finalLon = originalLonNum!.toFixed(6);
              finalCorrectedAddress = locationIqDisplayName; // Use standardized name for grouping
              status = "valid";
              note = (note ? note + ";" : "") + "coordenadas-da-planilha-confirmadas-por-geocodificacao";
              console.log(`  Distance <= threshold. Using original coords, geocoded name. Status: ${status}`);
            }
          } else {
            // No original coords, use geocoded display name and coords
            finalLat = locationIqLat.toFixed(6);
            finalLon = locationIqLon.toFixed(6);
            finalCorrectedAddress = locationIqDisplayName; // Use standardized name for grouping
            status = "valid";
            note = (note ? note + ";" : "") + "geocodificado-locationiq";
            console.log(`  No original coords. Using geocoded name and coords. Status: ${status}`);
          }
        } else if (hasOriginalCoords) {
          // LocationIQ failed or mismatched, but we have valid original coords
          finalLat = originalLatNum!.toFixed(6);
          finalLon = originalLonNum!.toFixed(6);
          finalCorrectedAddress = row.rawAddress; // Keep rawAddress as no better alternative
          status = "valid";
          note = (note ? note + ";" : "") + "coordenadas-da-planilha-usadas-geocodificacao-falhou";
          console.log(`  LocationIQ failed, but has original coords. Using original. Status: ${status}`);
        } else {
          // No valid coords from any source (this is the default 'pending' case)
          status = "pending";
          finalCorrectedAddress = row.rawAddress; // Keep rawAddress for manual review context
          note = (note ? note + ";" : "") + "nao-foi-possivel-obter-coordenadas";
          console.log(`  No valid coords from any source. Status: ${status}`);
        }
      }
      
      results.push({
        ...row,
        originalAddress: row.rawAddress || "",
        correctedAddress: finalCorrectedAddress || row.rawAddress, // Ensure correctedAddress is always set
        latitude: finalLat,
        longitude: finalLon,
        status,
        searchUsed,
        note,
        display_name: fullGeocodedAddress // Use the new field for the verbose name
      });
      console.log(`--- Final Status for '${row.rawAddress}': ${status}, Corrected Address: '${finalCorrectedAddress}' ---`);
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