import React, { useState } from 'react';
import { Check, Copy, Plus } from 'lucide-react';
import { SettingsCard, SettingsEmpty, SettingsLinkRow, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, ConfirmButton, Notice, StatusPill } from '../ui/Controls';
import { cx } from '../ui/cx';
import { useLocale, useT } from '../useT';
import { NewTokenForm } from '../access/NewTokenForm';
import { describeScopes } from '../access/scopes';
import { describeLastUsed, formatExpiry, isTokenExpired } from '../access/tokenFormat';
import { useApiTokens, type APITokenItem, type CreatedTokenResponse, type CreateTokenInput } from '../access/useApiTokens';
import { useScopeLabeler } from '../access/useScopeLabeler';

/** Oeffentliche API-Dokumentation (eigene Seite, ohne Login erreichbar). */
export const API_DOCS_PATH = '/docs/api';

function TokenRow({ token }: { token: APITokenItem }) {
    const t = useT();
    const locale = useLocale();
    const labeler = useScopeLabeler();
    const now = new Date();
    const expired = isTokenExpired(token.expires_at, now);
    const used = describeLastUsed(token.last_used_at, now, locale);
    const expiry = formatExpiry(token.expires_at, locale);

    const usedText =
        used.kind === 'never' ? t('access.usedNever')
        : used.kind === 'today' ? t('access.usedToday', { time: used.time })
        : used.kind === 'yesterday' ? t('access.usedYesterday')
        : used.kind === 'days' ? t('access.usedDays', { n: used.days })
        : used.date;
    const expiryText = expiry ? t(expired ? 'access.expiredOn' : 'access.expiresOn', { date: expiry }) : t('access.noExpiry');

    return (
        <div className="px-4 py-3.5">
            <div className={cx(expired && 'opacity-55')}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <b className="font-medium text-t2-ink">{token.name}</b>
                    <code className="font-mono text-[11.5px] text-t2-ink-3">{token.token_prefix}</code>
                    {expired && <StatusPill tone="warn">{t('access.expired')}</StatusPill>}
                </div>
                <div className="mt-0.5 text-[13px] text-t2-ink-2">{describeScopes(token.scopes, labeler)}</div>
                <div className="mt-px text-[12.5px] text-t2-ink-3">
                    {t('access.lastUsed', { when: usedText })} {'·'} {expiryText}
                </div>
            </div>
        </div>
    );
}

export function AccessPage() {
    const t = useT();
    const { tokens, loading, loadFailed, create, revoke } = useApiTokens();
    const [formOpen, setFormOpen] = useState(false);
    const [created, setCreated] = useState<CreatedTokenResponse | null>(null);
    const [copied, setCopied] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);

    const handleCreate = async (input: CreateTokenInput) => {
        const res = await create(input);
        setCreated(res);
        setFormOpen(false);
    };

    const copySecret = async () => {
        if (!created) return;
        try {
            await navigator.clipboard.writeText(created.token);
        } catch {
            /* Zwischenablage nicht verfuegbar: Token bleibt markierbar */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRevoke = async (id: string) => {
        setRevokeError(null);
        try {
            await revoke(id);
            setCreated((c) => (c?.id === id ? null : c));
        } catch (err) {
            setRevokeError(err instanceof Error ? err.message : String(err));
        }
    };

    return (
        <div>
            <SettingsPageHeader title={t('nav.access')} lead={t('page.access.lead')} />
            <SettingsPage>
                <SettingsSection
                    title={t('access.tokens')}
                    hint={t('access.tokensHint')}
                    action={
                        !formOpen && (
                            <Button
                                variant="primary"
                                icon={<Plus className="h-[15px] w-[15px]" />}
                                onClick={() => {
                                    setFormOpen(true);
                                    setCreated(null);
                                }}
                            >
                                {t('access.newTokenShort')}
                            </Button>
                        )
                    }
                >
                    {formOpen && (
                        <div className="mb-3.5">
                            <SettingsCard>
                                <NewTokenForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} />
                            </SettingsCard>
                        </div>
                    )}
                    {created && (
                        <div className="mb-3.5">
                            <SettingsCard>
                                <div className="space-y-2.5 p-4">
                                    <h4 className="text-[15px] font-semibold text-t2-ink">{t('access.created')}</h4>
                                    <p className="text-t2-ink-3">{t('access.createdHint', { name: created.name })}</p>
                                    <div className="flex items-center gap-2 rounded-ui bg-t2-sub px-3 py-2.5 ring-1 ring-t2-line">
                                        <span className="min-w-0 flex-1 select-all break-all font-mono text-[12.5px] text-t2-ink">{created.token}</span>
                                        <Button onClick={copySecret} icon={copied ? <Check className="h-[15px] w-[15px]" /> : <Copy className="h-[15px] w-[15px]" />}>
                                            {copied ? t('common.copied') : t('common.copy')}
                                        </Button>
                                    </div>
                                    <div className="text-right">
                                        <Button onClick={() => setCreated(null)}>{t('common.done')}</Button>
                                    </div>
                                </div>
                            </SettingsCard>
                        </div>
                    )}
                    <SettingsCard>
                        {loading ? (
                            <SettingsEmpty>{t('access.loading')}</SettingsEmpty>
                        ) : loadFailed ? (
                            <SettingsEmpty>{t('access.loadFailed')}</SettingsEmpty>
                        ) : tokens.length === 0 ? (
                            <SettingsEmpty>{t('access.none')}</SettingsEmpty>
                        ) : (
                            tokens.map((tok) => <TokenRow key={tok.id} token={tok} />)
                        )}
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('access.docs')} hint={t('access.docsHint')}>
                    <SettingsCard>
                        <SettingsLinkRow title={t('access.docsRow')} description={t('access.docsRowDesc')} href={API_DOCS_PATH} external />
                    </SettingsCard>
                </SettingsSection>

                <SettingsSection title={t('access.revoke')} hint={t('access.revokeHint')} tone="danger">
                    <SettingsCard tone="danger">
                        {tokens.length === 0 ? (
                            <SettingsEmpty>{t('access.revokeNone')}</SettingsEmpty>
                        ) : (
                            tokens.map((tok) => (
                                <SettingsRow key={tok.id} title={tok.name} description={<code className="font-mono">{tok.token_prefix}</code>}>
                                    <ConfirmButton label={t('access.revokeAction')} confirmLabel={t('access.revokeConfirm')} onConfirm={() => handleRevoke(tok.id)} />
                                </SettingsRow>
                            ))
                        )}
                    </SettingsCard>
                    {revokeError && <div className="mt-3"><Notice tone="error">{t('access.revokeFailed', { error: revokeError })}</Notice></div>}
                </SettingsSection>
            </SettingsPage>
        </div>
    );
}
