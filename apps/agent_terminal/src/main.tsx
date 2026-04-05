import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App'
import { AgentTerminalApp } from './agent-app'

const rootElement = document.querySelector<HTMLDivElement>('#app')

if (!rootElement) {
  throw new Error('Missing #app')
}

const controller = new AgentTerminalApp()
const root = createRoot(rootElement)
root.render(<App controller={controller} />)
