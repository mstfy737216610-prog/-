import { useEffect, useState } from 'react'
import { Activity, Bot, CalendarClock, Clapperboard, Inbox, LayoutDashboard, Settings, Share2, UsersRound, Waypoints, WifiOff } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { api } from '@/lib/api'
import type { Health } from '@/types'

const navItems = [
  { to: '/', label: 'نظرة عامة', icon: LayoutDashboard },
  { to: '/studio', label: 'الاستوديو', icon: Clapperboard },
  { to: '/facebook', label: 'فيسبوك والمجموعات', icon: Share2 },
  { to: '/queue', label: 'الطابور', icon: CalendarClock },
  { to: '/accounts', label: 'الحسابات', icon: UsersRound },
  { to: '/review', label: 'مراجعة المصادر', icon: Inbox },
  { to: '/assistant', label: 'التعلم والمساعد', icon: Bot },
  { to: '/providers', label: 'البدائل', icon: Waypoints },
  { to: '/activity', label: 'النشاط', icon: Activity },
]
const mobileItems = [navItems[0], navItems[1], navItems[2], navItems[3], { to: '/settings', label: 'الإعدادات', icon: Settings }]

export default function Layout() {
  const [health, setHealth] = useState<Health | null>(null)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    const load = () => api<Health>('/api/health').then(setHealth).catch(() => setHealth(null))
    load(); const timer = window.setInterval(load, 30000)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.clearInterval(timer) }
  }, [])
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">انتقل إلى المحتوى</a>
    <aside className="sidebar">
      <NavLink to="/" className="brand" aria-label="مرسال — الرئيسية">
        <span className="brand-mark">م</span><span><strong>مرسال</strong><small>استوديو وغرفة النشر</small></span>
      </NavLink>
      <nav className="side-nav" aria-label="التنقل الرئيسي">
        {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={19} /><span>{label}</span></NavLink>)}
        <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}><Settings size={19} /><span>الإعدادات</span></NavLink>
      </nav>
      <div className="sidebar-foot"><span className="live-dot" /><span>الإنتاج والتخزين على هذا الجهاز</span><small>الإصدار {health?.version || '—'}</small></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div>{online ? <span className="live-dot" /> : <WifiOff size={16} className="offline-icon" />}<strong>{!online ? 'دون اتصال — الطابور محفوظ' : health?.dry_run || !health?.publishing_enabled ? 'وضع الإنتاج والتصدير' : 'النشر الفعلي مفعّل'}</strong><span className="topbar-detail">{!online ? 'سيستأنف عند عودة الشبكة' : health?.dry_run || !health?.publishing_enabled ? 'لن يُرسل شيء للمنصات' : 'تحقق من كل عملية'}</span></div>
        <NavLink to="/settings" className="icon-btn" aria-label="الإعدادات"><Settings size={20} /></NavLink>
      </header>
      <main id="main-content" className="main-content"><Outlet /></main>
    </div>
    <nav className="mobile-nav" aria-label="التنقل على الهاتف">
      {mobileItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={21} /><span>{label}</span></NavLink>)}
    </nav>
  </div>
}
