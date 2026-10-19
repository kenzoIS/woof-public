import { clearApiCache, logoutDashboard } from './api';
const ENDED = 'woofSessionEnded';
let ending: Promise<void> | undefined;
export function sessionHasEnded() { return sessionStorage.getItem(ENDED) === 'true'; }
export function beginDashboardSession() {
  sessionStorage.removeItem(ENDED);
  sessionStorage.setItem('woofLastActivity', String(Date.now()));
  ending = undefined;
  clearApiCache();
}
export function endDashboardSession(reason: 'logout' | 'session_timeout') {
  sessionStorage.setItem(ENDED, 'true');
  sessionStorage.removeItem('woofSessionActive');
  sessionStorage.removeItem('woofUserEmail');
  clearApiCache();
  if (!ending) ending = logoutDashboard(reason).then(() => undefined).finally(() => { ending = undefined; });
  return ending;
}
