import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('InsureSphere render error', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
          <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6">
            <h1 className="text-lg font-bold">InsureSphere encountered a display error</h1>
            <p className="mt-2 text-sm text-slate-600">
              The data could not be rendered. Reload the page or return to Synthetic Demo Mode from the Django blueprint page.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
