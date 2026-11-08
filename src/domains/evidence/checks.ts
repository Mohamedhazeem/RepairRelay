/**
 * Mandatory functional checks per demo repair category (client-safe: no node imports).
 */
export const MANDATORY_CHECKS: Record<string, string[]> = {
  DISPLAY_REPLACEMENT: ["display_image", "touch_response", "brightness_control"],
  BATTERY_REPLACEMENT: ["charge_cycle", "battery_health"],
  CHARGING_PORT_REPLACEMENT: ["charging", "data_transfer"],
  CAMERA_REPLACEMENT: ["camera_image", "flash"],
  DIAGNOSTIC_ONLY: ["inspection_report"],
  OTHER: ["device_powers_on"],
};
