import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Overlay de re-renders en vivo, solo en desarrollo — import dinámico para
// que ni siquiera se incluya en el bundle de producción.
if (import.meta.env.DEV) {
  import("react-scan").then(({ scan }) => scan());
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ color: 'red', padding: 20, whiteSpace: 'pre-wrap', background: '#fff' }}>
          {this.state.error.message}{'\n'}{this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}

function windowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return "main"; // fuera de Tauri (pruebas en el navegador)
  }
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

// La ventana de la captura rápida usa el mismo bundle, pero solo carga su
// formulario: ni `App` ni el store, que son de la ventana principal
// (specs/captura-rapida/design.md).
const entry = windowLabel() === "quick-capture"
  ? import("./extensions/quick-capture/CaptureWindow")
  : import("./App");

entry.then(({ default: Root }) => {
  root.render(
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>,
  );
});
