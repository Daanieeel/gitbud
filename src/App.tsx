function App() {
  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 text-sm">
        <span className="font-semibold">GitBud</span>
        <span className="text-muted-foreground">— repo, branch, sync go here</span>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r border-border p-2 text-sm text-muted-foreground">
          repo sidebar
        </aside>
        <main className="flex min-w-0 flex-1 items-center justify-center text-muted-foreground">
          Changes / History tabs go here
        </main>
      </div>
    </div>
  );
}

export default App;
