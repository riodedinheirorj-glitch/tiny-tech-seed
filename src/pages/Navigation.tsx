/// <reference types="@types/google.maps" />
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  ArrowUp, 
  ArrowLeft, 
  ArrowRight, 
  RotateCcw, 
  X, 
  Volume2, 
  VolumeX,
  MapPin,
  Clock,
  Navigation as NavIcon
} from "lucide-react";

interface NavigationState {
  destination: { lat: number; lng: number };
  address: string;
  allDeliveries?: any[];
}

declare global {
  interface Window {
    google: typeof google;
  }
}

export default function Navigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as NavigationState;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [currentInstruction, setCurrentInstruction] = useState<string>("");
  const [nextInstruction, setNextInstruction] = useState<string>("");
  const [distanceToNext, setDistanceToNext] = useState<string>("");
  const [totalDistance, setTotalDistance] = useState<string>("");
  const [totalDuration, setTotalDuration] = useState<string>("");
  const [isMuted, setIsMuted] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [steps, setSteps] = useState<google.maps.DirectionsStep[]>([]);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);

  // Speech synthesis
  const speak = useCallback((text: string) => {
    if (isMuted || !text) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    window.speechSynthesis.speak(utterance);
  }, [isMuted]);

  // Load API key
  useEffect(() => {
    if (!state?.destination) {
      toast.error("Destino não especificado");
      navigate(-1);
      return;
    }

    const loadApiKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-maps-key');
        if (error) throw error;
        if (data?.apiKey) {
          setApiKey(data.apiKey);
        }
      } catch (error) {
        console.error("Error loading API key:", error);
        toast.error("Erro ao carregar Google Maps");
        setIsLoading(false);
      }
    };
    loadApiKey();
  }, [state, navigate]);

  // Initialize map
  useEffect(() => {
    if (!apiKey || !mapRef.current) return;

    const initMap = () => {
      if (!window.google || !mapRef.current) return;

      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center: state.destination,
        zoom: 16,
        disableDefaultUI: true,
        styles: [
          { elementType: "geometry", stylers: [{ color: "#0f172a" }] },
          { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
          { elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e3a5f" }] },
          { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0f172a" }] },
          { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1e4976" }] },
          { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1929" }] },
          { featureType: "poi", stylers: [{ visibility: "off" }] },
        ],
      });

      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: false,
        polylineOptions: {
          strokeColor: "#3b82f6",
          strokeWeight: 6,
          strokeOpacity: 1,
        },
      });

      // Destination marker
      new google.maps.Marker({
        position: state.destination,
        map: mapInstanceRef.current,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "#ef4444",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });

      startNavigation();
    };

    if (window.google?.maps) {
      initMap();
    } else {
      const checkGoogle = setInterval(() => {
        if (window.google?.maps) {
          clearInterval(checkGoogle);
          initMap();
        }
      }, 100);
      
      return () => clearInterval(checkGoogle);
    }
  }, [apiKey, state]);

  const startNavigation = useCallback(async () => {
    if (!window.google || !mapInstanceRef.current) return;

    try {
      // Get current position
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const userPos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setUserPosition(userPos);

      // User marker
      userMarkerRef.current = new google.maps.Marker({
        position: userPos,
        map: mapInstanceRef.current!,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 8,
          fillColor: "#22c55e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          rotation: 0,
        },
      });

      // Calculate route
      const directionsService = new google.maps.DirectionsService();
      
      directionsService.route(
        {
          origin: userPos,
          destination: state.destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) {
            directionsRendererRef.current?.setDirections(result);
            
            const route = result.routes[0];
            const leg = route.legs[0];
            
            setSteps(leg.steps);
            setTotalDistance(leg.distance?.text || "");
            setTotalDuration(leg.duration?.text || "");
            
            if (leg.steps.length > 0) {
              const firstStep = leg.steps[0];
              const instruction = firstStep.instructions.replace(/<[^>]*>/g, '');
              setCurrentInstruction(instruction);
              setDistanceToNext(firstStep.distance?.text || "");
              
              if (leg.steps.length > 1) {
                setNextInstruction(leg.steps[1].instructions.replace(/<[^>]*>/g, ''));
              }
              
              speak(`Iniciando navegação. ${instruction} em ${firstStep.distance?.text}`);
            }
            
            setIsLoading(false);
          } else {
            console.error("Directions failed:", status);
            toast.error("Erro ao calcular rota");
            setIsLoading(false);
          }
        }
      );

      // Watch position for real-time updates
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const newPos = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserPosition(newPos);
          
          if (userMarkerRef.current) {
            userMarkerRef.current.setPosition(newPos);
            
            // Update rotation based on heading
            if (pos.coords.heading) {
              const icon = userMarkerRef.current.getIcon() as google.maps.Symbol;
              icon.rotation = pos.coords.heading;
              userMarkerRef.current.setIcon(icon);
            }
          }
          
          // Center map on user
          if (mapInstanceRef.current) {
            mapInstanceRef.current.panTo(newPos);
          }
          
          // Check proximity to next step
          checkProximityToStep(newPos);
        },
        (error) => {
          console.error("Watch position error:", error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 1000,
          timeout: 10000,
        }
      );
    } catch (error) {
      console.error("Error starting navigation:", error);
      toast.error("Erro ao obter localização. Verifique as permissões do GPS.");
      setIsLoading(false);
    }
  }, [state, speak]);

  const checkProximityToStep = useCallback((userPos: { lat: number; lng: number }) => {
    if (steps.length === 0 || currentStepIndex >= steps.length) return;

    const currentStep = steps[currentStepIndex];
    const stepEnd = currentStep.end_location;
    
    // Calculate distance to step end
    const distance = google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(userPos.lat, userPos.lng),
      stepEnd
    );

    // Update distance display
    if (distance < 1000) {
      setDistanceToNext(`${Math.round(distance)} m`);
    } else {
      setDistanceToNext(`${(distance / 1000).toFixed(1)} km`);
    }

    // If within 50 meters of step end, advance to next step
    if (distance < 50 && currentStepIndex < steps.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      
      const nextStep = steps[nextIdx];
      const instruction = nextStep.instructions.replace(/<[^>]*>/g, '');
      setCurrentInstruction(instruction);
      setDistanceToNext(nextStep.distance?.text || "");
      
      if (nextIdx < steps.length - 1) {
        setNextInstruction(steps[nextIdx + 1].instructions.replace(/<[^>]*>/g, ''));
      } else {
        setNextInstruction("Destino");
      }
      
      speak(instruction);
    }

    // Check if arrived at destination
    const destDistance = google.maps.geometry.spherical.computeDistanceBetween(
      new google.maps.LatLng(userPos.lat, userPos.lng),
      new google.maps.LatLng(state.destination.lat, state.destination.lng)
    );

    if (destDistance < 30) {
      speak("Você chegou ao seu destino!");
      toast.success("Você chegou ao destino!");
    }
  }, [steps, currentStepIndex, state, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const recalculateRoute = () => {
    setIsLoading(true);
    setCurrentStepIndex(0);
    startNavigation();
  };

  const getDirectionIcon = () => {
    const instruction = currentInstruction.toLowerCase();
    if (instruction.includes("esquerda") || instruction.includes("left")) {
      return <ArrowLeft className="h-12 w-12" />;
    }
    if (instruction.includes("direita") || instruction.includes("right")) {
      return <ArrowRight className="h-12 w-12" />;
    }
    return <ArrowUp className="h-12 w-12" />;
  };

  if (!state?.destination) {
    return null;
  }

  return (
    <div className="relative h-screen w-full bg-slate-900">
      {/* Map */}
      <div ref={mapRef} className="absolute inset-0" />

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-slate-900 via-slate-900/95 to-transparent p-4 pb-12">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/10"
          >
            <X className="h-6 w-6" />
          </Button>
          
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMuted(!isMuted)}
              className="text-white hover:bg-white/10"
            >
              {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={recalculateRoute}
              className="text-white hover:bg-white/10"
            >
              <RotateCcw className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Current Instruction */}
        <Card className="bg-slate-800/95 border-slate-700 p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-blue-600 text-white">
              {getDirectionIcon()}
            </div>
            <div className="flex-1">
              <p className="text-2xl font-bold text-white">{distanceToNext}</p>
              <p className="text-lg text-slate-300">{currentInstruction}</p>
            </div>
          </div>
          {nextInstruction && (
            <div className="mt-3 pt-3 border-t border-slate-700">
              <p className="text-sm text-slate-400">Depois: {nextInstruction}</p>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent p-4 pt-12">
        <Card className="bg-slate-800/95 border-slate-700 p-4">
          <div className="flex items-center gap-4 mb-3">
            <MapPin className="h-5 w-5 text-red-500" />
            <p className="text-white font-medium truncate">{state.address}</p>
          </div>
          
          <div className="flex justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <NavIcon className="h-4 w-4" />
              <span>{totalDistance}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <Clock className="h-4 w-4" />
              <span>{totalDuration}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 bg-slate-900/90 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white text-lg">Calculando rota...</p>
          </div>
        </div>
      )}
    </div>
  );
}