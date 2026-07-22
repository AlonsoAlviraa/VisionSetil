import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles/global.css'
import './styles/animations.css'
import './styles/premium.css'
import './styles/redesign.css'
import './styles/atelier.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)