// App — holds shared state, persistence, and screen routing.

import React from 'react';
import type { AppState } from './domainTypes';
import type { AppRepository } from './ports';
import type { ScreenId, ScreenProps } from './screenTypes';
import type { AuthSession } from './auth';
import {
  completeHostedUiCallback,
  getAuthConfig,
  isDevAuthEnabled,
  loadAuthSession,
  startDevLogin,
  startHostedUiLogout,
} from './auth';
import {
  createGoal, createHabitGroup, createHabitItem, createWishCategory, createWishItem,
  deleteGoal, deleteHabitGroup, deleteHabitItem, deleteWishCategory, deleteWishItem,
  fetchReflections, fetchTodayState, getApiConfig, saveGoalLog, saveHabitItemLog, saveNotification,
  saveReflection, updateGoal, updateHabitGroup, updateHabitItem, updateWishCategory, updateWishItem,
} from './apiClient';
import { getTodayISO } from './infrastructure';
import { advanceDailyState } from './domain';
import { defaultState } from './migration';
import BottomNav from './components/BottomNav';
import LoginScreen   from './screens/LoginScreen';
import HomeScreen    from './screens/HomeScreen';
import GoalsScreen   from './screens/GoalsScreen';
import HabitsScreen  from './screens/HabitsScreen';
import HistoryScreen from './screens/HistoryScreen';
import WishesScreen  from './screens/WishesScreen';

const SCREENS: Record<ScreenId, React.ComponentType<ScreenProps>> = {
  home:    HomeScreen,
  goals:   GoalsScreen,
  habits:  HabitsScreen,
  history: HistoryScreen,
  wishes:  WishesScreen,
};

export default function App() {
  const authConfig = React.useMemo(() => getAuthConfig(), []);
  const apiConfig = React.useMemo(() => getApiConfig(), []);
  const [authSession, setAuthSession] = React.useState<AuthSession | null>(() => loadAuthSession());
  const [authLoading, setAuthLoading] = React.useState(true);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [screen, setScreen] = React.useState<ScreenId>('home');
  const [state,  setState]  = React.useState<AppState>(() => {
    const initial = defaultState();
    const today = getTodayISO();
    return advanceDailyState(initial, initial.streakDate, today);
  });

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const repo = React.useMemo<AppRepository | null>(() => {
    if (!apiConfig || !authSession) return null;
    return {
      saveReflection: (date, payload) => saveReflection(apiConfig, authSession, date, payload),
      listReflections: range => fetchReflections(apiConfig, authSession, range),
      saveGoalLog: (date, goalId, payload) => saveGoalLog(apiConfig, authSession, date, goalId, payload),
      saveHabitItemLog: (date, habitItemId, payload) => saveHabitItemLog(apiConfig, authSession, date, habitItemId, payload),
      createGoal: payload => createGoal(apiConfig, authSession, payload),
      updateGoal: (goalId, payload) => updateGoal(apiConfig, authSession, goalId, payload),
      deleteGoal: goalId => deleteGoal(apiConfig, authSession, goalId),
      createHabitGroup: payload => createHabitGroup(apiConfig, authSession, payload),
      updateHabitGroup: (groupId, payload) => updateHabitGroup(apiConfig, authSession, groupId, payload),
      deleteHabitGroup: groupId => deleteHabitGroup(apiConfig, authSession, groupId),
      createHabitItem: (groupId, payload) => createHabitItem(apiConfig, authSession, groupId, payload),
      updateHabitItem: (itemId, payload) => updateHabitItem(apiConfig, authSession, itemId, payload),
      deleteHabitItem: itemId => deleteHabitItem(apiConfig, authSession, itemId),
      saveNotification: (itemId, payload) => saveNotification(apiConfig, authSession, itemId, payload),
      createWishCategory: payload => createWishCategory(apiConfig, authSession, payload),
      updateWishCategory: (categoryId, payload) => updateWishCategory(apiConfig, authSession, categoryId, payload),
      deleteWishCategory: categoryId => deleteWishCategory(apiConfig, authSession, categoryId),
      createWishItem: (categoryId, payload) => createWishItem(apiConfig, authSession, categoryId, payload),
      updateWishItem: (itemId, payload) => updateWishItem(apiConfig, authSession, itemId, payload),
      deleteWishItem: itemId => deleteWishItem(apiConfig, authSession, itemId),
      reloadToday: async () => setState(await fetchTodayState(apiConfig, authSession)),
    };
  }, [apiConfig, authSession]);

  React.useEffect(() => {
    let cancelled = false;
    async function completeAuth() {
      if (!authConfig) {
        setAuthLoading(false);
        return;
      }
      try {
        const session = await completeHostedUiCallback(authConfig, new URL(window.location.href));
        if (!cancelled) setAuthSession(session);
      } catch (error) {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : 'Failed to complete login.');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    void completeAuth();
    return () => { cancelled = true; };
  }, [authConfig]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (!authSession) return;
      if (!apiConfig) {
        setDataError('API接続設定がありません。');
        return;
      }
      setDataLoading(true);
      setDataError(null);
      try {
        const nextState = await fetchTodayState(apiConfig, authSession);
        if (!cancelled) setState(nextState);
      } catch (error) {
        if (!cancelled) setDataError(error instanceof Error ? error.message : 'Failed to load data.');
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [apiConfig, authSession]);

  // Detect midnight rollover while the app is open.
  React.useEffect(() => {
    function checkRollover() {
      const today = getTodayISO();
      setState(s => s.streakDate === today ? s : advanceDailyState(s, s.streakDate, today));
    }
    document.addEventListener('visibilitychange', checkRollover);
    window.addEventListener('focus', checkRollover);
    return () => {
      document.removeEventListener('visibilitychange', checkRollover);
      window.removeEventListener('focus', checkRollover);
    };
  }, []);

  function goto(s: ScreenId) {
    setScreen(s);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }

  function logout() {
    if (authConfig) startHostedUiLogout(authConfig);
    else setAuthSession(null);
  }

  function devLogin() {
    if (isDevAuthEnabled()) setAuthSession(startDevLogin());
  }

  const ScreenComp = SCREENS[screen];

  if (authLoading) {
    return (
      <div className="kit-phone">
        <div className="kit-screen nh-app">
          <div className="kit-login">
            <div className="nh-muted">ログイン状態を確認しています…</div>
          </div>
        </div>
      </div>
    );
  }

  if (!authSession) {
    return (
      <div className="kit-phone">
        <div className="kit-screen nh-app">
          <LoginScreen authConfig={authConfig} error={authError} onDevLogin={devLogin} />
        </div>
      </div>
    );
  }

  if (dataLoading || dataError || !repo) {
    return (
      <div className="kit-phone">
        <div className="kit-screen nh-app">
          <div className="kit-login">
            <div className="kit-login__brand">
              <div className="kit-login__name">NINJA <span>HABITS</span></div>
            </div>
            <div className="nh-muted" style={{ fontSize: 13, lineHeight: 1.7, textAlign: 'center' }}>
              {dataLoading ? 'データを読み込んでいます…' : dataError}
            </div>
            {dataError && (
              <button className="nh-btn nh-btn--primary" style={{ marginTop: 20 }} onClick={logout}>
                ログアウト
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kit-phone">
      <div className="kit-screen nh-app" ref={scrollRef}>
        <ScreenComp state={state} setState={setState} goto={goto} onLogout={logout} repo={repo} />
      </div>
      <BottomNav screen={screen} onChange={goto} />
    </div>
  );
}
