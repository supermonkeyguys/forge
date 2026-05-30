// Load .env in development (Node.js 21+ built-in, no dotenv needed)
try { (process as any).loadEnvFile(new URL('../.env', import.meta.url)) } catch {}

import { server } from './server.js'

const PORT = process.env.PORT ?? '3001'
server.listen(PORT, () => {
  console.log(`forge agent service listening on :${PORT}`)
})
