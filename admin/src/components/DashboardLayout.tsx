import { Fragment } from 'react'
import { AdminTab, useAdminStore } from '../store/adminStore'
import { TabPlaceholder } from './TabPlaceholder'

const tabMeta: Record<AdminTab, { title: string; description: string }> = {
  teams: {
    title: 'Команды',
    description: 'Управление клубами, тренерами и атрибутами клуба. Компоненты будут подключены позднее.'
  },
  matches: {
    title: 'Матчи',
    description: 'Планирование и редактирование матчей, контроль live-статуса, синхронизация с realtime.'
  },
  stats: {
    title: 'Статистика',
    description: 'Графики и агрегаты лиги. Здесь появятся метрики после подключения источников данных.'
  },
  players: {
    title: 'Управление игроками',
    description: 'Реестр игроков, трансферы и статусы. Пока отображается заглушка.'
  },
  news: {
    title: 'Новости',
    description: 'Панель редактора новостей. Интеграция с CMS находится в планировании.'
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
      <div className="tab-content" role="tabpanel">
        {tabsOrder.map((tab) => (
          <Fragment key={tab}>
            {activeTab === tab ? (
              <TabPlaceholder title={tabMeta[tab].title} description={tabMeta[tab].description} />
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
