import { reactive } from 'vue'
import { createCancellations } from './模型'
export const cancellationSession = reactive({ records: createCancellations() })
