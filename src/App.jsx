import { lazy, Suspense } from 'react'
import Splash from './Splash.jsx'

const Login = lazy(() => import('./Login.jsx'))
const Signup = lazy(() => import('./Signup.jsx'))
const Chat = lazy(() => import('./assets/Chat.jsx'))

const App = () => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  if (path === '/') return <Splash />

  const Page = path === '/signup'
    ? Signup
    : path === '/login'
      ? Login
      : path === '/chat'
        ? Chat
        : Splash

  return (
    <Suspense fallback={<main className="route-loading" role="status">Loading Degig…</main>}>
      <Page />
    </Suspense>
  )
}

export default App
