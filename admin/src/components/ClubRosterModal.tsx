import { FormEvent, useEffect, useMemo, useState } from 'react'
import { fetchClubPlayers, updateClubPlayers } from '../api/adminClient'
import { Club, ClubPlayerLink, Person } from '../types'

type ClubRosterModalProps = {
  club: Club
  token: string | undefined
  persons: Person[]
  onClose: () => void
  onSaved: (players: ClubPlayerLink[]) => void
}

type EditablePlayer = {
  personId: number
  defaultShirtNumber: number | null
  person: Person
}

export const ClubRosterModal = ({ club, token, persons, onClose, onSaved }: ClubRosterModalProps) => {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [playersOnly, setPlayersOnly] = useState(true)
  const [selectedAvailable, setSelectedAvailable] = useState<number[]>([])
  const [roster, setRoster] = useState<EditablePlayer[]>([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchClubPlayers(token, club.id)
        if (!mounted) return
        const next = data.map((entry) => ({
          personId: entry.personId,
          defaultShirtNumber: entry.defaultShirtNumber ?? null,
          person: entry.person
        }))
        setRoster(next)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Не удалось загрузить состав'
        if (mounted) setError(message)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [club.id, token])

  const availablePersons = useMemo(() => {
    return persons.filter((person) => {
      if (playersOnly && !person.isPlayer) return false
      if (roster.some((entry) => entry.personId === person.id)) return false
      if (!search) return true
      const haystack = `${person.lastName} ${person.firstName}`.toLowerCase()
      return haystack.includes(search.toLowerCase())
    })
  }, [persons, roster, search, playersOnly])

  const handleAddSelected = () => {
    if (!selectedAvailable.length) return
    const takenNumbers = new Set<number>()
    roster.forEach((entry) => {
      if (typeof entry.defaultShirtNumber === 'number' && entry.defaultShirtNumber > 0) {
        takenNumbers.add(entry.defaultShirtNumber)
      }
    })

    const nextEntries: EditablePlayer[] = []
    selectedAvailable.forEach((personId) => {
      const person = persons.find((item) => item.id === personId)
      if (!person) return
      let nextNumber = 1
      while (takenNumbers.has(nextNumber)) {
        nextNumber += 1
      }
      takenNumbers.add(nextNumber)
      nextEntries.push({
        personId,
        defaultShirtNumber: nextNumber,
        person
      })
    })

    if (nextEntries.length) {
      setRoster((prev) => [...prev, ...nextEntries])
    }
    setSelectedAvailable([])
  }

  const handleRemove = (personId: number) => {
    setRoster((prev) => prev.filter((entry) => entry.personId !== personId))
  }

  const handleNumberChange = (personId: number, value: string) => {
    const numeric = value.replace(/[^0-9]/g, '')
    const parsed = numeric ? Math.min(999, Number(numeric)) : null
    setRoster((prev) =>
      prev.map((entry) =>
        entry.personId === personId
          ? {
              ...entry,
              defaultShirtNumber: parsed
            }
          : entry
      )
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!roster.length) {
      if (!window.confirm('Состав пуст. Очистить список игроков клуба?')) return
    }
    try {
      setSaving(true)
      setError(null)
      const payload = {
        players: roster.map((entry) => ({
          personId: entry.personId,
          defaultShirtNumber:
            typeof entry.defaultShirtNumber === 'number' && entry.defaultShirtNumber > 0
              ? entry.defaultShirtNumber
              : null
        }))
      }
      const data = await updateClubPlayers(token, club.id, payload)
      const nextRoster = data.map((entry) => ({
        personId: entry.personId,
        defaultShirtNumber: entry.defaultShirtNumber ?? null,
        person: entry.person
      }))
      setRoster(nextRoster)
      onSaved(data)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сохранить состав'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="club-roster-title">
      <div className="modal-card">
        <header className="modal-header">
          <div>
            <h4 id="club-roster-title">Состав клуба «{club.name}»</h4>
            <p>Управляйте заявочным списком клуба. Эти данные используются в мастере создания сезона.</p>
          </div>
          <button className="button-secondary" type="button" onClick={onClose} disabled={saving}>
            Закрыть
          </button>
        </header>
        <form className="modal-body" onSubmit={handleSubmit}>
          {error ? <div className="inline-feedback error">{error}</div> : null}
          {loading ? <div className="inline-feedback info">Загружаем состав…</div> : null}
          <div className="modal-content-grid">
            <section className="modal-panel">
              <header>
                <h5>Доступные игроки</h5>
                <p>Отфильтруйте список и добавьте несколько игроков за один раз.</p>
              </header>
              <div className="stacked">
                <label>
                  Поиск
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Фамилия или имя" />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={playersOnly}
                    onChange={(event) => setPlayersOnly(event.target.checked)}
                  />
                  Только игроки
                </label>
                <label>
                  Список
                  <select
                    multiple
                    size={12}
                    value={selectedAvailable.map(String)}
                    onChange={(event) => {
                      const options = Array.from(event.target.selectedOptions).map((option) => Number(option.value))
                      setSelectedAvailable(options)
                    }}
                  >
                    {availablePersons.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.lastName} {person.firstName}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button-primary" type="button" onClick={handleAddSelected} disabled={!selectedAvailable.length}>
                  Добавить выбранных
                </button>
              </div>
            </section>
            <section className="modal-panel">
              <header>
                <h5>Текущий состав ({roster.length})</h5>
                <p>Настройте игровые номера и удалите лишних игроков.</p>
              </header>
              <div className="roster-list">
                {roster.length === 0 ? (
                  <p className="empty-placeholder">Состав пуст. Добавьте игроков из списка слева.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Игрок</th>
                        <th>№</th>
                        <th aria-label="Действия" />
                      </tr>
                    </thead>
                    <tbody>
                      {roster.map((entry) => (
                        <tr key={entry.personId}>
                          <td>
                            {entry.person.lastName} {entry.person.firstName}
                          </td>
                          <td>
                            <input
                              className="number-input"
                              inputMode="numeric"
                              pattern="[0-9]*"
                                value={entry.defaultShirtNumber ?? ''}
                              onChange={(event) => handleNumberChange(entry.personId, event.target.value)}
                            />
                          </td>
                          <td className="table-actions">
                            <button type="button" className="danger" onClick={() => handleRemove(entry.personId)}>
                              Удалить
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
          <footer className="modal-footer">
            <button className="button-secondary" type="button" onClick={onClose} disabled={saving}>
              Отмена
            </button>
            <button className="button-primary" type="submit" disabled={saving}>
              {saving ? 'Сохраняем…' : 'Сохранить состав'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
