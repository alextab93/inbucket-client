import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../css/base.css'
import '../css/hero.css'
import '../css/inbucket.css'
import '../css/responsive.css'
import { App } from './App'

const root = document.getElementById('root')

if (!root) throw new Error('Application root is missing')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
