// Lets a plain (non-React) page mount the React Bits <Lanyard /> into an element.
import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import Lanyard from './Lanyard.jsx';

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    this.props.onError?.(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function mountLanyard(element, initialProps = {}) {
  const root = createRoot(element);
  let current = initialProps;
  const render = () => {
    const { onError, ...props } = current;
    root.render(
      <ErrorBoundary onError={onError}>
        <Lanyard {...props} />
      </ErrorBoundary>
    );
  };
  render();
  return {
    update(nextProps) {
      current = { ...current, ...nextProps };
      render();
    },
    unmount: () => root.unmount()
  };
}
