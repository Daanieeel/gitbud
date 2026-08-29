import { Avatar } from "@gitbud/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";

interface AvatarStackProps {
  people: { login: string; avatar_url: string }[];
  className?: string;
}

/** A row of overlapping avatars with a per-person tooltip — used wherever the sidebar shows a
 * set of people (reviewers, assignees) rather than one. */
export function AvatarStack({ people, className }: AvatarStackProps) {
  if (people.length === 0) return null;
  return (
    <div className={className ? `flex items-center ${className}` : "flex items-center"}>
      {people.map((person, i) => (
        <Tooltip key={person.login}>
          <TooltipTrigger asChild>
            <span className={i > 0 ? "-ml-1.5" : ""}>
              <Avatar
                src={person.avatar_url}
                alt={person.login}
                className="size-5 border border-background"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{person.login}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
