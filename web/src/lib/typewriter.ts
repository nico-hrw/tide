/**
 * Changes a text the way a hand would: deletes the old letters one by one, pauses briefly, then types the new
 * letters with an uneven rhythm. `onText` gets every intermediate text; returns a function that stops it.
 */
export function retype(from: string, to: string, onText: (text: string) => void, onDone?: () => void): () => void {
    let current = from;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const wait = (ms: number, fn: () => void) => { timer = setTimeout(() => { if (!stopped) fn(); }, ms); };
    const between = (a: number, b: number) => a + Math.random() * (b - a);

    const type = (i: number) => {
        if (i >= to.length) { onDone?.(); return; }
        current += to[i];
        onText(current);
        wait(between(70, 150) + (Math.random() < 0.18 ? 110 : 0), () => type(i + 1));
    };
    const erase = () => {
        if (current.length > 0) {
            current = current.slice(0, -1);
            onText(current);
            wait(between(45, 105), erase);
        } else {
            wait(between(180, 320), () => type(0));
        }
    };
    erase();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
}
