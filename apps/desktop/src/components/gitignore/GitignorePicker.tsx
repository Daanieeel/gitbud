import { LogoMultiSelect, type LogoMultiSelectGroup } from "@gitbud/ui/logo-multi-select";
import { GITIGNORE_TEMPLATES, type GitignoreCategory } from "@/lib/gitignore-templates";

const CATEGORY_ORDER: GitignoreCategory[] = [
  "Languages",
  "Frameworks",
  "Editors & IDEs",
  "Operating Systems",
];

const GROUPS: LogoMultiSelectGroup[] = CATEGORY_ORDER.map((category) => ({
  label: category,
  options: GITIGNORE_TEMPLATES.filter((t) => t.category === category)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((t) => ({ value: t.id, label: t.label, icon: t.icon })),
}));

interface GitignorePickerProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

/** Thin wrapper pre-wiring the generic LogoMultiSelect primitive to the gitignore template
 * catalog. Centralized here (rather than inline in the create-repo dialog) so the planned
 * in-app ".gitignore" tab can reuse the exact same picker and data later. */
export function GitignorePicker({ selected, onChange, className }: GitignorePickerProps) {
  return (
    <LogoMultiSelect
      groups={GROUPS}
      selected={selected}
      onChange={onChange}
      placeholder=".gitignore templates"
      searchPlaceholder="Search templates…"
      className={className}
    />
  );
}
