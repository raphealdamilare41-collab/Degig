import { httpsCallable } from 'firebase/functions'
import { functions } from './Firebase.js'

export const askDegigAi = async ({ prompt, history }) => {
  if (!functions) throw new Error('Firebase must be configured before using Degig AI.')

  const ask = httpsCallable(functions, 'askDegigAi', { timeout: 60000 })
  const response = await ask({ prompt, history })
  const answer = response.data?.answer
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('Degig AI did not return an answer. Please try again.')
  }
  return answer.trim()
}
