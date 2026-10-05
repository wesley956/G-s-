import { Component, type ReactNode } from 'react';
import { logError } from '../lib/errors';
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch(error:Error) { logError(error); }
  render() { return this.state.failed ? <main className="content"><h1>Não foi possível abrir esta tela</h1><p>Seus dados gravados continuam no banco local.</p><button className="primary-button" onClick={()=>window.location.reload()}>Reabrir aplicativo</button></main> : this.props.children; }
}
