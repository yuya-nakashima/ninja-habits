// 5-tab bottom navigation.

import type { ScreenId } from '../screenTypes';
import { I } from './Icons';

interface BottomNavProps {
  screen: ScreenId;
  onChange: (screen: ScreenId) => void;
}

export default function BottomNav({ screen, onChange }: BottomNavProps) {
  const tabs: { id: ScreenId; label: string; icon: string }[] = [
    { id: 'home',    label: 'Today',   icon: 'home'    },
    { id: 'goals',   label: 'Goals',   icon: 'target'  },
    { id: 'habits',  label: 'Habits',  icon: 'list'    },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'wishes',  label: 'Wishes',  icon: 'heart'   },
  ];
  return (
    <div className="nh-bottomnav">
      {tabs.map(t => {
        const Icon = I[t.icon];
        return (
          <button key={t.id}
            className={`nh-bottomnav__tab${screen === t.id ? ' is-active' : ''}`}
            onClick={() => onChange(t.id)}>
            <Icon width={22} height={22} />
            <span className="nh-bottomnav__label">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
