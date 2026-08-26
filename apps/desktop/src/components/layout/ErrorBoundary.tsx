import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";

interface ErrorBoundaryState {
  error: Error | null;
}

/** Catches render/commit-time errors anywhere below it so one broken component can't blank the
 * entire window. Without this, React unmounts the whole tree on any uncaught error; on this
 * app's dark theme that's indistinguishable from the window itself being broken. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
        <TriangleAlertIcon className="size-10 text-destructive" />
        <div className="flex max-w-lg flex-col items-center gap-2 text-center">
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="max-w-full overflow-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {this.state.error.message}
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
