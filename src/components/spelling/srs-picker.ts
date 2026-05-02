// Tiny client helper around /api/student/spelling-game/next-word.
// Returns the chosen word's ID, or null on failure (caller falls back to random).

export async function pickNextWordViaSrs(
    wordIds: string[],
    excludeWordIds: string[],
): Promise<string | null> {
    if (wordIds.length === 0) return null;
    try {
        const res = await fetch('/api/student/spelling-game/next-word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wordIds, excludeWordIds }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data.wordId === 'string' ? data.wordId : null;
    } catch {
        return null;
    }
}
