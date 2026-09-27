import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { UserAnchorType } from '@travel-guide/constants';
import { recordUserAnchors } from '../src/modules/user-anchors';

describe('UserAnchor recorder', () => {
  it('records a group in one idempotent batch and skips empty groups', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const writer = { userAnchor: { createMany } } as unknown as Pick<Prisma.TransactionClient, 'userAnchor'>;

    await recordUserAnchors(writer, ['user-a', 'user-b'], UserAnchorType.FIRST_TEAMED_UP, 'trip-1');
    await recordUserAnchors(writer, [], UserAnchorType.FIRST_TEAMED_UP, 'trip-1');

    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany).toHaveBeenCalledWith({ data: [
      { userId: 'user-a', type: UserAnchorType.FIRST_TEAMED_UP, tripId: 'trip-1' },
      { userId: 'user-b', type: UserAnchorType.FIRST_TEAMED_UP, tripId: 'trip-1' },
    ], skipDuplicates: true });
  });
});
