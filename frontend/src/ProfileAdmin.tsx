import React, { useState } from 'react'

interface ProfileAdminProps {
  user: any
  onUpdate?: (updatedUser: any) => void
}

export default function ProfileAdmin({ user, onUpdate }: ProfileAdminProps) {
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    tgUsername: user?.tgUsername || '',
    photoUrl: user?.photoUrl || ''
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!user?.userId) return

    setSaving(true)
    try {
      const metaEnv: any = (import.meta as any).env || {}
      const backend = metaEnv.VITE_BACKEND_URL || ''
      const updateUrl = backend 
        ? `${backend.replace(/\/$/, '')}/api/users/${user.userId}` 
        : `/api/users/${user.userId}`

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session')}`
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const updatedUser = await response.json()
        console.log('Profile updated via API:', updatedUser)
        
        // Уведомляем родительский компонент
        if (onUpdate) {
          onUpdate(updatedUser)
        }
        
        setEditing(false)
      } else {
        console.error('Failed to update profile:', await response.text())
        alert('Ошибка при сохранении профиля')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      alert('Ошибка сети при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      tgUsername: user?.tgUsername || '',
      photoUrl: user?.photoUrl || ''
    })
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="profile-admin">
        <button 
          className="edit-profile-btn"
          onClick={() => setEditing(true)}
        >
          ✏️ Редактировать профиль
        </button>
      </div>
    )
  }

  return (
    <div className="profile-admin editing">
      <h3>Редактирование профиля</h3>
      
      <div className="form-group">
        <label>Имя пользователя:</label>
        <input
          type="text"
          value={formData.tgUsername}
          onChange={(e) => setFormData(prev => ({ ...prev, tgUsername: e.target.value }))}
          placeholder="Введите имя"
        />
      </div>

      <div className="form-group">
        <label>URL фото:</label>
        <input
          type="url"
          value={formData.photoUrl}
          onChange={(e) => setFormData(prev => ({ ...prev, photoUrl: e.target.value }))}
          placeholder="https://example.com/photo.jpg"
        />
        {formData.photoUrl && (
          <div className="photo-preview">
            <img src={formData.photoUrl} alt="Preview" width={50} height={50} />
          </div>
        )}
      </div>

      <div className="form-actions">
        <button 
          className="save-btn"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '💾 Сохранение...' : '💾 Сохранить'}
        </button>
        <button 
          className="cancel-btn"
          onClick={handleCancel}
          disabled={saving}
        >
          ❌ Отмена
        </button>
      </div>
    </div>
  )
}