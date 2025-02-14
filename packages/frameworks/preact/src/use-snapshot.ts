import type { Machine, StateMachine as S } from "@zag-js/core"
import { globalRef, snapshot, subscribe, type Snapshot } from "@zag-js/store"
import { compact, isEqual } from "@zag-js/utils"
import { useSyncExternalStore } from "preact/compat"
import { useCallback, useEffect, useMemo, useRef } from "preact/hooks"
import { createProxy as createProxyToCompare, isChanged } from "proxy-compare"
import { useUpdateEffect } from "./use-update-effect"

const targetCache = globalRef("__zag__targetCache", () => new WeakMap())

export function useSnapshot<
  TContext extends Record<string, any>,
  TState extends S.StateSchema,
  TEvent extends S.EventObject = S.AnyEventObject,
>(
  service: Machine<TContext, TState, TEvent>,
  options?: S.HookOptions<TContext, TState, TEvent>,
): S.State<TContext, TState, TEvent> {
  //
  type State = S.State<TContext, TState, TEvent>

  const { actions, context, sync: notifyInSync } = options ?? {}

  /* -----------------------------------------------------------------------------
   * Subscribe to the service state and create a snapshot of it
   * -----------------------------------------------------------------------------*/

  const lastSnapshot = useRef<Snapshot<State>>()
  const lastAffected = useRef<WeakMap<object, unknown>>()

  const currSnapshot = useSyncExternalStore(
    useCallback((callback) => subscribe(service.state, callback, notifyInSync), [notifyInSync]),
    () => {
      const nextSnapshot = snapshot(service.state)
      try {
        if (
          lastSnapshot.current &&
          lastAffected.current &&
          !isChanged(lastSnapshot.current, nextSnapshot, lastAffected.current, new WeakMap())
        ) {
          return lastSnapshot.current
        }
      } catch {
        // ignore if a promise or something is thrown
      }
      return nextSnapshot
    },
  )

  /* -----------------------------------------------------------------------------
   * Sync actions
   * -----------------------------------------------------------------------------*/

  service.setOptions({ actions })

  /* -----------------------------------------------------------------------------
   * Sync context (if changed) to avoid unnecessary renders
   * -----------------------------------------------------------------------------*/

  const ctx = useMemo(() => compact(context ?? {}), [context])

  useUpdateEffect(() => {
    const entries = Object.entries(ctx)

    const equality = entries.map(([key, value]) => ({
      key,
      curr: value,
      prev: currSnapshot.context[key],
      equal: isEqual(currSnapshot.context[key], value),
    }))

    const allEqual = equality.every(({ equal }) => equal)

    if (!allEqual) {
      // console.log(equality.filter(({ equal }) => !equal))
      service.setContext(ctx)
    }
  }, [ctx])

  const currAffected = new WeakMap()

  useEffect(() => {
    lastSnapshot.current = currSnapshot
    lastAffected.current = currAffected
  })

  const proxyCache = useMemo(() => new WeakMap(), []) // per-hook proxyCache

  return createProxyToCompare(currSnapshot, currAffected, proxyCache, targetCache) as any
}
