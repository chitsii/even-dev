import './styles.css'
import { AgentTerminalApp } from './agent-app'

const root = document.querySelector<HTMLDivElement>('#app')

if (!root) {
  throw new Error('Missing #app')
}

const app = new AgentTerminalApp(root)
void app.init()
