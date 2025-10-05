import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import LineupPortal from './LineupPortal'

const root = createRoot(document.getElementById('root')!)
const isLineupPortal = window.location.pathname.startsWith('/lineup')
const RootComponent = isLineupPortal ? LineupPortal : App

root.render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
)
