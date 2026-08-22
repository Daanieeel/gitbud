import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useSettingsStore } from "@/store/useSettingsStore";

/** Sends an OS notification if the user has desktop notifications enabled, requesting
 * permission on first use. Silently no-ops if the user declines or settings disable it. */
export async function notify(title: string, body: string): Promise<void> {
  if (!useSettingsStore.getState().settings.desktop_notifications) return;
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  if (granted) sendNotification({ title, body });
}
