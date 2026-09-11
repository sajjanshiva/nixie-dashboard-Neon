import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-[#0F1117]">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <AlertCircle size={28} />
          </div>
          <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Something went wrong</h2>
          <p className="mb-6 max-w-md text-sm text-slate-500 dark:text-slate-400">
            {this.state.error?.message || "An unexpected error occurred while rendering this page."}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-dark active:scale-95"
          >
            <RotateCcw size={16} />
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
