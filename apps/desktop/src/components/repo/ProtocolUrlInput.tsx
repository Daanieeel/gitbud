import type { ClipboardEvent } from "react";
import { Input } from "@gitbud/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@gitbud/ui/select";

export type CloneProtocol = "https" | "ssh";

const PROTOCOL_SCHEME = {
  https: "https://",
  ssh: "ssh://",
} satisfies Record<CloneProtocol, string>;

const PROTOCOL_PREFIX_PATTERN = /^(https?|ssh):\/\//i;

interface ProtocolUrlInputProps {
  protocol: CloneProtocol;
  onProtocolChange: (protocol: CloneProtocol) => void;
  path: string;
  onPathChange: (path: string) => void;
  placeholder?: string;
}

/** A protocol picker fused to a text input, so a custom clone URL is composed as
 * `(https:// | ssh://) + host/owner/repo.git` instead of one free-form field. Pasting a URL that
 * already carries its own scheme strips it and switches the picker to match, rather than ending
 * up with a doubled-up "https://https://…" string. */
export function ProtocolUrlInput({
  protocol,
  onProtocolChange,
  path,
  onPathChange,
  placeholder = "host/owner/repo.git",
}: ProtocolUrlInputProps) {
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const match = pasted.match(PROTOCOL_PREFIX_PATTERN);
    if (!match) return;
    e.preventDefault();
    const scheme = match[1].toLowerCase();
    onProtocolChange(scheme === "ssh" ? "ssh" : "https");
    onPathChange(pasted.slice(match[0].length));
  };

  return (
    <div className="flex">
      <Select
        value={protocol}
        onValueChange={(v) => {
          // SAFETY: the only SelectItem values below are "https" and "ssh", so this Select can
          // only ever call back with a CloneProtocol.
          onProtocolChange(v as CloneProtocol);
        }}
      >
        <SelectTrigger className="w-24 shrink-0 rounded-r-none border-r-0" size="sm">
          <SelectValue>{PROTOCOL_SCHEME[protocol]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="https">HTTPS</SelectItem>
          <SelectItem value="ssh">SSH</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={path}
        onChange={(e) => onPathChange(e.target.value)}
        onPaste={handlePaste}
        placeholder={placeholder}
        className="flex-1 rounded-l-none"
      />
    </div>
  );
}
