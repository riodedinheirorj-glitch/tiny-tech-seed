import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock } from "lucide-react";

interface DeviceWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void; // Mantém para controle geral do diálogo
  onContinue: () => void; // Nova prop para a ação "Continuar com esse"
  onNavigateToChangePassword: () => void;
}

export function DeviceWarningDialog({ open, onOpenChange, onContinue, onNavigateToChangePassword }: DeviceWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}> {/* Usa onOpenChange aqui */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <AlertTriangle className="h-16 w-16 text-orange-500" />
          </div>
          <DialogTitle className="text-center text-2xl">
            Login em Outro Dispositivo Detectado!
          </DialogTitle>
          <DialogDescription className="text-center text-base pt-4 space-y-3">
            <p>
              Sua conta está sendo acessada de outro dispositivo.
            </p>
            <p className="font-semibold text-orange-400">
              Se não foi você ou se você não autorizou, recomendamos que altere sua senha imediatamente para proteger sua conta.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
          <Button onClick={onContinue} variant="outline" className="w-full sm:w-auto">
            Continuar com esse
          </Button>
          <Button onClick={onNavigateToChangePassword} className="w-full sm:w-auto bg-destructive hover:bg-destructive/90">
            <Lock className="mr-2 h-4 w-4" />
            Alterar Senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}