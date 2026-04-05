import { describe, expect, it } from 'vitest'
import { getEventSelectionIndex } from './even-events'

describe('getEventSelectionIndex', () => {
  it('reads currentSelectItemIndex directly when provided', () => {
    expect(getEventSelectionIndex({
      listEvent: {
        currentSelectItemIndex: 2,
      },
    })).toBe(2)
  })

  it('recovers currentSelectItemIndex from listEvent jsonData when the sdk omits it', () => {
    expect(getEventSelectionIndex({
      listEvent: {
        jsonData: '{"currentSelectItemIndex":0}',
      },
    })).toBe(0)
  })

  it('recovers nested currentSelectItemIndex from outer event jsonData', () => {
    expect(getEventSelectionIndex({
      jsonData: '{"listEvent":{"currentSelectItemIndex":1}}',
    })).toBe(1)
  })
})
