import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import { GitHubMark } from "./GitHubMark";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGitHubStore } from "@/store/useGitHubStore";
import { SignInDialog } from "./SignInDialog";
import { cn } from "@/lib/utils";

export function AccountBar() {
  const accounts = useGitHubStore((s) => s.accounts);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const setCurrentLogin = useGitHubStore((s) => s.setCurrentLogin);
  const removeAccount = useGitHubStore((s) => s.removeAccount);
  const init = useGitHubStore((s) => s.init);

  const [signInOpen, setSignInOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const current = accounts.find((a) => a.login === currentLogin);

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
      {accounts.length === 0 ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setSignInOpen(true)}>
          <GitHubMark className="size-3.5" />
          Sign in with GitHub
        </Button>
      ) : (
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              <img src={current?.avatar_url} alt="" className="size-4 rounded-full" />
              <span className="truncate">{current?.login}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="start">
            {accounts.map((a) => (
              <div
                key={a.login}
                className={cn(
                  "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                  currentLogin === a.login && "bg-accent",
                )}
                onClick={() => {
                  setCurrentLogin(a.login);
                  setSwitcherOpen(false);
                }}
              >
                <img src={a.avatar_url} alt="" className="size-4 rounded-full" />
                <span className="min-w-0 flex-1 truncate">{a.login}</span>
                <button
                  title="Sign out"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeAccount(a.login);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setSwitcherOpen(false);
                  setSignInOpen(true);
                }}
              >
                <GitHubMark className="size-3.5" />
                Add account
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
