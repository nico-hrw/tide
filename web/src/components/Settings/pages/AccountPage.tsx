import React, { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { SettingsCard, SettingsPage, SettingsPageHeader, SettingsRow, SettingsSection } from '../ui/SettingsLayout';
import { Button, Chip, ConfirmButton, Notice, TextField } from '../ui/Controls';
import { useT } from '../useT';
import { ProfileSections, type ProfileUser } from '../account/ProfileSections';
import { useVaultBackup } from '../account/useVaultBackup';
import { RecoverySection } from '../account/RecoverySection';
import { PasskeySection } from '../account/PasskeySection';
import { VaultExportSection } from '../account/VaultExportSection';

export interface AccountPageProps {
    userProfile?: ProfileUser;
    onClose: () => void;
    onLogout?: () => void;
}

export function AccountPage({ userProfile, onClose, onLogout }: AccountPageProps) {
    const t = useT();
    const vault = useVaultBackup(userProfile, onLogout);
    const [pin, setPin] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div>
            <SettingsPageHeader title={t('nav.account')} lead={t('page.account.lead')} />
            <SettingsPage>
                <ProfileSections userProfile={userProfile} onClose={onClose} />

                <SettingsSection title={t('vault.section')} hint={t('vault.sectionHint')} action={<Chip>{t('vault.zeroKnowledge')}</Chip>}>
                    <SettingsCard>
                        <SettingsRow title={t('vault.download')} description={t('vault.downloadDesc')}>
                            <Button onClick={vault.exportKey} icon={<Download className="h-[15px] w-[15px]" />}>{t('vault.downloadAction')}</Button>
                        </SettingsRow>
                        <SettingsRow title={t('vault.copy')} description={t('vault.copyDesc')}>
                            <Button onClick={vault.copyKey}>{vault.copied ? t('common.copied') : t('vault.copyAction')}</Button>
                        </SettingsRow>
                        <SettingsRow title={t('vault.import')} description={t('vault.importDesc')}>
                            <Button onClick={() => fileInputRef.current?.click()} icon={<Upload className="h-[15px] w-[15px]" />}>{t('vault.importAction')}</Button>
                            <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={vault.importKey} aria-label={t('vault.import')} />
                        </SettingsRow>
                        <SettingsRow title={t('vault.pin')} description={t('vault.pinDesc')} htmlFor="set-vault-pin">
                            <TextField
                                id="set-vault-pin"
                                type="password"
                                inputMode="numeric"
                                maxLength={5}
                                mono
                                className="text-center sm:!w-24"
                                placeholder="•••••"
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                            />
                            <Button>{t('vault.pinSave')}</Button>
                        </SettingsRow>
                    </SettingsCard>
                    {vault.status && <div className="mt-3"><Notice tone={vault.status.type}>{vault.status.msg}</Notice></div>}
                </SettingsSection>

                <RecoverySection email={userProfile?.email} />

                <PasskeySection email={userProfile?.email} />

                <VaultExportSection />

                <SettingsSection title={t('danger.section')} hint={t('danger.sectionHint')} tone="danger">
                    <SettingsCard tone="danger">
                        <SettingsRow title={t('danger.logout')} description={t('danger.logoutDesc')}>
                            <ConfirmButton label={t('danger.logoutAction')} confirmLabel={t('danger.logoutConfirm')} onConfirm={vault.logout} />
                        </SettingsRow>
                        <SettingsRow title={t('danger.delete')} description={t('danger.deleteDesc')} soon>
                            <Button variant="danger" disabled>{t('danger.deleteAction')}</Button>
                        </SettingsRow>
                    </SettingsCard>
                </SettingsSection>
            </SettingsPage>
        </div>
    );
}
