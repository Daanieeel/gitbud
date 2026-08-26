import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { queryClient } from "./lib/queryClient";

import "@gitbud/ui/styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element missing from index.html");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
