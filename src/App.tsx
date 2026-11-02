import { Navigate, Route, Routes } from 'react-router'
import Layout from '@/components/Layout'
import Accounts from '@/pages/Accounts'
import ActivityPage from '@/pages/Activity'
import Assistant from '@/pages/Assistant'
import Dashboard from '@/pages/Dashboard'
import Studio from '@/pages/Studio'
import Queue from '@/pages/Queue'
import Providers from '@/pages/Providers'
import Review from '@/pages/Review'
import FacebookPage from '@/pages/Facebook'
import SettingsPage from '@/pages/Settings'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="studio" element={<Studio />} />
        <Route path="facebook" element={<FacebookPage />} />
        <Route path="queue" element={<Queue />} />
        <Route path="providers" element={<Providers />} />
        <Route path="review" element={<Review />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
