# fixes und verbesserungen für tide

## 1. Event Position Fix (bereits teilweise angewendet)
In `WeekView.tsx` Zeile 227-231, die richtige Berechnung sollte sein:
```tsx
const clickY = e.clientY - rect.top + scrollTop;
const hour = Math.floor(clickY / 60);  
const minute = Math.floor((clickY % 60) / 15) * 15;
```
Entferne alle Zeilen die `totalMinutes` verwenden.

## 2. Share Animation
Füge in `ShareModal.tsx` State hinzu:
```tsx
const [sharedContactId, setSharedContactId] = useState<string | null>(null);
```

In `handleShareWithContact`:
```tsx
setSharedContactId(contact.id);
await onShare(contact.email, contact.public_key);
setTimeout(() => onClose(), 800); // Animation time
```

CSS für grünes Aufleuchten bei Kontakt-Button:
```tsx
className={`... ${sharedContactId === contact.id ? 'animate-pulse bg-green-500 text-white' : ''}`}
```

## 3. Chat-Nachricht beim Dateiteilen
In `page.tsx` `performShare` nach erfolgreichem Share:
```tsx
// Send chat notification
await fetch(`/api/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-ID": myId },
    body: JSON.stringify({
        receiver_id: recipientId,  // Benötigt ID vom SearchResult
        type: "file_share",
        content: JSON.stringify({ file_id: fileId, file_name: shareModalFile.title })
    })
});
```

## 4. Öffentliche Dateien klickbar machen
In `handleFileSelect` prüfen ob public und dann `public_meta` direkt verwenden statt zu entschlüsseln.

## 5. Ordner-Bug Fix  
**KRITISCH**: In `handleMoveFile` (page.tsx) muss `parent_id` mitgesendet werden:
```tsx
await fetch(`/api/v1/files/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-User-ID": myId },
    body: JSON.stringify({ parent_id: targetId })  // <-- Das fehlt!
});
```
