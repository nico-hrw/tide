import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    decryptSecuredEnvelope,
    encryptSecuredEnvelope,
    isExplicitlyUnencryptedFile,
    stripSensitiveFileMetadata,
} from '@/lib/e2eePayload';
import { encryptMetadata } from '@/lib/crypto';
import { encryptContentV2 } from '@/hooks/autoSaveHelpers';
import { wrapDEKData, generateDEK } from '@/lib/cryptoV2';
import { parseTodosResponse } from '@/store/slices/createFsSlice';
import { useDataStore } from '@/store/useDataStore';

describe('K-02 Full E2EE Enforcement & Envelope Roundtrip', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        useDataStore.setState({
            tasks: [],
            notes: [],
            events: [],
            publicKey: null,
            privateKey: null,
            myId: 'user-k02',
            activeSafes: ['main'],
            defaultSafe: 'main',
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    async function generateTestKeypair() {
        return window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    it('encryptSecuredEnvelope handles >2 KB event and todo payloads without RSA size errors', async () => {
        const pair = await generateTestKeypair();
        const largeDescription = 'A'.repeat(2500);
        const payload = {
            title: 'Geheimer Arzttermin & Projektplanung',
            start: '2026-12-01T09:00:00Z',
            end: '2026-12-01T10:30:00Z',
            description: largeDescription,
            recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1',
            exdates: ['2026-12-08', '2026-12-15'],
            completed_dates: ['2026-12-01'],
            safe: 'Privat',
        };

        const encoded = await encryptSecuredEnvelope(payload, pair.publicKey);
        expect(encoded).not.toContain('Geheimer Arzttermin');
        expect(encoded).not.toContain(largeDescription.slice(0, 32));

        const decoded = await decryptSecuredEnvelope(encoded, pair.privateKey);
        expect(decoded.isLocked).not.toBe(true);
        expect(decoded.title).toBe(payload.title);
        expect(decoded.description).toBe(largeDescription);
        expect(decoded.exdates).toEqual(payload.exdates);
        expect(decoded.safe).toBe('Privat');
    });

    it('decryptSecuredEnvelope remains compatible with legacy V1 RSA-OAEP and V2 DEK-bound envelopes', async () => {
        const pair = await generateTestKeypair();

        // 1. Legacy V1 RSA-OAEP
        const legacyV1 = await encryptMetadata({ title: 'Legacy V1 Titel' }, pair.publicKey, 'test-v1');
        const decV1 = await decryptSecuredEnvelope(legacyV1, pair.privateKey);
        expect(decV1.title).toBe('Legacy V1 Titel');

        // 2. DEK-bound { data, iv } (from ShareModal rotation)
        const dek = await generateDEK();
        const rawDek = await window.crypto.subtle.exportKey('raw', dek);
        const wrapped = await wrapDEKData(rawDek, pair.publicKey);
        const dekBound = await encryptContentV2(JSON.stringify({ title: 'Rotated DEK Titel', tagIds: ['t1'] }), dek);

        const decDekBound = await decryptSecuredEnvelope(dekBound, pair.privateKey, {
            myId: 'user-k02',
            accessKeys: { 'user-k02': { wrapped_key: wrapped.ciphertext } },
        });
        expect(decDekBound.title).toBe('Rotated DEK Titel');
        expect(decDekBound.tagIds).toEqual(['t1']);
    });

    it('stripSensitiveFileMetadata removes all confidential keys while retaining safe flags', () => {
        const dirty = {
            title: 'Secret',
            safe: 'Privat',
            linkedSafes: ['Work'],
            tagIds: ['tag-1'],
            tags: ['secret'],
            start: '2026-12-01T10:00:00Z',
            end: '2026-12-01T11:00:00Z',
            description: 'Sensitive',
            recurrence_rule: 'FREQ=DAILY',
            exdates: ['2026-12-02'],
            completed_dates: ['2026-12-01'],
            has_custom_password: true,
            pwd_salt: 'salt123',
            pin_hash: 'hash123',
            unencrypted: false,
            deleted_at: '2026-12-03T00:00:00Z',
            isGroup: true,
        };

        expect(stripSensitiveFileMetadata(dirty)).toEqual({
            has_custom_password: true,
            pwd_salt: 'salt123',
            pin_hash: 'hash123',
            unencrypted: false,
            deleted_at: '2026-12-03T00:00:00Z',
            isGroup: true,
        });
    });

    it('isExplicitlyUnencryptedFile refuses unencrypted access while secured_meta still exists', () => {
        expect(
            isExplicitlyUnencryptedFile({
                visibility: 'private',
                metadata: { unencrypted: true },
                secured_meta: 'still-present',
            })
        ).toBe(false);

        expect(
            isExplicitlyUnencryptedFile({
                visibility: 'private',
                metadata: { unencrypted: true },
                secured_meta: '',
            })
        ).toBe(true);
    });

    it('createTodosSlice encrypts addTask & updateTask payloads and parseTodosResponse decrypts them', async () => {
        const pair = await generateTestKeypair();
        const sentBodies: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
        let storedEncryptedPayload = '';

        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = (init?.method || 'GET').toUpperCase();
            if (typeof init?.body === 'string') {
                const parsed = JSON.parse(init.body) as Record<string, unknown>;
                sentBodies.push({ url, method, body: parsed });
                if (typeof parsed.encrypted_payload === 'string') {
                    storedEncryptedPayload = parsed.encrypted_payload;
                }
            }
            return new Response(JSON.stringify({ id: 'todo-uuid-1' }), { status: 201 });
        });
        globalThis.fetch = fetchMock as unknown as typeof fetch;

        useDataStore.setState({ publicKey: pair.publicKey, privateKey: pair.privateKey, myId: 'user-k02' });

        const createdId = await useDataStore.getState().addTask({
            title: 'Geheime Steuererklärung',
            description: 'PIN im Tresor',
            dueDate: '2026-12-15',
            safe: 'Finanzen',
            tags: ['Steuern'],
            isCompleted: false,
        });

        expect(sentBodies).toHaveLength(1);
        const postBody = sentBodies[0].body;
        expect(postBody.is_encrypted).toBe(true);
        expect(typeof postBody.encrypted_payload).toBe('string');
        expect(postBody.title).toBeUndefined();
        expect(postBody.description).toBeUndefined();
        expect(postBody.due_date).toBeUndefined();
        expect(postBody.safe).toBeUndefined();
        expect(JSON.stringify(postBody)).not.toContain('Geheime Steuererklärung');

        await useDataStore.getState().updateTask(createdId, { isCompleted: true, description: 'Erledigt' }, { strict: true });
        expect(sentBodies).toHaveLength(2);
        expect(sentBodies[1].method).toBe('PUT');
        expect(sentBodies[1].body.is_encrypted).toBe(true);
        expect(sentBodies[1].body.title).toBeUndefined();

        const serverRes = new Response(
            JSON.stringify([
                {
                    id: createdId,
                    user_id: 'user-k02',
                    title: '',
                    is_encrypted: true,
                    encrypted_payload: storedEncryptedPayload,
                },
            ]),
            { status: 200 }
        );
        const parsed = await parseTodosResponse(serverRes, pair.privateKey);
        expect(parsed.ok).toBe(true);
        expect(parsed.items).toHaveLength(1);
        expect(parsed.items[0].title).toBe('Geheime Steuererklärung');
        expect(parsed.items[0].description).toBe('Erledigt');
        expect(parsed.items[0].isCompleted).toBe(true);
        expect(parsed.items[0].dueDate).toBe('2026-12-15');
        expect(parsed.items[0].safe).toBe('Finanzen');
        expect(parsed.items[0].tags).toEqual(['Steuern']);
    });
});
