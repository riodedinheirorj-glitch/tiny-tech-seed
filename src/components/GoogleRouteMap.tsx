/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { MapPin, Navigation, Route, Loader2, X } from "lucide-react";

interface Delivery {
  id: string;
  original_address: string;
  corrected_address?: string;
  geocoded_latitude?: number;
  geocoded_longitude?: number;
  confirmed_latitude?: number;
  confirmed_longitude?: number;
  bairro?: string;
  cidade?: string;
  estado?: string;
  sequence?: string;
  note?: string;
}

interface SelectedAddress {
  delivery: Delivery;
  lat: number;
  lng: number;
}

declare global {
  interface Window {
    google: typeof google;
    initGoogleMap: () => void;
  }
}

export default function GoogleRouteMap() {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<SelectedAddress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [optimizedOrder, setOptimizedOrder] = useState<number[] | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [mapReady, setMapReady] = useState(false);

  // Load Google Maps API key from edge function
  useEffect(() => {
    const loadApiKey = async () => {
      try {
        console.log("Loading Google Maps API key...");
        const { data, error } = await supabase.functions.invoke('google-maps-key');
        if (error) throw error;
        if (data?.apiKey) {
          console.log("API key loaded successfully");
          setApiKey(data.apiKey);
        } else {
          throw new Error("API key not found");
        }
      } catch (error) {
        console.error("Error loading Google Maps API key:", error);
        toast.error("Erro ao carregar chave do Google Maps");
        setIsLoading(false);
      }
    };
    loadApiKey();
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey) return;

    let checkInterval: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (checkInterval) clearInterval(checkInterval);
      if (timeoutId) clearTimeout(timeoutId);
    };

    const onGoogleMapsReady = () => {
      console.log("Google Maps API ready, setting mapReady to true");
      cleanup();
      setMapReady(true);
    };

    // Check if Google Maps is already loaded
    if (window.google?.maps) {
      console.log("Google Maps already loaded");
      onGoogleMapsReady();
      return;
    }

    const existingScript = document.getElementById('google-maps-script');
    
    if (existingScript) {
      console.log("Script exists, polling for google.maps...");
      // Poll for Google Maps to become available
      checkInterval = setInterval(() => {
        if (window.google?.maps) {
          onGoogleMapsReady();
        }
      }, 100);
      
      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        cleanup();
        console.error("Google Maps failed to load within timeout");
        toast.error("Erro ao carregar Google Maps. Recarregue a página.");
        setIsLoading(false);
      }, 10000);
      
      return cleanup;
    }

    // Set up callback for new script
    window.initGoogleMap = () => {
      console.log("initGoogleMap callback fired");
      delete window.initGoogleMap;
      onGoogleMapsReady();
    };

    // Create new script
    console.log("Creating new Google Maps script...");
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initGoogleMap`;
    script.async = true;
    script.defer = true;
    
    script.onerror = () => {
      cleanup();
      delete window.initGoogleMap;
      console.error("Failed to load Google Maps script");
      toast.error("Erro ao carregar Google Maps");
      setIsLoading(false);
    };
    
    document.head.appendChild(script);

    // Timeout for new script loading
    timeoutId = setTimeout(() => {
      if (!window.google?.maps) {
        cleanup();
        delete window.initGoogleMap;
        console.error("Google Maps script timeout");
        toast.error("Tempo esgotado ao carregar Google Maps");
        setIsLoading(false);
      }
    }, 15000);

    return () => {
      cleanup();
      delete window.initGoogleMap;
    };
  }, [apiKey]);

  // Initialize map when Google Maps is ready and mapRef is available
  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    if (mapInstanceRef.current) return; // Already initialized

    console.log("Initializing map...");
    
    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center: { lat: -23.55052, lng: -46.633309 }, // São Paulo
      zoom: 12,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#304a7d" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#255d69" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1626" }] },
      ],
    });

    directionsRendererRef.current = new google.maps.DirectionsRenderer({
      map: mapInstanceRef.current,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#4285F4",
        strokeWeight: 5,
        strokeOpacity: 0.8,
      },
    });

    console.log("Map initialized, loading deliveries...");
    loadDeliveries();
  }, [mapReady]);

  const loadDeliveries = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const { data, error } = await (supabase as any)
        .from("deliveries")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      const deliveriesData = data || [];
      
      // Geocode addresses without coordinates
      const deliveriesToGeocode = deliveriesData.filter(
        (d: Delivery) => !d.geocoded_latitude && !d.geocoded_longitude && !d.confirmed_latitude && !d.confirmed_longitude
      );

      if (deliveriesToGeocode.length > 0) {
        toast.info(`Geocodificando ${deliveriesToGeocode.length} endereços...`);
        await geocodeDeliveries(deliveriesToGeocode);
      }

      // Reload deliveries after geocoding
      const { data: updatedData } = await (supabase as any)
        .from("deliveries")
        .select("*")
        .eq("user_id", user.id);

      setDeliveries(updatedData || []);
      addMarkersToMap(updatedData || []);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading deliveries:", error);
      toast.error("Erro ao carregar endereços");
      setIsLoading(false);
    }
  };

  const geocodeDeliveries = async (deliveriesToGeocode: Delivery[]) => {
    if (!window.google) return;

    const geocoder = new google.maps.Geocoder();

    for (const delivery of deliveriesToGeocode) {
      const address = delivery.corrected_address || delivery.original_address;
      
      try {
        const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          geocoder.geocode({ address: `${address}, Brasil` }, (results, status) => {
            if (status === "OK" && results) {
              resolve(results);
            } else {
              reject(new Error(status));
            }
          });
        });

        if (result[0]) {
          const location = result[0].geometry.location;
          await (supabase as any)
            .from("deliveries")
            .update({
              geocoded_latitude: location.lat(),
              geocoded_longitude: location.lng(),
            })
            .eq("id", delivery.id);
        }
      } catch (error) {
        console.error(`Error geocoding ${address}:`, error);
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };

  const addMarkersToMap = (deliveriesData: Delivery[]) => {
    if (!mapInstanceRef.current || !window.google) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let hasValidCoords = false;

    deliveriesData.forEach((delivery, index) => {
      const lat = delivery.confirmed_latitude || delivery.geocoded_latitude;
      const lng = delivery.confirmed_longitude || delivery.geocoded_longitude;

      if (lat && lng) {
        hasValidCoords = true;
        const position = { lat: Number(lat), lng: Number(lng) };
        bounds.extend(position);

        const marker = new google.maps.Marker({
          position,
          map: mapInstanceRef.current!,
          title: delivery.corrected_address || delivery.original_address,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: "#4285F4",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3,
          },
          label: {
            text: (index + 1).toString(),
            color: "#ffffff",
            fontSize: "10px",
            fontWeight: "bold",
          },
        });

        marker.addListener("click", () => {
          setSelectedAddress({ delivery, lat: Number(lat), lng: Number(lng) });
        });

        markersRef.current.push(marker);
      }
    });

    if (hasValidCoords) {
      mapInstanceRef.current.fitBounds(bounds, 50);
    }
  };

  const generateOptimizedRoute = async () => {
    if (!window.google || !mapInstanceRef.current) return;
    if (deliveries.length < 2) {
      toast.error("Adicione pelo menos 2 endereços para gerar uma rota");
      return;
    }

    setIsLoadingRoute(true);

    try {
      // Get user's current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
      setUserLocation(userPos);

      // Add user location marker
      new google.maps.Marker({
        position: userPos,
        map: mapInstanceRef.current!,
        title: "Sua localização",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "#34A853",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      // Filter deliveries with valid coordinates
      const validDeliveries = deliveries.filter(d => {
        const lat = d.confirmed_latitude || d.geocoded_latitude;
        const lng = d.confirmed_longitude || d.geocoded_longitude;
        return lat && lng;
      });

      if (validDeliveries.length === 0) {
        toast.error("Nenhum endereço com coordenadas válidas");
        setIsLoadingRoute(false);
        return;
      }

      const waypoints = validDeliveries.slice(0, -1).map(d => ({
        location: new google.maps.LatLng(
          Number(d.confirmed_latitude || d.geocoded_latitude),
          Number(d.confirmed_longitude || d.geocoded_longitude)
        ),
        stopover: true,
      }));

      const lastDelivery = validDeliveries[validDeliveries.length - 1];
      const destination = new google.maps.LatLng(
        Number(lastDelivery.confirmed_latitude || lastDelivery.geocoded_latitude),
        Number(lastDelivery.confirmed_longitude || lastDelivery.geocoded_longitude)
      );

      const directionsService = new google.maps.DirectionsService();

      const request: google.maps.DirectionsRequest = {
        origin: userPos,
        destination,
        waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result, status) => {
        if (status === "OK" && result) {
          directionsRendererRef.current?.setDirections(result);
          setOptimizedOrder(result.routes[0].waypoint_order);
          
          // Update markers with optimized order
          const order = result.routes[0].waypoint_order;
          markersRef.current.forEach((marker, idx) => {
            const newIndex = order.indexOf(idx);
            if (newIndex !== -1) {
              marker.setLabel({
                text: (newIndex + 1).toString(),
                color: "#ffffff",
                fontSize: "10px",
                fontWeight: "bold",
              });
            }
          });

          toast.success("Rota otimizada gerada com sucesso!");
        } else {
          console.error("Directions request failed:", status);
          toast.error("Erro ao gerar rota otimizada");
        }
        setIsLoadingRoute(false);
      });
    } catch (error) {
      console.error("Error generating route:", error);
      toast.error("Erro ao obter localização. Verifique as permissões do GPS.");
      setIsLoadingRoute(false);
    }
  };

  const handleNavigate = (delivery: Delivery) => {
    const lat = delivery.confirmed_latitude || delivery.geocoded_latitude;
    const lng = delivery.confirmed_longitude || delivery.geocoded_longitude;
    
    if (!lat || !lng) {
      toast.error("Coordenadas não disponíveis para este endereço");
      return;
    }

    navigate("/navigation", {
      state: {
        destination: { lat: Number(lat), lng: Number(lng) },
        address: delivery.corrected_address || delivery.original_address,
        allDeliveries: optimizedOrder 
          ? optimizedOrder.map(i => deliveries[i]) 
          : deliveries,
      },
    });
  };

  return (
    <div className="relative h-screen w-full">
      {/* Map Container - SEMPRE renderizado para mapRef estar disponível */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Carregando mapa...</p>
          </div>
        </div>
      )}

      {/* Top Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          onClick={generateOptimizedRoute}
          disabled={isLoadingRoute || deliveries.length < 2}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
        >
          {isLoadingRoute ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculando...
            </>
          ) : (
            <>
              <Route className="mr-2 h-4 w-4" />
              Gerar Melhor Rota
            </>
          )}
        </Button>
      </div>

      {/* Stats Badge */}
      <div className="absolute top-4 left-4 z-10">
        <Card className="bg-card/95 backdrop-blur p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">
              {deliveries.length} endereços
            </span>
          </div>
        </Card>
      </div>

      {/* Selected Address Card */}
      {selectedAddress && (
        <Card className="absolute bottom-4 left-4 right-4 z-10 bg-card/95 backdrop-blur p-4 max-w-md mx-auto">
          <button
            onClick={() => setSelectedAddress(null)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
          
          <div className="pr-8">
            <div className="flex items-start gap-3 mb-3">
              <MapPin className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-foreground">
                  {selectedAddress.delivery.sequence || "Endereço"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedAddress.delivery.corrected_address || selectedAddress.delivery.original_address}
                </p>
                {selectedAddress.delivery.bairro && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedAddress.delivery.bairro}, {selectedAddress.delivery.cidade}
                  </p>
                )}
              </div>
            </div>
            
            {selectedAddress.delivery.note && (
              <p className="text-sm text-muted-foreground mb-3 italic">
                "{selectedAddress.delivery.note}"
              </p>
            )}

            <Button
              onClick={() => handleNavigate(selectedAddress.delivery)}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              <Navigation className="mr-2 h-4 w-4" />
              Navegar agora
            </Button>
          </div>
        </Card>
      )}

      {/* Optimized Order Display */}
      {optimizedOrder && (
        <Card className="absolute top-20 left-4 z-10 bg-card/95 backdrop-blur p-3 max-w-xs">
          <h4 className="font-semibold text-sm mb-2">Ordem otimizada:</h4>
          <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
            {optimizedOrder.map((idx, order) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">
                  {order + 1}
                </span>
                <span className="truncate">
                  {deliveries[idx]?.sequence || deliveries[idx]?.original_address?.slice(0, 30)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}