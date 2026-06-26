// Presentation types — 画面ルーティングと画面共通 props。
// React など UI 都合の型はここに閉じ込め、Domain / Application から参照しない。

import type { Dispatch, SetStateAction } from 'react';
import type { AppState } from './domainTypes';
import type { AppRepository } from './ports';

/** Screen identifiers for the app router. */
export type ScreenId = 'home' | 'goals' | 'habits' | 'history' | 'wishes';

/** Prop shape shared by all screen components. */
export interface ScreenProps {
  goto: (screen: ScreenId) => void;
  onLogout: () => void;
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  repo: AppRepository;
}
