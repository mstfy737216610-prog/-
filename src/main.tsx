import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        dir="rtl"
        position="bottom-center"
        closeButton
        toastOptions={{ className: 'app-toast', duration: 4500 }}
      />
    </BrowserRouter>
  </StrictMode>,
)
