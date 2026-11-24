import { useCallback, useReducer } from 'react'
import type { SetStateAction } from 'react'
import type { PosLayout } from './pos-layout'

type State = {
  past: PosLayout[]
  present: PosLayout
  future: PosLayout[]
  gesture: PosLayout | null
}
type Action =
  | { type: 'set'; value: SetStateAction<PosLayout> }
  | { type: 'reset'; value: PosLayout }
  | { type: 'undo' | 'redo' | 'begin' | 'end' }
const equal = (a: PosLayout, b: PosLayout) => JSON.stringify(a) === JSON.stringify(b)
function reducer(state: State, action: Action): State {
  if (action.type === 'reset') return { past: [], present: action.value, future: [], gesture: null }
  if (action.type === 'begin') return state.gesture ? state : { ...state, gesture: state.present }
  if (action.type === 'end')
    return !state.gesture
      ? state
      : {
          ...state,
          past: equal(state.gesture, state.present)
            ? state.past
            : [...state.past, state.gesture].slice(-100),
          gesture: null,
        }
  if (action.type === 'set') {
    const value = typeof action.value === 'function' ? action.value(state.present) : action.value
    if (equal(value, state.present)) return state
    return {
      ...state,
      present: value,
      past: state.gesture ? state.past : [...state.past, state.present].slice(-100),
      future: [],
    }
  }
  if (state.gesture) return state
  if (action.type === 'undo' && state.past.length)
    return {
      ...state,
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future].slice(0, 100),
    }
  if (action.type === 'redo' && state.future.length)
    return {
      ...state,
      past: [...state.past, state.present].slice(-100),
      present: state.future[0],
      future: state.future.slice(1),
    }
  return state
}
export function useLayoutHistory(initial: PosLayout) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
    gesture: null,
  })
  return {
    config: state.present,
    set: useCallback((value: SetStateAction<PosLayout>) => dispatch({ type: 'set', value }), []),
    reset: useCallback((value: PosLayout) => dispatch({ type: 'reset', value }), []),
    undo: () => dispatch({ type: 'undo' }),
    redo: () => dispatch({ type: 'redo' }),
    begin: () => dispatch({ type: 'begin' }),
    end: () => dispatch({ type: 'end' }),
    canUndo: !state.gesture && !!state.past.length,
    canRedo: !state.gesture && !!state.future.length,
  }
}
