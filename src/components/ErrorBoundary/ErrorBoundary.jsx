import { Component } from 'react';
import styles from './ErrorBoundary.module.css';

// App-wide crash screen. Before this existed, any uncaught render/effect
// throw unmounted the whole tree and left a blank white page -- worst case
// mid-rally-build, with no hint of what happened or how to get back. This
// can't recover the broken subtree, but it can name the error and offer a
// reload; the autosaved currentDraft (rbr-rally-creator-web#6) means a
// reload usually resumes right where the build left off. A class component
// because React still has no hook equivalent for error boundaries.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch() {
    // Nothing to do beyond what getDerivedStateFromError already captured --
    // there's no error-reporting service to forward to, and React itself
    // still logs the error + component stack to the console. Kept (empty)
    // because its presence is what marks this class as a boundary that
    // "handled" the error, rather than one React should treat as unhandled.
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.crash} role="alert">
          <h1 className={styles.heading}>Something broke</h1>
          <p className={styles.message}>
            {this.state.error?.message || String(this.state.error)}
          </p>
          <button
            type="button"
            className={styles.reloadButton}
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
