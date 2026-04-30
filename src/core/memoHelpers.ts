import type { MemoRecord } from './memoTypes';

export function getMemoContent(memo: MemoRecord | undefined): string {
	return memo?.content ?? '';
}

export function setMemoContent(memo: MemoRecord | undefined, content: string): MemoRecord | undefined {
	if (!content && !memo?.materialized) return undefined;
	return { content, ...(memo?.materialized ? { materialized: memo.materialized } : {}) };
}

export function hasContent(memo: MemoRecord | undefined): boolean {
	if (!memo) return false;
	return memo.content.length > 0 || memo.materialized !== undefined;
}
