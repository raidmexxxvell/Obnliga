import { AdminTab, useAdminStore } from '../store/adminStore'
import { TeamsTab } from './tabs/TeamsTab'
import { MatchesTab } from './tabs/MatchesTab'
import { StatsTab } from './tabs/StatsTab'
import { PlayersTab } from './tabs/PlayersTab'
import { UsersTab } from './tabs/UsersTab'

const tabMeta: Record<AdminTab, { title: string; description: string }> = {
  teams: {
    title: 'Команды',
    description: 'Справочники: клубы, люди, стадионы и соревнования.'
  },
  matches: {
    title: 'Матчи',
    description: 'Сезоны, участники, серии, расписание и фиксация результатов.'
  },
  stats: {
    title: 'Статистика',
    description: 'Таблица и индивидуальная статистика по сезонам и карьере.'
  },
  players: {
    title: 'Ростеры и дисквалификации',
    description: 'Регистрация составов по сезонам, контроль заявок и санкций.'
  },
  news: {
    title: 'Пользователи и активность',
    description: 'Управление пользователями, прогнозами и достижениями.'
  }
}

const tabsOrder: AdminTab[] = ['teams', 'matches', 'stats', 'players', 'news']

type StoreState = ReturnType<typeof useAdminStore.getState>

export const DashboardLayout = () => {
  const { logout, activeTab, setTab } = useAdminStore((state: StoreState) => ({
    logout: state.logout,
    activeTab: state.activeTab,
    setTab: state.setTab
  }))

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'teams':
        return <TeamsTab />
      case 'matches':
        return <MatchesTab />
      case 'stats':
        return <StatsTab />
      case 'players':
        return <PlayersTab />
      case 'news':
        return <UsersTab />
      default:
        return null
    }
  }

  return (
    <div className="dashboard-shell neo-accents">
      <div className="shell-header">
        <h2>Обнинск лига — админ</h2>
        <div className="user-badge" role="status" aria-live="polite">
          <span>online</span>
          <button className="tab-button" type="button" onClick={() => logout()}>
            Выйти
          </button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Админские вкладки">
        {tabsOrder.map((tab) => (
          <button
            key={tab}
            className={`tab-button${activeTab === tab ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setTab(tab)}
          >
            {tabMeta[tab].title}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {renderActiveTab()}
      </div>
    </div>
  )
}
