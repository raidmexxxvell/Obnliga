import React, { useEffect } from 'react'
import { LeagueTableView } from '../components/league/LeagueTableView'
import { LeagueSubTab, useAppStore } from '../store/appStore'

const subTabLabels: Record<LeagueSubTab, string> = {
  table: 'Таблица',
  schedule: 'Календарь',
  results: 'Результаты',
  stats: 'Статистика',
}

const EMPTY_PLACEHOLDER: Record<Exclude<LeagueSubTab, 'table'>, string> = {
  schedule: 'Расписание появится чуть позже — мы готовим удобный календарь матчей.',
  results: 'Раздел результатов скоро станет доступен вместе с историей встреч.',
  stats: 'Мы собираем расширенную аналитику по сезонам и клубам — следите за обновлением.',
}

const Placeholder: React.FC<{ message: string }> = ({ message }) => (
  <div className="placeholder">
    <div className="placeholder-card">
      <h2>Раздел в разработке</h2>
      <p>{message}</p>
    </div>
  </div>
)

const LeaguePage: React.FC = () => {
  const seasons = useAppStore(state => state.seasons)
  const fetchSeasons = useAppStore(state => state.fetchLeagueSeasons)
  const fetchTable = useAppStore(state => state.fetchLeagueTable)
  const ensureRealtime = useAppStore(state => state.ensureRealtime)
  const setSelectedSeason = useAppStore(state => state.setSelectedSeason)
  const selectedSeasonId = useAppStore(state => state.selectedSeasonId)
  const activeSeasonId = useAppStore(state => state.activeSeasonId)
  const leagueSubTab = useAppStore(state => state.leagueSubTab)
  const setLeagueSubTab = useAppStore(state => state.setLeagueSubTab)
  const loadingSeasons = useAppStore(state => state.loading.seasons)
  const loadingTable = useAppStore(state => state.loading.table)
  const tableErrors = useAppStore(state => state.errors.table)
  const leagueMenuOpen = useAppStore(state => state.leagueMenuOpen)
  const closeLeagueMenu = useAppStore(state => state.closeLeagueMenu)
  const tableFetchedAt = useAppStore(state => state.tableFetchedAt)
  const tables = useAppStore(state => state.tables)

  const table = selectedSeasonId ? tables[selectedSeasonId] : undefined
  const lastUpdated = selectedSeasonId ? tableFetchedAt[selectedSeasonId] : undefined

  useEffect(() => {
    ensureRealtime()
    void fetchSeasons()
  }, [ensureRealtime, fetchSeasons])

  useEffect(() => {
    if (selectedSeasonId) {
      void fetchTable({ seasonId: selectedSeasonId })
    }
  }, [selectedSeasonId, fetchTable])

  const handleSeasonClick = (seasonId: number) => {
    setSelectedSeason(seasonId)
    closeLeagueMenu()
  }

  const handleSubTabClick = (tab: LeagueSubTab) => {
    setLeagueSubTab(tab)
  }

  const handleRefreshClick = () => {
    if (selectedSeasonId) {
      void fetchTable({ seasonId: selectedSeasonId, force: true })
    }
  }

  useEffect(() => {
    if (!leagueMenuOpen) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLeagueMenu()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [leagueMenuOpen, closeLeagueMenu])

  const handleContentPointerDown = () => {
    if (leagueMenuOpen) {
      closeLeagueMenu()
    }
  }

  return (
    <div className="league-page">
      <aside className={`league-sidebar${leagueMenuOpen ? ' open' : ''}`} aria-hidden={!leagueMenuOpen}>
        <header className="league-sidebar-header">
          <h3>Сезоны</h3>
          {loadingSeasons && <span className="muted">Загружаем…</span>}
        </header>
        <div className="league-season-list" role="list">
          {seasons.map(season => {
            const isActive = season.id === activeSeasonId
            const isSelected = season.id === selectedSeasonId
            return (
              <button
                key={season.id}
                type="button"
                role="listitem"
                className={`season-item${isSelected ? ' selected' : ''}${isActive ? ' active' : ''}`}
                onClick={() => handleSeasonClick(season.id)}
              >
                <span className="season-name">{season.name}</span>
                <span className="muted">{season.competition.name}</span>
                {isActive && <span className="season-chip">Текущий</span>}
              </button>
            )
          })}
          {seasons.length === 0 && !loadingSeasons && (
            <div className="empty-state muted">Сезоны пока не добавлены.</div>
          )}
        </div>
      </aside>
      {leagueMenuOpen && (
        <div className="league-backdrop" role="button" tabIndex={-1} onClick={closeLeagueMenu} />
      )}
      <div
        className={`league-content${leagueMenuOpen ? ' shifted' : ''}`}
        onPointerDownCapture={handleContentPointerDown}
      >
        <nav className="league-subtabs" aria-label="Подвкладки лиги">
          {(Object.keys(subTabLabels) as LeagueSubTab[]).map(key => (
            <button
              key={key}
              type="button"
              className={`subtab-button${leagueSubTab === key ? ' active' : ''}`}
              onClick={() => handleSubTabClick(key)}
            >
              {subTabLabels[key]}
            </button>
          ))}
        </nav>
        {leagueSubTab === 'table' ? (
          <LeagueTableView
            table={table}
            loading={loadingTable}
            error={tableErrors}
            onRetry={handleRefreshClick}
            lastUpdated={lastUpdated}
          />
        ) : (
          <Placeholder message={EMPTY_PLACEHOLDER[leagueSubTab]} />
        )}
      </div>
    </div>
  )
}

export default LeaguePage
