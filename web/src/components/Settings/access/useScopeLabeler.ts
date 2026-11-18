import { useMemo } from 'react';
import { useT, useTDynamic } from '../useT';
import type { ScopeLabeler } from './scopes';

/** Uebersetzt technische Scope-Namen in Klartext; die Namen im Request bleiben unveraendert. */
export function useScopeLabeler(): ScopeLabeler {
    const t = useT();
    const td = useTDynamic();
    return useMemo(
        () => ({
            known: (scope) => {
                const key = `scope.${scope}.label`;
                const label = td(key);
                return label === key ? undefined : label;
            },
            all: t('scope.all'),
            safe: (name) => t('scope.safe', { name }),
            folder: (name) => t('scope.folder', { name }),
        }),
        [t, td],
    );
}
