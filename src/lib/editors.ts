import vscodeIcon from "@/assets/editor-icons/vscode.svg";
import webstormIcon from "@/assets/editor-icons/webstorm.svg";
import rustroverIcon from "@/assets/editor-icons/rustrover.svg";
import intellijIcon from "@/assets/editor-icons/intellij.svg";
import clionIcon from "@/assets/editor-icons/clion.svg";
import pycharmIcon from "@/assets/editor-icons/pycharm.svg";
import phpstormIcon from "@/assets/editor-icons/phpstorm.svg";
import riderIcon from "@/assets/editor-icons/rider.svg";
import golandIcon from "@/assets/editor-icons/goland.svg";
import androidStudioIcon from "@/assets/editor-icons/androidstudio.svg";
import xcodeIcon from "@/assets/editor-icons/xcode.svg";
import zedIcon from "@/assets/editor-icons/zed.png";
import sublimeIcon from "@/assets/editor-icons/sublimetext.png";
import cursorIcon from "@/assets/editor-icons/cursor.svg";

export const CUSTOM_EDITOR_ID = "custom";

export interface EditorOption {
  id: string;
  name: string;
  manufacturer: string;
  icon: string;
}

// Ids must match `EDITORS` in `src-tauri/src/system.rs` exactly.
export const EDITORS: EditorOption[] = [
  { id: "vscode", name: "Visual Studio Code", manufacturer: "Microsoft", icon: vscodeIcon },
  { id: "webstorm", name: "WebStorm", manufacturer: "JetBrains", icon: webstormIcon },
  { id: "rustrover", name: "RustRover", manufacturer: "JetBrains", icon: rustroverIcon },
  { id: "intellij", name: "IntelliJ IDEA", manufacturer: "JetBrains", icon: intellijIcon },
  { id: "clion", name: "CLion", manufacturer: "JetBrains", icon: clionIcon },
  { id: "pycharm", name: "PyCharm", manufacturer: "JetBrains", icon: pycharmIcon },
  { id: "phpstorm", name: "PhpStorm", manufacturer: "JetBrains", icon: phpstormIcon },
  { id: "rider", name: "Rider", manufacturer: "JetBrains", icon: riderIcon },
  { id: "goland", name: "GoLand", manufacturer: "JetBrains", icon: golandIcon },
  { id: "xcode", name: "Xcode", manufacturer: "Apple", icon: xcodeIcon },
  { id: "androidstudio", name: "Android Studio", manufacturer: "Google", icon: androidStudioIcon },
  { id: "zed", name: "Zed", manufacturer: "Other", icon: zedIcon },
  { id: "sublime", name: "Sublime Text", manufacturer: "Other", icon: sublimeIcon },
  { id: "cursor", name: "Cursor", manufacturer: "Other", icon: cursorIcon },
];

// Display order for the grouped popover — not alphabetical, biggest/most-relevant group first.
export const MANUFACTURER_ORDER = ["Microsoft", "JetBrains", "Apple", "Google", "Other"];

export function findEditor(id: string | null | undefined): EditorOption | undefined {
  return EDITORS.find((e) => e.id === id);
}
