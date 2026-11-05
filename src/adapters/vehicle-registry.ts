/**
 * Adaptador del registro automotor (DNRPA / RUDAC / TAD).
 * En la beta es una simulación: acepta cualquier VIN con formato válido.
 * La versión real reemplaza solo esta implementación.
 */
export interface VehicleRegistry {
  lookup(vin: string, domain?: string): Promise<{ found: boolean; source: string }>;
  notifyBatteryRecycled(passportId: string, vin: string | null): Promise<{ accepted: boolean; reference: string }>;
}

class SimulatedVehicleRegistry implements VehicleRegistry {
  async lookup() {
    return { found: true, source: "simulado" };
  }
  async notifyBatteryRecycled(passportId: string) {
    return { accepted: true, reference: `SIM-${passportId}` };
  }
}

export const vehicleRegistry: VehicleRegistry = new SimulatedVehicleRegistry();
