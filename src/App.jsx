import Login from './Login.jsx'
import Signup from './Signup.jsx'
import Splash from './Splash.jsx'
import Chat from './assets/Chat.jsx'

const App = () => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'

  if (path === '/signup') return <Signup />
  if (path === '/login') return <Login />
  if (path === '/chat') return <Chat />
  return <Splash />
}

export default App
