"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback: React.ReactNode;
};

type State = {
  hasError: boolean;
};

export class ClientErrorBoundary extends React.Component<Props, State> {
  override state: State = {
    hasError: false
  };

  static getDerivedStateFromError(): State {
    return {
      hasError: true
    };
  }

  override componentDidCatch(error: Error) {
    console.error("Client boundary caught an error", error);
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
