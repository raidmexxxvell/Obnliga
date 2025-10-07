import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { adminDelete, adminPost, adminPut } from '../../api/adminClient'
import { useAdminStore } from '../../store/adminStore'
import { Disqualification, Person } from '../../types'

type PersonFormState = {
  firstName: string
  lastName: string
  isPlayer: boolean
}

type EditPersonFormState = PersonFormState & { id: number | '' }

type DisqualificationFormState = {
  personId: number | ''
  clubId: number | ''
  reason: Disqualification['reason']
  banDurationMatches: number | ''
  sanctionDate: string
}

type FeedbackLevel = 'success' | 'error' | 'info'

const defaultPersonForm: PersonFormState = {
  firstName: '',
  lastName: '',
  isPlayer: true
}

const defaultEditPersonForm: EditPersonFormState = {
  id: '',
  firstName: '',
  lastName: '',
  isPlayer: true
}

const defaultDisqualificationForm: DisqualificationFormState = {
  personId: '',
  clubId: '',
  reason: 'RED_CARD',
  banDurationMatches: '',
  sanctionDate: new Date().toISOString().slice(0, 10)
}

const formatDisqualificationReason = (reason: Disqualification['reason']) => {
  switch (reason) {
    case 'RED_CARD':
      return 'Красная карточка'
    case 'SECOND_YELLOW':
      return 'Вторая жёлтая'
    case 'ACCUMULATED_CARDS':
      return 'Накопление карточек'
    default:
      return 'Другое'
  }
}

export const PlayersTab = () => {
  const {
    token,
    data,
    fetchDictionaries,
    fetchDisqualifications,
    loading,
    error
  } = useAdminStore((state) => ({
    token: state.token,
    data: state.data,
    fetchDictionaries: state.fetchDictionaries,
    fetchDisqualifications: state.fetchDisqualifications,
    loading: state.loading,
    error: state.error
  }))

  const [personForm, setPersonForm] = useState<PersonFormState>(defaultPersonForm)
  const [editPersonForm, setEditPersonForm] = useState<EditPersonFormState>(defaultEditPersonForm)
  const [disqualificationForm, setDisqualificationForm] = useState<DisqualificationFormState>(
    defaultDisqualificationForm
  )
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>('info')
  const [filter, setFilter] = useState('')
  const [showPlayersOnly, setShowPlayersOnly] = useState<boolean>(true)

  const isLoading = Boolean(loading.dictionaries || loading.disqualifications)

  // Одноразовая инициализация словарей и дисквалификаций
  const bootRef = useRef(false)
  useEffect(() => {
    if (!token || bootRef.current) return
    bootRef.current = true
    void fetchDictionaries().catch(() => undefined)
    void fetchDisqualifications().catch(() => undefined)
  }, [token, fetchDictionaries, fetchDisqualifications])

  const handleFeedback = (message: string, level: FeedbackLevel = 'info') => {
    setFeedback(message)
    setFeedbackLevel(level)
  }

  const filteredPersons = useMemo(() => {
    return data.persons.filter((person) => {
      if (showPlayersOnly && !person.isPlayer) return false
      if (!filter) return true
      const target = `${person.lastName} ${person.firstName}`.toLowerCase()
      return target.includes(filter.toLowerCase())
    })
  }, [data.persons, filter, showPlayersOnly])

  const limitedPersons = useMemo(() => filteredPersons.slice(0, 5), [filteredPersons])
  const hasMorePersons = filteredPersons.length > limitedPersons.length

  const handlePersonSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!personForm.firstName.trim() || !personForm.lastName.trim()) {
      handleFeedback('Имя и фамилия обязательны', 'error')
      return
    }
    try {
      await adminPost(token, '/api/admin/persons', {
        firstName: personForm.firstName.trim(),
        lastName: personForm.lastName.trim(),
        isPlayer: personForm.isPlayer
      })
      handleFeedback('Игрок добавлен', 'success')
      setPersonForm(defaultPersonForm)
      await fetchDictionaries()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать запись'
      handleFeedback(message, 'error')
    }
  }

  const handlePersonEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editPersonForm.id) {
      handleFeedback('Выберите игрока для редактирования', 'error')
      return
    }
    try {
      await adminPut(token, `/api/admin/persons/${editPersonForm.id}`, {
        firstName: editPersonForm.firstName.trim() || undefined,
        lastName: editPersonForm.lastName.trim() || undefined,
        isPlayer: editPersonForm.isPlayer
      })
      handleFeedback('Данные игрока обновлены', 'success')
      setEditPersonForm(defaultEditPersonForm)
      await fetchDictionaries()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось обновить запись'
      handleFeedback(message, 'error')
    }
  }

  const handlePersonDelete = async (person: Person) => {
    if (!window.confirm(`Удалить ${person.lastName} ${person.firstName}?`)) return
    try {
      await adminDelete(token, `/api/admin/persons/${person.id}`)
      handleFeedback('Игрок удалён', 'success')
      await fetchDictionaries()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось удалить запись'
      handleFeedback(message, 'error')
    }
  }

  const handleSelectPersonToEdit = (personId: number) => {
    const person = data.persons.find((item) => item.id === personId)
    if (!person) return
    setEditPersonForm({
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      isPlayer: person.isPlayer
    })
  }

  const handleDisqualificationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!disqualificationForm.personId || !disqualificationForm.banDurationMatches) {
      handleFeedback('Укажите игрока и срок дисквалификации', 'error')
      return
    }
    try {
      await adminPost(token, '/api/admin/disqualifications', {
        personId: disqualificationForm.personId,
        clubId: disqualificationForm.clubId || undefined,
        reason: disqualificationForm.reason,
        banDurationMatches: Number(disqualificationForm.banDurationMatches),
        sanctionDate: disqualificationForm.sanctionDate
      })
      handleFeedback('Дисквалификация создана', 'success')
      setDisqualificationForm(defaultDisqualificationForm)
      await fetchDisqualifications()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать дисквалификацию'
      handleFeedback(message, 'error')
    }
  }

  const handleDisqualificationUpdate = async (entry: Disqualification, updates: Partial<Disqualification>) => {
    try {
      await adminPut(token, `/api/admin/disqualifications/${entry.id}`, updates)
      handleFeedback('Запись обновлена', 'success')
      await fetchDisqualifications()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось обновить запись'
      handleFeedback(message, 'error')
    }
  }

  const handleDisqualificationDelete = async (entry: Disqualification) => {
    if (!window.confirm('Удалить запись о дисквалификации?')) return
    try {
      await adminDelete(token, `/api/admin/disqualifications/${entry.id}`)
      handleFeedback('Запись удалена', 'success')
      await fetchDisqualifications()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось удалить запись'
      handleFeedback(message, 'error')
    }
  }

  const activeDisqualifications = data.disqualifications.filter((entry) => entry.isActive)
  const historyDisqualifications = data.disqualifications.filter((entry) => !entry.isActive)

  return (
    <div className="tab-sections">
      <header className="tab-header">
        <div>
          <h3>Игроки и дисциплина</h3>
          <p>Создавайте игроков, обновляйте роли и отслеживайте дисквалификации.</p>
        </div>
        <button className="button-ghost" type="button" disabled={isLoading} onClick={() => Promise.all([fetchDictionaries(), fetchDisqualifications()])}>
          {isLoading ? 'Обновляем…' : 'Обновить данные'}
        </button>
      </header>
      {feedback ? <div className={`inline-feedback ${feedbackLevel}`}>{feedback}</div> : null}
      {error ? <div className="inline-feedback error">{error}</div> : null}

      <section className="card-grid">
        <article className="card">
          <header>
            <h4>Новый игрок</h4>
            <p>Добавьте человека в базу, указав роль.</p>
          </header>
          <form className="stacked" onSubmit={handlePersonSubmit}>
            <label>
              Фамилия
              <input value={personForm.lastName} onChange={(event) => setPersonForm((form) => ({ ...form, lastName: event.target.value }))} required />
            </label>
            <label>
              Имя
              <input value={personForm.firstName} onChange={(event) => setPersonForm((form) => ({ ...form, firstName: event.target.value }))} required />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={personForm.isPlayer}
                onChange={(event) => setPersonForm((form) => ({ ...form, isPlayer: event.target.checked }))}
              />
              Игрок (если снято — персонал/судья)
            </label>
            <button className="button-primary" type="submit">
              Создать
            </button>
          </form>
        </article>

        <article className="card">
          <header>
            <h4>Редактировать игрока</h4>
            <p>Выберите запись из справочника для изменения.</p>
          </header>
          <form className="stacked" onSubmit={handlePersonEditSubmit}>
            <label>
              Игрок
              <select
                value={editPersonForm.id}
                onChange={(event) => {
                  const value = event.target.value ? Number(event.target.value) : ''
                  setEditPersonForm((form) => ({ ...form, id: value }))
                  if (value) handleSelectPersonToEdit(Number(value))
                }}
              >
                <option value="">—</option>
                {data.persons.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.lastName} {person.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Фамилия
              <input
                value={editPersonForm.lastName}
                onChange={(event) => setEditPersonForm((form) => ({ ...form, lastName: event.target.value }))}
              />
            </label>
            <label>
              Имя
              <input
                value={editPersonForm.firstName}
                onChange={(event) => setEditPersonForm((form) => ({ ...form, firstName: event.target.value }))}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={editPersonForm.isPlayer}
                onChange={(event) => setEditPersonForm((form) => ({ ...form, isPlayer: event.target.checked }))}
              />
              Игрок
            </label>
            <div className="form-actions">
              <button className="button-primary" type="submit" disabled={!editPersonForm.id}>
                Сохранить
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setEditPersonForm(defaultEditPersonForm)}
                disabled={!editPersonForm.id}
              >
                Очистить
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <header>
            <h4>Дисквалификации</h4>
            <p>Создавайте и управляйте активными санкциями.</p>
          </header>
          <form className="stacked" onSubmit={handleDisqualificationSubmit}>
            <label>
              Игрок
              <select
                value={disqualificationForm.personId}
                onChange={(event) =>
                  setDisqualificationForm((form) => ({ ...form, personId: event.target.value ? Number(event.target.value) : '' }))
                }
                required
              >
                <option value="">—</option>
                {data.persons
                  .filter((person) => person.isPlayer)
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.lastName} {person.firstName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Клуб (опционально)
              <select
                value={disqualificationForm.clubId}
                onChange={(event) =>
                  setDisqualificationForm((form) => ({ ...form, clubId: event.target.value ? Number(event.target.value) : '' }))
                }
              >
                <option value="">—</option>
                {data.clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.shortName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Причина
              <select
                value={disqualificationForm.reason}
                onChange={(event) =>
                  setDisqualificationForm((form) => ({ ...form, reason: event.target.value as Disqualification['reason'] }))
                }
              >
                <option value="RED_CARD">Красная карточка</option>
                <option value="ACCUMULATED_CARDS">Накопление карточек</option>
                <option value="OTHER">Другое</option>
              </select>
            </label>
            <label>
              Дата
              <input
                type="date"
                value={disqualificationForm.sanctionDate}
                onChange={(event) =>
                  setDisqualificationForm((form) => ({ ...form, sanctionDate: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Матчей пропустить
              <input
                type="number"
                min={1}
                value={disqualificationForm.banDurationMatches}
                onChange={(event) =>
                  setDisqualificationForm((form) => ({
                    ...form,
                    banDurationMatches: event.target.value ? Number(event.target.value) : ''
                  }))
                }
                required
              />
            </label>
            <button className="button-primary" type="submit">
              Создать запись
            </button>
          </form>
        </article>
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <header>
          <h4>Справочник персон</h4>
          <p>Быстрый поиск по размерам базы, переключайте фильтры для роли.</p>
        </header>
        <div className="toolbar">
          <label>
            <input type="search" placeholder="Поиск" value={filter} onChange={(event) => setFilter(event.target.value)} />
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={showPlayersOnly} onChange={(event) => setShowPlayersOnly(event.target.checked)} />
            Только игроки
          </label>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Фамилия</th>
              <th>Имя</th>
              <th>Роль</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {limitedPersons.map((person) => (
              <tr key={person.id}>
                <td>{person.lastName}</td>
                <td>{person.firstName}</td>
                <td>{person.isPlayer ? 'Игрок' : 'Персонал'}</td>
                <td className="table-actions">
                  <button type="button" onClick={() => handleSelectPersonToEdit(person.id)}>
                    Изм.
                  </button>
                  <button type="button" className="danger" onClick={() => handlePersonDelete(person)}>
                    Удал.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredPersons.length ? <p className="muted">Список пуст.</p> : null}
        {hasMorePersons ? <p className="muted">Показаны первые 5 записей, уточните поиск.</p> : null}
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <header>
          <h4>Активные дисквалификации</h4>
          <p>Обновляйте количество пропущенных матчей и закрывайте санкции.</p>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Клуб</th>
              <th>Причина</th>
              <th>Срок</th>
              <th>Отбыто</th>
              <th>Осталось</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {activeDisqualifications.map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.person.lastName} {entry.person.firstName}
                </td>
                <td>{entry.club?.shortName ?? '—'}</td>
                <td>{formatDisqualificationReason(entry.reason)}</td>
                <td>{entry.banDurationMatches}</td>
                <td>{entry.matchesMissed}</td>
                <td>{entry.matchesRemaining}</td>
                <td className="table-actions">
                  <button
                    type="button"
                    onClick={() =>
                      handleDisqualificationUpdate(entry, {
                        matchesMissed: entry.matchesMissed + 1,
                        isActive: entry.matchesMissed + 1 < entry.banDurationMatches
                      })
                    }
                    disabled={entry.matchesRemaining <= 0}
                  >
                    +1 матч
                  </button>
                  <button type="button" onClick={() => handleDisqualificationUpdate(entry, { isActive: false })}>
                    Снять
                  </button>
                  <button type="button" className="danger" onClick={() => handleDisqualificationDelete(entry)}>
                    Удал.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!activeDisqualifications.length ? <p className="muted">Активных дисквалификаций нет.</p> : null}
      </section>

      <section className="card" style={{ gridColumn: '1 / -1' }}>
        <header>
          <h4>История дисквалификаций</h4>
          <p>В архиве показываются завершённые санкции.</p>
        </header>
        <table className="data-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Клуб</th>
              <th>Причина</th>
              <th>Срок</th>
              <th>Отбыто</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {historyDisqualifications.map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.person.lastName} {entry.person.firstName}
                </td>
                <td>{entry.club?.shortName ?? '—'}</td>
                <td>{formatDisqualificationReason(entry.reason)}</td>
                <td>{entry.banDurationMatches}</td>
                <td>{entry.matchesMissed}</td>
                <td className="table-actions">
                  <button type="button" className="danger" onClick={() => handleDisqualificationDelete(entry)}>
                    Удал.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!historyDisqualifications.length ? <p className="muted">История пуста.</p> : null}
      </section>
    </div>
  )
}
