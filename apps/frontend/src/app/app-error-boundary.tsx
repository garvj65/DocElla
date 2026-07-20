import { Component, type ReactNode } from "react";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
}

interface AppErrorBoundaryState {
  readonly hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Avoid logging potentially sensitive form state.
  }

  override render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">Workspace unavailable</h2>
            <p className="text-sm text-[var(--color-muted)]">
              The workspace hit an unexpected rendering issue.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload workspace
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
