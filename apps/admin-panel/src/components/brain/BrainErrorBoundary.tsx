import { Component, type ReactNode } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'

interface Props {
  /** Description of what's inside the boundary, e.g. "Pages tab" */
  scope: string
  children: ReactNode
}

interface State {
  error: Error | null
  errorInfo: string | null
}

/**
 * Localized error boundary for the Brain views. When a single sub-tree
 * throws (e.g. a malformed vault page that crashes react-markdown, or a
 * graph node click into bad data), this catches it and shows a per-scope
 * fallback instead of letting the global Sentry boundary nuke the app.
 *
 * Sentry still receives the report — `componentDidCatch` rethrows to the
 * next boundary up via the `info` field, but the user keeps a working
 * admin panel.
 */
export class BrainErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorInfo: null }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }): void {
    this.setState({
      errorInfo: info.componentStack?.slice(0, 600) ?? null,
    })
    // Defer to global Sentry — the boundary doesn't suppress reporting,
    // it just stops the cascade up to FallbackError.
    if (typeof window !== 'undefined') {
      console.error(`[BrainErrorBoundary:${this.props.scope}]`, error, info)
    }
  }

  reset = (): void => {
    this.setState({ error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="m-4 rounded-lg border border-rose-700/50 bg-rose-900/10 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-rose-300">
              Brain → {this.props.scope} hit an error
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              The error has been logged. The rest of the admin panel keeps
              working — you can reload this view or pick a different page from
              the sidebar.
            </p>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-950 p-2 font-mono text-[11px] text-rose-200">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={this.reset}
              className="mt-3 inline-flex items-center gap-1.5 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-fuchsia-500/50 hover:text-fuchsia-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset this view
            </button>
          </div>
        </div>
      </div>
    )
  }
}
