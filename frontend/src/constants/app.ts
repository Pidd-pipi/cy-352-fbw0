export const APP_NAME = "桌游吧社交平台";
export const APP_CODE = "lpboardgame";
export const API_BASE_URL = "/api";
export const FRONTEND_PORT = 28512;
export const BACKEND_PORT = 29512;

export const APP_THEME = {
  paper: "#f4f7fb",
  ink: "#19212e",
  accent: "#3268b8",
  warm: "#cf5c36",
  surface: "#dfe8f4",
};

/** 营业时段：10:00 - 24:00 */
export const BUSINESS_START_HOUR = 10;
export const BUSINESS_END_HOUR = 24;

export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function formatSlot(startHour: number, endHour: number): string {
  return `${String(startHour).padStart(2, "0")}:00 - ${String(endHour).padStart(2, "0")}:00`;
}
