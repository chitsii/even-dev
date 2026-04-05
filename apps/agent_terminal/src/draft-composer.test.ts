import { describe, expect, it } from 'vitest'
import { appendDraftSegment, composeDraftText, dropLastDraftSegment } from './draft-composer'

describe('draft composer', () => {
  it('composes spoken segments with the manual tail', () => {
    expect(composeDraftText(['one', 'two'], 'three')).toBe('one\ntwo\nthree')
  })

  it('ignores blank segment appends', () => {
    expect(appendDraftSegment(['one'], '   ')).toEqual(['one'])
  })

  it('appends normalized spoken segments', () => {
    expect(appendDraftSegment(['one'], '  two  ')).toEqual(['one', 'two'])
  })

  it('drops only the last spoken segment', () => {
    expect(dropLastDraftSegment(['one', 'two', 'three'])).toEqual(['one', 'two'])
  })
})
